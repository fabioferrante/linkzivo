import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { detectConversionPlatform } from "@/lib/conversions";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/conversions
 * Lista paginada do extrato de conversões com isolamento multi-tenant estrito,
 * filtros avançados e consolidação de métricas financeiras.
 */
export async function GET(request: NextRequest) {
  const session = await getSession(request);

  if (!session || !session.workspaceId) {
    return NextResponse.json(
      { error: "Não autenticado. Faça login para acessar o extrato de conversões." },
      { status: 401 }
    );
  }

  const workspaceId = session.workspaceId;
  const searchParams = request.nextUrl.searchParams;

  // 1. Paginação
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20));
  const skip = (page - 1) * limit;

  // 2. Filtros
  const statusParam = searchParams.get("status")?.trim().toUpperCase();
  const searchParam = searchParams.get("search")?.trim();
  const periodParam = searchParams.get("period")?.trim();
  const smartLinkIdParam = searchParams.get("smartLinkId")?.trim();
  const campaignIdParam = searchParams.get("campaignId")?.trim();
  const productIdParam = searchParams.get("productId")?.trim();

  // Cláusula WHERE com isolamento multi-tenant obrigatório no banco
  const where: Prisma.ConversionWhereInput = {
    smartLink: {
      workspaceId,
      ...(smartLinkIdParam ? { id: smartLinkIdParam } : {}),
    },
    ...(campaignIdParam ? { campaignId: campaignIdParam } : {}),
    ...(productIdParam ? { productId: productIdParam } : {}),
  };

  // Filtro por Status Financeiro
  if (statusParam && statusParam !== "ALL") {
    const validStatuses = ["CONFIRMED", "ESTIMATED", "REFUNDED", "CANCELED"];
    if (validStatuses.includes(statusParam)) {
      where.status = statusParam;
    }
  }

  // Filtro Temporal
  if (periodParam && periodParam !== "all") {
    const now = new Date();
    let days = 30;
    if (periodParam === "7d") days = 7;
    else if (periodParam === "30d") days = 30;
    else if (periodParam === "90d") days = 90;
    else if (periodParam === "365d") days = 365;

    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    where.timestamp = { gte: startDate };
  }

  // Filtro de Busca Textual (ID externo, slug, título ou produto)
  if (searchParam) {
    where.OR = [
      { externalConversionId: { contains: searchParam, mode: "insensitive" } },
      { clickId: { contains: searchParam, mode: "insensitive" } },
      { smartLink: { slug: { contains: searchParam, mode: "insensitive" } } },
      { smartLink: { title: { contains: searchParam, mode: "insensitive" } } },
      { product: { name: { contains: searchParam, mode: "insensitive" } } },
    ];
  }

  // 3. Execução Paralela: Contagem Total, Lista Paginada e Métricas Agregadas
  const [totalCount, conversions, aggregateStats] = await Promise.all([
    // Total de registros sob os filtros para paginação
    db.conversion.count({ where }),

    // Registros da página atual com relações de negócio
    db.conversion.findMany({
      where,
      skip,
      take: limit,
      orderBy: { timestamp: "desc" },
      select: {
        id: true,
        externalConversionId: true,
        clickId: true,
        conversionType: true,
        status: true,
        amount: true,
        commissionAmount: true,
        currency: true,
        timestamp: true,
        smartLink: {
          select: {
            id: true,
            slug: true,
            title: true,
            destinationUrl: true,
            domain: true,
          },
        },
        campaign: {
          select: {
            id: true,
            name: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            platform: true,
            brand: true,
            imageUrl: true,
          },
        },
        offer: {
          select: {
            id: true,
            name: true,
          },
        },
        click: {
          select: {
            id: true,
            device: true,
            os: true,
            browser: true,
            country: true,
            isQrScan: true,
            timestamp: true,
          },
        },
      },
    }),

    // Agrupamento por status para consolidar o sumário financeiro exato sem misturar estados
    db.conversion.groupBy({
      by: ["status"],
      where: {
        smartLink: { workspaceId },
        // Se houver filtro temporal ou de link no sumário, respeita
        ...(where.timestamp ? { timestamp: where.timestamp } : {}),
        ...(smartLinkIdParam ? { smartLinkId: smartLinkIdParam } : {}),
      },
      _sum: {
        amount: true,
        commissionAmount: true,
      },
      _count: {
        _all: true,
      },
    }),
  ]);

  // 4. Cálculo do Sumário Financeiro Estrito:
  // - Vendas e Comissões Confirmadas: apenas CONFIRMED
  // - Comissões Estimadas: apenas ESTIMATED
  // - Reembolsos / Estornos: apenas REFUNDED e CANCELED (NUNCA somados como confirmados)
  let confirmedSalesAmount = 0;
  let confirmedCommission = 0;
  let confirmedCount = 0;

  let estimatedCommission = 0;
  let estimatedCount = 0;

  let refundedCommission = 0;
  let refundedSalesAmount = 0;
  let refundedCount = 0;

  let canceledCount = 0;

  aggregateStats.forEach((group) => {
    const sumAmount = group._sum.amount || 0;
    const sumComm = group._sum.commissionAmount || 0;
    const count = group._count._all || 0;

    if (group.status === "CONFIRMED") {
      confirmedSalesAmount += sumAmount;
      confirmedCommission += sumComm;
      confirmedCount += count;
    } else if (group.status === "ESTIMATED") {
      estimatedCommission += sumComm;
      estimatedCount += count;
    } else if (group.status === "REFUNDED") {
      refundedSalesAmount += sumAmount;
      refundedCommission += sumComm;
      refundedCount += count;
    } else if (group.status === "CANCELED") {
      canceledCount += count;
    }
  });

  // Formatação dos registros para entrega à UI com identificação da plataforma
  const formattedConversions = conversions.map((c) => {
    const platformInfo = detectConversionPlatform(c.product?.platform);
    return {
      id: c.id,
      externalConversionId: c.externalConversionId || "N/A",
      clickId: c.clickId,
      conversionType: c.conversionType,
      status: c.status,
      amount: c.amount,
      commissionAmount: c.commissionAmount,
      currency: c.currency,
      timestamp: c.timestamp.toISOString(),
      platform: platformInfo.platform,
      hasAttributionClick: Boolean(c.clickId),
      smartLink: c.smartLink,
      campaign: c.campaign,
      product: c.product,
      offer: c.offer,
      click: c.click,
    };
  });

  return NextResponse.json({
    conversions: formattedConversions,
    pagination: {
      page,
      limit,
      total: totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / limit)),
    },
    summary: {
      totalConversions: totalCount,
      confirmed: {
        count: confirmedCount,
        salesAmount: confirmedSalesAmount,
        commission: confirmedCommission,
      },
      estimated: {
        count: estimatedCount,
        commission: estimatedCommission,
      },
      refunded: {
        count: refundedCount,
        salesAmount: refundedSalesAmount,
        commission: refundedCommission,
      },
      canceled: {
        count: canceledCount,
      },
    },
  });
}

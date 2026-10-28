import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getAnalyticsDateRange } from "@/lib/plans";

export const dynamic = "force-dynamic";

/**
 * GET /api/products/[id]
 * Retorna detalhes do produto, ofertas, campanhas associadas, Smart Links e métricas consolidadas.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession(request);

  if (!session?.workspaceId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // Resolução do plano atual do workspace para aplicar retenção analítica
  const workspace = await db.workspace.findUnique({
    where: { id: session.workspaceId },
    select: { plan: true },
  });
  const currentPlan = workspace?.plan || session.workspacePlan || "FREE";
  const { startDate } = getAnalyticsDateRange(currentPlan, "all");

  const product = await db.product.findFirst({
    where: {
      id,
      workspaceId: session.workspaceId,
    },
    include: {
      offers: {
        orderBy: { createdAt: "desc" },
      },
      campaignProducts: {
        include: {
          campaign: {
            select: {
              id: true,
              name: true,
              status: true,
              createdAt: true,
            },
          },
        },
      },
      smartLinks: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          slug: true,
          title: true,
          destinationUrl: true,
          clickCount: true,
          qrScanCount: true,
          status: true,
          createdAt: true,
          campaign: { select: { id: true, name: true } },
        },
      },
      conversions: {
        where: { timestamp: { gte: startDate } },
        orderBy: { timestamp: "desc" },
        take: 50,
      },
    },
  });

  if (!product) {
    return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  }

  // Links que promovem este produto
  const linkIds = product.smartLinks.map((l) => l.id);

  // Busca cliques reais registrados para os links deste produto respeitando a retenção do plano
  const clicks = linkIds.length > 0
    ? await db.click.findMany({
        where: {
          smartLinkId: { in: linkIds },
          timestamp: { gte: startDate },
        },
        select: {
          id: true,
          smartLinkId: true,
          device: true,
          isQrScan: true,
          timestamp: true,
        },
      })
    : [];

  const totalClicks = clicks.length;
  const totalQrScans = clicks.filter((c) => c.isQrScan).length;

  // Cliques únicos (unicidade por dispositivo + link no dia)
  const uniqueSet = new Set<string>();
  clicks.forEach((c) => {
    const day = c.timestamp.toISOString().split("T")[0];
    uniqueSet.add(`${c.smartLinkId}-${c.device || "desktop"}-${day}`);
  });
  const uniqueClicks = uniqueSet.size;

  // Distribuição por dispositivo
  const devMap: Record<string, number> = {};
  clicks.forEach((c) => {
    const d = c.device || "Outro";
    devMap[d] = (devMap[d] || 0) + 1;
  });
  const deviceBreakdown = Object.entries(devMap).map(([name, count]) => ({
    name,
    count,
    pct: totalClicks ? Math.round((count / totalClicks) * 100) : 0,
  }));

  const confirmedCommission = product.conversions
    .filter((c) => c.status === "CONFIRMED")
    .reduce((acc, c) => acc + (Number.isFinite(c.commissionAmount) ? Math.max(0, c.commissionAmount) : 0), 0);

  const estimatedCommission = product.conversions
    .filter((c) => c.status === "ESTIMATED")
    .reduce((acc, c) => acc + (Number.isFinite(c.commissionAmount) ? Math.max(0, c.commissionAmount) : 0), 0);

  return NextResponse.json({
    product,
    metrics: {
      totalOffers: product.offers.length,
      totalCampaigns: product.campaignProducts.length,
      totalLinks: product.smartLinks.length,
      totalClicks,
      uniqueClicks,
      totalQrScans,
      totalConversions: product.conversions.length,
      confirmedCommission,
      estimatedCommission,
      deviceBreakdown,
    },
  });
}

/**
 * PATCH /api/products/[id]
 * Atualiza metadados do produto e ciclo de vida (status: ACTIVE | INACTIVE).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession(request);

  if (!session?.workspaceId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const product = await db.product.findFirst({
    where: { id, workspaceId: session.workspaceId },
  });

  if (!product) {
    return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { name, description, category, brand, platform, status } = body;

    let newStatus = product.status;
    if (status) {
      if (!["ACTIVE", "INACTIVE", "ARCHIVED"].includes(status)) {
        return NextResponse.json(
          { error: "Status inválido. Use ACTIVE ou INACTIVE." },
          { status: 400 }
        );
      }
      newStatus = status;
    }

    const updated = await db.product.update({
      where: { id },
      data: {
        name: name !== undefined ? name.trim() : product.name,
        description: description !== undefined ? description?.trim() : product.description,
        category: category !== undefined ? category?.trim() : product.category,
        brand: brand !== undefined ? brand?.trim() : product.brand,
        platform: platform !== undefined ? platform : product.platform,
        status: newStatus,
      },
      include: {
        offers: true,
        campaignProducts: {
          include: { campaign: true },
        },
      },
    });

    return NextResponse.json({ success: true, product: updated });
  } catch (err: unknown) {
    console.error("[Update Product Error]", err);
    return NextResponse.json({ error: "Erro ao atualizar produto" }, { status: 500 });
  }
}

/**
 * DELETE /api/products/[id]
 * Remove o produto desvinculando os links sem apagá-los e sem quebrar conversões.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession(request);

  if (!session?.workspaceId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const product = await db.product.findFirst({
    where: { id, workspaceId: session.workspaceId },
  });

  if (!product) {
    return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  }

  // Desvincula Smart Links sem excluí-los
  await db.smartLink.updateMany({
    where: { productId: id },
    data: { productId: null, offerId: null },
  });

  // Remove produto (CampaignProduct é deletado em cascata na junção, mas campanhas e links permanecem)
  await db.product.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

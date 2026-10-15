import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  const workspaceId = session?.workspaceId;

  if (!workspaceId) {
    return NextResponse.json({ campaigns: [] });
  }

  const campaigns = await db.campaign.findMany({
    where: { workspaceId },
    include: {
      product: true,
      offer: true,
      campaignProducts: {
        include: {
          product: {
            include: { offers: true },
          },
        },
      },
      smartLinks: {
        select: {
          id: true,
          slug: true,
          title: true,
          destinationUrl: true,
          status: true,
          clickCount: true,
          qrScanCount: true,
        },
      },
      _count: { select: { smartLinks: true, conversions: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ campaigns });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Faça login para criar campanhas." }, { status: 401 });
  }

  try {
    const { name, description, productId, productIds, offerId, budget, linkIds } =
      await request.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Nome da campanha é obrigatório." }, { status: 400 });
    }

    // Consolidação de produtos
    const selectedProductIds: string[] = Array.isArray(productIds) ? [...productIds] : [];
    if (productId && !selectedProductIds.includes(productId)) {
      selectedProductIds.push(productId);
    }

    // Validação de segurança: garantir que produtos pertencem ao workspace e estão ATIVOS
    if (selectedProductIds.length > 0) {
      const validProducts = await db.product.findMany({
        where: {
          id: { in: selectedProductIds },
          workspaceId: session.workspaceId,
        },
        select: { id: true, status: true, name: true },
      });

      if (validProducts.length !== selectedProductIds.length) {
        return NextResponse.json(
          { error: "Um ou mais produtos selecionados não foram encontrados neste workspace." },
          { status: 400 }
        );
      }

      // Impede produtos desativados em novas campanhas (Requisito mandatório)
      const inactive = validProducts.find((p) => p.status !== "ACTIVE");
      if (inactive) {
        return NextResponse.json(
          { error: `O produto '${inactive.name}' está desativado e não pode ser adicionado a novas campanhas.` },
          { status: 400 }
        );
      }
    }

    // Validação de links selecionados
    const selectedLinkIds: string[] = Array.isArray(linkIds) ? linkIds : [];
    if (selectedLinkIds.length > 0) {
      const validLinks = await db.smartLink.findMany({
        where: {
          id: { in: selectedLinkIds },
          workspaceId: session.workspaceId,
        },
        select: { id: true },
      });

      if (validLinks.length !== selectedLinkIds.length) {
        return NextResponse.json(
          { error: "Um ou mais Smart Links selecionados não pertencem a este workspace." },
          { status: 400 }
        );
      }
    }

    // Criação atômica da campanha com seus produtos e associação dos links
    const campaign = await db.$transaction(async (tx) => {
      const newCamp = await tx.campaign.create({
        data: {
          workspaceId: session.workspaceId,
          name: name.trim(),
          description: description?.trim() || null,
          productId: selectedProductIds[0] || null, // retrocompatibilidade
          offerId: offerId || null,
          budget: budget ? parseFloat(budget) : null,
          status: "ACTIVE",
          campaignProducts: {
            create: selectedProductIds.map((pId) => ({
              productId: pId,
            })),
          },
        },
        include: {
          campaignProducts: {
            include: { product: true },
          },
        },
      });

      // Associa os Smart Links selecionados a esta campanha
      if (selectedLinkIds.length > 0) {
        await tx.smartLink.updateMany({
          where: {
            id: { in: selectedLinkIds },
            workspaceId: session.workspaceId,
          },
          data: {
            campaignId: newCamp.id,
          },
        });
      }

      return newCamp;
    });

    return NextResponse.json({ success: true, campaign }, { status: 201 });
  } catch (err: unknown) {
    console.error("[Create Campaign Error]", err);
    return NextResponse.json({ error: "Erro ao criar campanha." }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/campaigns/[id]
 * Retorna detalhes da campanha, links associados e métricas agregadas reais.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();

  if (!session?.workspaceId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const campaign = await db.campaign.findFirst({
    where: {
      id,
      workspaceId: session.workspaceId,
    },
    include: {
      product: true,
      offer: true,
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
        },
      },
      conversions: {
        orderBy: { timestamp: "desc" },
        take: 20,
      },
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
  }

  const totalClicks = campaign.smartLinks.reduce((acc, l) => acc + l.clickCount, 0);
  const totalQrScans = campaign.smartLinks.reduce((acc, l) => acc + l.qrScanCount, 0);
  const confirmedCommission = campaign.conversions
    .filter((c) => c.status === "CONFIRMED")
    .reduce((acc, c) => acc + c.commissionAmount, 0);

  return NextResponse.json({
    campaign,
    metrics: {
      totalLinks: campaign.smartLinks.length,
      totalClicks,
      totalQrScans,
      totalConversions: campaign.conversions.length,
      confirmedCommission,
    },
  });
}

/**
 * PATCH /api/campaigns/[id]
 * Atualiza dados da campanha.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();

  if (!session?.workspaceId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const campaign = await db.campaign.findFirst({
    where: { id, workspaceId: session.workspaceId },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { name, description, status, budget, productId, offerId } = body;

    const updated = await db.campaign.update({
      where: { id },
      data: {
        name: name !== undefined ? name.trim() : campaign.name,
        description: description !== undefined ? description?.trim() : campaign.description,
        status: status || campaign.status,
        budget: budget !== undefined ? (budget ? parseFloat(budget) : null) : campaign.budget,
        productId: productId !== undefined ? productId || null : campaign.productId,
        offerId: offerId !== undefined ? offerId || null : campaign.offerId,
      },
    });

    return NextResponse.json({ success: true, campaign: updated });
  } catch (err) {
    console.error("[Update Campaign Error]", err);
    return NextResponse.json({ error: "Erro ao atualizar campanha" }, { status: 500 });
  }
}

/**
 * DELETE /api/campaigns/[id]
 * Remove a campanha, desvinculando links sem apagá-los.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();

  if (!session?.workspaceId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const campaign = await db.campaign.findFirst({
    where: { id, workspaceId: session.workspaceId },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
  }

  await db.campaign.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

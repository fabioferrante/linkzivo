import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/campaigns/[id]
 * Retorna detalhes completos da campanha, produtos associados, links e métricas reais.
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
      product: { include: { offers: true } },
      offer: true,
      campaignProducts: {
        include: {
          product: {
            include: { offers: true },
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
          product: { select: { id: true, name: true } },
        },
      },
      conversions: {
        orderBy: { timestamp: "desc" },
        take: 50,
      },
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
  }

  // Agregação de métricas reais dos links desta campanha
  const linkIds = campaign.smartLinks.map((l) => l.id);

  // Busca cliques reais registrados para os links desta campanha
  const clicks = linkIds.length > 0
    ? await db.click.findMany({
        where: { smartLinkId: { in: linkIds } },
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

  // Cliques únicos (usando unicidade por dispositivo + smartLink na janela diária)
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

  // Timeline dos últimos 14 dias
  const timelineMap = new Map<string, { label: string; clicks: number; qrScans: number }>();
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateKey = d.toISOString().split("T")[0];
    const label = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    timelineMap.set(dateKey, { label, clicks: 0, qrScans: 0 });
  }
  clicks.forEach((c) => {
    const dateKey = c.timestamp.toISOString().split("T")[0];
    const entry = timelineMap.get(dateKey);
    if (entry) {
      entry.clicks += 1;
      if (c.isQrScan) entry.qrScans += 1;
    }
  });

  const confirmedCommission = campaign.conversions
    .filter((c) => c.status === "CONFIRMED")
    .reduce((acc, c) => acc + c.commissionAmount, 0);

  return NextResponse.json({
    campaign,
    metrics: {
      totalLinks: campaign.smartLinks.length,
      totalClicks,
      uniqueClicks,
      totalQrScans,
      totalConversions: campaign.conversions.length,
      confirmedCommission,
      deviceBreakdown,
      dailyTimeline: Array.from(timelineMap.entries()).map(([date, d]) => ({
        date,
        label: d.label,
        clicks: d.clicks,
        qrScans: d.qrScans,
      })),
    },
  });
}

/**
 * PATCH /api/campaigns/[id]
 * Atualiza dados da campanha, ciclo de vida (status: ACTIVE | ENDED), e associações de produtos e links.
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
    include: {
      campaignProducts: true,
      smartLinks: { select: { id: true } },
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { name, description, status, budget, productIds, linkIds } = body;

    // Validação de status de ciclo de vida
    let newStatus = campaign.status;
    if (status) {
      if (!["ACTIVE", "PAUSED", "ENDED"].includes(status)) {
        return NextResponse.json(
          { error: "Status inválido. Use ACTIVE, PAUSED ou ENDED." },
          { status: 400 }
        );
      }
      newStatus = status;
    }

    // Execução atômica em transação
    const updated = await db.$transaction(async (tx) => {
      // 1. Atualizar campos básicos da campanha
      const updatedCamp = await tx.campaign.update({
        where: { id },
        data: {
          name: name !== undefined ? name.trim() : campaign.name,
          description: description !== undefined ? description?.trim() : campaign.description,
          status: newStatus,
          budget: budget !== undefined ? (budget ? parseFloat(budget) : null) : campaign.budget,
        },
      });

      // 2. Se productIds foi fornecido, sincronizar tabela CampaignProduct
      if (Array.isArray(productIds)) {
        // Valida que todos os produtos pertencem ao workspace
        if (productIds.length > 0) {
          const validProds = await tx.product.findMany({
            where: {
              id: { in: productIds },
              workspaceId: session.workspaceId,
            },
            select: { id: true, status: true, name: true },
          });

          if (validProds.length !== productIds.length) {
            throw new Error("Um ou mais produtos selecionados não foram encontrados neste workspace.");
          }

          // Se a campanha estiver sendo ativada/editada com novos produtos, proíbe produtos inativos
          const currentProdIds = campaign.campaignProducts.map((cp) => cp.productId);
          const newlyAdded = validProds.filter((p) => !currentProdIds.includes(p.id));
          const inactiveNew = newlyAdded.find((p) => p.status !== "ACTIVE");
          if (inactiveNew) {
            throw new Error(`O produto '${inactiveNew.name}' está desativado e não pode ser associado.`);
          }
        }

        // Deleta associações que foram desmarcadas (sem deletar o produto!)
        await tx.campaignProduct.deleteMany({
          where: {
            campaignId: id,
            productId: { notIn: productIds },
          },
        });

        // Adiciona associações novas
        const existingIds = campaign.campaignProducts.map((cp) => cp.productId);
        const toAdd = productIds.filter((pId) => !existingIds.includes(pId));
        if (toAdd.length > 0) {
          await tx.campaignProduct.createMany({
            data: toAdd.map((pId) => ({
              campaignId: id,
              productId: pId,
            })),
            skipDuplicates: true,
          });
        }
      }

      // 3. Se linkIds foi fornecido, sincronizar Smart Links atribuídos
      if (Array.isArray(linkIds)) {
        // Valida que os links pertencem ao workspace
        if (linkIds.length > 0) {
          const validLinks = await tx.smartLink.findMany({
            where: {
              id: { in: linkIds },
              workspaceId: session.workspaceId,
            },
            select: { id: true },
          });

          if (validLinks.length !== linkIds.length) {
            throw new Error("Um ou mais links selecionados não pertencem a este workspace.");
          }
        }

        // Links desmarcados: remove o campaignId (SEM APAGAR O LINK!)
        await tx.smartLink.updateMany({
          where: {
            campaignId: id,
            id: { notIn: linkIds },
            workspaceId: session.workspaceId,
          },
          data: {
            campaignId: null,
          },
        });

        // Links novos associados: atualiza campaignId
        if (linkIds.length > 0) {
          await tx.smartLink.updateMany({
            where: {
              id: { in: linkIds },
              workspaceId: session.workspaceId,
            },
            data: {
              campaignId: id,
            },
          });
        }
      }

      // Retorna a campanha atualizada com todos os relacionamentos
      return tx.campaign.findUnique({
        where: { id },
        include: {
          campaignProducts: {
            include: { product: true },
          },
          smartLinks: true,
        },
      });
    });

    return NextResponse.json({ success: true, campaign: updated });
  } catch (err: unknown) {
    console.error("[Update Campaign Error]", err);
    const message = err instanceof Error ? err.message : "Erro ao atualizar campanha";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * DELETE /api/campaigns/[id]
 * Remove a campanha, desvinculando links e produtos sem apagá-los.
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

  // Desvincula os Smart Links sem excluí-los
  await db.smartLink.updateMany({
    where: { campaignId: id },
    data: { campaignId: null },
  });

  // Deleta a campanha (CampaignProduct é deletado em cascata na junção, mas Product é preservado)
  await db.campaign.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

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
    const { name, description, productId, offerId, budget } = await request.json();
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Nome da campanha é obrigatório." }, { status: 400 });
    }

    const campaign = await db.campaign.create({
      data: {
        workspaceId: session.workspaceId,
        name: name.trim(),
        description: description?.trim(),
        productId: productId || null,
        offerId: offerId || null,
        budget: budget ? parseFloat(budget) : null,
      },
    });

    return NextResponse.json({ success: true, campaign }, { status: 201 });
  } catch (err: unknown) {
    console.error("[Create Campaign Error]", err);
    return NextResponse.json({ error: "Erro ao criar campanha." }, { status: 500 });
  }
}

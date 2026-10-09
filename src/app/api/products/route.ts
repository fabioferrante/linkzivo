import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  const workspaceId = session?.workspaceId;

  if (!workspaceId) {
    return NextResponse.json({ products: [] });
  }

  const products = await db.product.findMany({
    where: { workspaceId },
    include: {
      offers: true,
      _count: { select: { campaigns: true, smartLinks: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ products });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Faça login para cadastrar produtos." }, { status: 401 });
  }

  try {
    const { name, description, category, brand, platform, initialOfferUrl, commissionValue } =
      await request.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Nome do produto é obrigatório." }, { status: 400 });
    }

    const product = await db.product.create({
      data: {
        workspaceId: session.workspaceId,
        name: name.trim(),
        description: description?.trim(),
        category: category?.trim(),
        brand: brand?.trim(),
        platform: platform || "Outra",
        offers: initialOfferUrl
          ? {
              create: {
                name: "Oferta Principal",
                affiliateUrl: initialOfferUrl.trim(),
                commissionType: "FIXED",
                commissionValue: commissionValue ? parseFloat(commissionValue) : undefined,
              },
            }
          : undefined,
      },
      include: { offers: true },
    });

    return NextResponse.json({ success: true, product }, { status: 201 });
  } catch (err: unknown) {
    console.error("[Create Product Error]", err);
    return NextResponse.json({ error: "Erro ao cadastrar produto." }, { status: 500 });
  }
}

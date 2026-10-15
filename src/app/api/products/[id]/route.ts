import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/products/[id]
 * Retorna detalhes do produto, ofertas cadastradas e Smart Links vinculados.
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

  const product = await db.product.findFirst({
    where: {
      id,
      workspaceId: session.workspaceId,
    },
    include: {
      offers: {
        orderBy: { createdAt: "desc" },
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
        },
      },
      conversions: {
        orderBy: { timestamp: "desc" },
        take: 20,
      },
    },
  });

  if (!product) {
    return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  }

  const totalClicks = product.smartLinks.reduce((acc, l) => acc + l.clickCount, 0);
  const totalQrScans = product.smartLinks.reduce((acc, l) => acc + l.qrScanCount, 0);
  const confirmedCommission = product.conversions
    .filter((c) => c.status === "CONFIRMED")
    .reduce((acc, c) => acc + c.commissionAmount, 0);
  const estimatedCommission = product.conversions
    .filter((c) => c.status === "ESTIMATED")
    .reduce((acc, c) => acc + c.commissionAmount, 0);

  return NextResponse.json({
    product,
    metrics: {
      totalOffers: product.offers.length,
      totalLinks: product.smartLinks.length,
      totalClicks,
      totalQrScans,
      totalConversions: product.conversions.length,
      confirmedCommission,
      estimatedCommission,
    },
  });
}

/**
 * PATCH /api/products/[id]
 * Atualiza metadados do produto.
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

  const product = await db.product.findFirst({
    where: { id, workspaceId: session.workspaceId },
  });

  if (!product) {
    return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { name, description, category, brand, platform, status } = body;

    const updated = await db.product.update({
      where: { id },
      data: {
        name: name !== undefined ? name.trim() : product.name,
        description: description !== undefined ? description?.trim() : product.description,
        category: category !== undefined ? category?.trim() : product.category,
        brand: brand !== undefined ? brand?.trim() : product.brand,
        platform: platform !== undefined ? platform : product.platform,
        status: status || product.status,
      },
      include: { offers: true },
    });

    return NextResponse.json({ success: true, product: updated });
  } catch (err) {
    console.error("[Update Product Error]", err);
    return NextResponse.json({ error: "Erro ao atualizar produto" }, { status: 500 });
  }
}

/**
 * DELETE /api/products/[id]
 * Remove o produto desvinculando os links sem apagá-los.
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

  const product = await db.product.findFirst({
    where: { id, workspaceId: session.workspaceId },
  });

  if (!product) {
    return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  }

  await db.product.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

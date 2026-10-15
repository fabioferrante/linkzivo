import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { validateAndSanitizeUrl } from "@/lib/security";

export const dynamic = "force-dynamic";

/**
 * POST /api/products/[id]/offers
 * Adiciona uma oferta específica a um produto existente.
 */
export async function POST(
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
    const { name, affiliateUrl, commissionType, commissionValue, currency, status } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Nome da oferta é obrigatório." }, { status: 400 });
    }

    if (!affiliateUrl || !affiliateUrl.trim()) {
      return NextResponse.json({ error: "URL de afiliado/checkout é obrigatória." }, { status: 400 });
    }

    const validation = validateAndSanitizeUrl(affiliateUrl.trim());
    if (!validation.isValid || !validation.sanitizedUrl) {
      return NextResponse.json(
        { error: validation.error || "URL de afiliado inválida." },
        { status: 400 }
      );
    }

    const offer = await db.offer.create({
      data: {
        productId: id,
        name: name.trim(),
        affiliateUrl: validation.sanitizedUrl,
        commissionType: commissionType || "FIXED",
        commissionValue: commissionValue ? parseFloat(commissionValue) : null,
        currency: currency || "BRL",
        status: status || "ACTIVE",
      },
    });

    return NextResponse.json({ success: true, offer }, { status: 201 });
  } catch (err) {
    console.error("[Create Offer Error]", err);
    return NextResponse.json({ error: "Erro ao cadastrar oferta." }, { status: 500 });
  }
}

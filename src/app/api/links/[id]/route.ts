import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { validateAndSanitizeUrl } from "@/lib/security";

export const dynamic = "force-dynamic";

/**
 * GET /api/links/[id]
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();

  const link = await db.smartLink.findUnique({
    where: { id },
    include: {
      qrCode: true,
      history: { orderBy: { changedAt: "desc" } },
      product: true,
      offer: true,
      campaign: true,
      channel: true,
      _count: { select: { clicks: true, conversions: true } },
    },
  });

  if (!link) {
    return NextResponse.json({ error: "Link não encontrado." }, { status: 404 });
  }

  // Se logado e for outro workspace, rejeita (IDOR protection)
  if (session && link.workspaceId !== session.workspaceId && session.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });
  }

  return NextResponse.json({ link });
}

/**
 * PATCH /api/links/[id]
 * Edita o destino mantendo slug e QR Code inalterados.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    const body = await request.json();
    const { destinationUrl, title, status, fallbackUrl } = body;

    const existingLink = await db.smartLink.findUnique({
      where: { id },
    });

    if (!existingLink) {
      return NextResponse.json({ error: "Link não encontrado." }, { status: 404 });
    }

    if (session && existingLink.workspaceId !== session.workspaceId && session.role !== "ADMIN") {
      return NextResponse.json({ error: "Permissão negada." }, { status: 403 });
    }

    let updatedDestination = existingLink.destinationUrl;
    let urlChanged = false;

    if (destinationUrl && destinationUrl !== existingLink.destinationUrl) {
      const validation = validateAndSanitizeUrl(destinationUrl);
      if (!validation.isValid || !validation.sanitizedUrl) {
        return NextResponse.json(
          { error: validation.error || "Nova URL de destino inválida." },
          { status: 400 }
        );
      }
      updatedDestination = validation.sanitizedUrl;
      urlChanged = true;
    }

    // Executa update e grava histórico se a URL mudou
    const updated = await db.$transaction(async (tx) => {
      if (urlChanged) {
        await tx.linkHistory.create({
          data: {
            smartLinkId: existingLink.id,
            previousUrl: existingLink.destinationUrl,
            newUrl: updatedDestination,
            changedByUserId: session?.id || null,
          },
        });
      }

      return tx.smartLink.update({
        where: { id },
        data: {
          destinationUrl: updatedDestination,
          title: title !== undefined ? title : existingLink.title,
          status: status || existingLink.status,
          fallbackUrl: fallbackUrl !== undefined ? fallbackUrl : existingLink.fallbackUrl,
        },
        include: { qrCode: true },
      });
    });

    return NextResponse.json({ success: true, link: updated });
  } catch (err: unknown) {
    console.error("[Update Link Error]", err);
    return NextResponse.json(
      { error: "Erro interno ao atualizar link." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/links/[id]
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();

  const link = await db.smartLink.findUnique({ where: { id } });
  if (!link) {
    return NextResponse.json({ error: "Link não encontrado." }, { status: 404 });
  }

  if (session && link.workspaceId !== session.workspaceId && session.role !== "ADMIN") {
    return NextResponse.json({ error: "Permissão negada." }, { status: 403 });
  }

  await db.smartLink.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

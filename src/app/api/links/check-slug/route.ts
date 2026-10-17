import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isValidCustomSlug } from "@/lib/security";

export const dynamic = "force-dynamic";

/**
 * GET /api/links/check-slug?slug=xxx&excludeId=yyy
 * Valida a disponibilidade e conformidade de um slug personalizado no servidor.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawSlug = searchParams.get("slug");
    const excludeId = searchParams.get("excludeId");

    if (!rawSlug || !rawSlug.trim()) {
      return NextResponse.json(
        { available: false, reason: "empty", message: "Slug não informado." },
        { status: 400 }
      );
    }

    const cleanSlug = rawSlug.trim().toLowerCase();

    // 1. Validação de formato e regras sintáticas (3 a 60 chars, sem caracteres especiais exceto _ e -)
    const slugRegex = /^[a-zA-Z0-9_-]{3,60}$/;
    if (!slugRegex.test(cleanSlug)) {
      return NextResponse.json({
        available: false,
        reason: "invalid_format",
        message: "O slug deve conter entre 3 e 60 caracteres (apenas letras, números, hífen e underscore).",
      });
    }

    // 2. Validação contra slugs reservados do Next.js e da plataforma
    if (!isValidCustomSlug(cleanSlug)) {
      return NextResponse.json({
        available: false,
        reason: "reserved",
        message: "Este termo é reservado pelo sistema e não pode ser utilizado como link curto.",
      });
    }

    // 3. Consulta de unicidade case-insensitive no banco de dados
    const existing = await db.smartLink.findFirst({
      where: {
        slug: { equals: cleanSlug, mode: "insensitive" },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, slug: true },
    });

    if (existing) {
      return NextResponse.json({
        available: false,
        reason: "already_taken",
        message: "Este slug já está em uso por outro link cadastrado.",
      });
    }

    return NextResponse.json({
      available: true,
      slug: cleanSlug,
      message: "Slug disponível para registro.",
    });
  } catch (error: any) {
    console.error("Erro técnico na checagem de slug:", error);
    return NextResponse.json(
      {
        available: false,
        reason: "server_error",
        error: "Falha técnica ao verificar disponibilidade no banco de dados.",
      },
      { status: 500 }
    );
  }
}

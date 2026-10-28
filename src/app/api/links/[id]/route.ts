import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { validateAndSanitizeUrl } from "@/lib/security";
import { checkAndLockWorkspaceQuota } from "@/lib/plans";

export const dynamic = "force-dynamic";

/**
 * GET /api/links/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession(request);

  // Exige autenticação válida antes de consultar ou revelar existência do link
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

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
  if (link.workspaceId !== session.workspaceId && session.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });
  }

  return NextResponse.json({ link });
}

/**
 * PATCH /api/links/[id]
 * Edita propriedades, status, cota atômica e expiração.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession(request);

    // Exige autenticação válida antes de consultar ou revelar existência do link
    if (!session) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const existingLink = await db.smartLink.findUnique({
      where: { id },
      include: { workspace: { select: { id: true, plan: true } } },
    });

    if (!existingLink) {
      return NextResponse.json({ error: "Link não encontrado." }, { status: 404 });
    }

    if (existingLink.workspaceId !== session.workspaceId && session.role !== "ADMIN") {
      return NextResponse.json({ error: "Permissão negada." }, { status: 403 });
    }

    const body = await request.json();
    const {
      destinationUrl,
      title,
      status,
      fallbackUrl,
      expiresAt,
      campaignId,
      productId,
      offerId,
      slug: rawSlug,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
    } = body;

    const workspacePlan = existingLink.workspace.plan;

    // 1. Validação de recursos exclusivos do plano Creator
    if (
      (expiresAt !== undefined && expiresAt !== null) ||
      (fallbackUrl !== undefined && fallbackUrl !== null && String(fallbackUrl).trim())
    ) {
      if (workspacePlan === "FREE") {
        return NextResponse.json(
          {
            error: "Expiração agendada e URL de fallback são recursos exclusivos do plano Creator.",
            code: "FEATURE_NOT_AVAILABLE_IN_PLAN",
          },
          { status: 403 }
        );
      }
    }

    // 2. Validação e sanitização da URL de destino se alterada
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

    // 3. Validação e sanitização de expiresAt
    let updatedExpiresAt: Date | null = existingLink.expiresAt;
    if (expiresAt !== undefined) {
      if (expiresAt === null) {
        updatedExpiresAt = null;
      } else {
        const parsedDate = new Date(expiresAt);
        if (isNaN(parsedDate.getTime()) || parsedDate <= new Date()) {
          return NextResponse.json(
            { error: "A data de expiração agendada deve ser uma data futura válida." },
            { status: 400 }
          );
        }
        updatedExpiresAt = parsedDate;
      }
    }

    // 4. Validação e sanitização de fallbackUrl
    let updatedFallbackUrl: string | null = existingLink.fallbackUrl;
    if (fallbackUrl !== undefined) {
      if (fallbackUrl === null || String(fallbackUrl).trim() === "") {
        updatedFallbackUrl = null;
      } else {
        const fallbackValidation = validateAndSanitizeUrl(fallbackUrl);
        if (!fallbackValidation.isValid || !fallbackValidation.sanitizedUrl) {
          return NextResponse.json(
            { error: fallbackValidation.error || "URL de fallback informada é inválida ou insegura." },
            { status: 400 }
          );
        }
        updatedFallbackUrl = fallbackValidation.sanitizedUrl;
      }
    }

    // 5. Validação de Slug customizado se alterado
    let updatedSlug = existingLink.slug;
    if (rawSlug && rawSlug.trim()) {
      const cleanSlug = rawSlug.trim().toLowerCase();
      if (cleanSlug !== existingLink.slug.toLowerCase()) {
        const { isValidCustomSlug } = await import("@/lib/security");
        if (!isValidCustomSlug(cleanSlug)) {
          return NextResponse.json(
            { error: "Slug personalizado inválido ou reservado pelo sistema (use apenas letras, números e hífens)." },
            { status: 400 }
          );
        }

        const conflict = await db.smartLink.findFirst({
          where: {
            slug: { equals: cleanSlug, mode: "insensitive" },
            id: { not: existingLink.id },
          },
          select: { id: true },
        });

        if (conflict) {
          return NextResponse.json(
            { error: "Este slug já está em uso por outro link cadastrado." },
            { status: 409 }
          );
        }
        updatedSlug = cleanSlug;
      }
    }

    // 6. Validação de status permitido
    if (status && !["ACTIVE", "PAUSED", "ARCHIVED", "SUSPENDED", "EXPIRED"].includes(status)) {
      return NextResponse.json(
        { error: "Status inválido. Use ACTIVE, PAUSED ou ARCHIVED." },
        { status: 400 }
      );
    }

    const targetStatus = status || existingLink.status;

    // 7. Reativação de link expirado exige nova data futura válida
    const now = new Date();
    const isCurrentlyExpired = existingLink.expiresAt && existingLink.expiresAt <= now;
    if (isCurrentlyExpired && (targetStatus === "ACTIVE" || targetStatus === "PAUSED")) {
      const willBeFuture = updatedExpiresAt && updatedExpiresAt > now;
      if (!willBeFuture && updatedExpiresAt !== null) {
        return NextResponse.json(
          { error: "Para reativar um link expirado, é obrigatório definir uma nova data de expiração futura válida ou remover a data." },
          { status: 400 }
        );
      }
    }

    // 8. Validação de ocupação de vaga e determinação de novo consumo
    const currentConsumesSlot =
      (existingLink.status === "ACTIVE" ||
        (existingLink.status === "PAUSED" && existingLink.pauseReason !== "DOWNGRADE")) &&
      (!existingLink.expiresAt || existingLink.expiresAt > now);

    const targetConsumesSlot =
      (targetStatus === "ACTIVE" || targetStatus === "PAUSED") &&
      (!updatedExpiresAt || updatedExpiresAt > now);

    const requiresNewSlot = !currentConsumesSlot && targetConsumesSlot;

    // 9. Resolução de pauseReason e previousStatus
    let updatedPauseReason = existingLink.pauseReason;
    let updatedPreviousStatus = existingLink.previousStatus;

    if (status) {
      if (status === "ACTIVE") {
        updatedPauseReason = null;
        updatedPreviousStatus = null;
      } else if (status === "PAUSED") {
        updatedPauseReason = "USER";
        updatedPreviousStatus = null;
      } else if (status === "ARCHIVED") {
        updatedPauseReason = null;
        updatedPreviousStatus = null;
      }
    }

    // 10. Validação de campanha/produto se fornecidos
    if (campaignId) {
      const camp = await db.campaign.findFirst({
        where: { id: campaignId, workspaceId: existingLink.workspaceId },
        select: { id: true },
      });
      if (!camp) {
        return NextResponse.json(
          { error: "Campanha informada não pertence ao mesmo workspace." },
          { status: 400 }
        );
      }
    }

    if (productId) {
      const prod = await db.product.findFirst({
        where: { id: productId, workspaceId: existingLink.workspaceId },
        select: { id: true },
      });
      if (!prod) {
        return NextResponse.json(
          { error: "Produto informado não pertence ao mesmo workspace." },
          { status: 400 }
        );
      }
    }

    // 11. Transação atômica com Lock FOR UPDATE (se necessitar de vaga) e persistência
    const txResult = await db.$transaction(async (tx) => {
      if (requiresNewSlot) {
        const quotaCheck = await checkAndLockWorkspaceQuota(existingLink.workspaceId, tx);
        if (!quotaCheck.allowed) {
          return {
            status: 403,
            body: {
              error: quotaCheck.error,
              code: quotaCheck.code,
              currentCount: quotaCheck.currentCount,
              maxSlots: quotaCheck.maxSlots,
            },
          };
        }
      }

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

      const updated = await tx.smartLink.update({
        where: { id },
        data: {
          slug: updatedSlug,
          destinationUrl: updatedDestination,
          title: title !== undefined ? title : existingLink.title,
          status: targetStatus,
          pauseReason: updatedPauseReason,
          previousStatus: updatedPreviousStatus,
          fallbackUrl: updatedFallbackUrl,
          expiresAt: updatedExpiresAt,
          campaignId: campaignId !== undefined ? (campaignId || null) : existingLink.campaignId,
          productId: productId !== undefined ? (productId || null) : existingLink.productId,
          offerId: offerId !== undefined ? (offerId || null) : existingLink.offerId,
          utmSource: utmSource !== undefined ? (utmSource || null) : existingLink.utmSource,
          utmMedium: utmMedium !== undefined ? (utmMedium || null) : existingLink.utmMedium,
          utmCampaign: utmCampaign !== undefined ? (utmCampaign || null) : existingLink.utmCampaign,
          utmTerm: utmTerm !== undefined ? (utmTerm || null) : existingLink.utmTerm,
          utmContent: utmContent !== undefined ? (utmContent || null) : existingLink.utmContent,
        },
        include: {
          qrCode: true,
          product: { select: { id: true, name: true } },
          offer: { select: { id: true, name: true, affiliateUrl: true } },
          campaign: { select: { id: true, name: true } },
        },
      });

      return {
        status: 200,
        body: { success: true, link: updated },
      };
    });

    return NextResponse.json(txResult.body, { status: txResult.status });
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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession(request);

  // Exige autenticação válida antes de consultar ou revelar existência do link
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const link = await db.smartLink.findUnique({ where: { id } });
  if (!link) {
    return NextResponse.json({ error: "Link não encontrado." }, { status: 404 });
  }

  if (link.workspaceId !== session.workspaceId && session.role !== "ADMIN") {
    return NextResponse.json({ error: "Permissão negada." }, { status: 403 });
  }

  await db.smartLink.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

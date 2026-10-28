import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PLAN_LIMITS, countOccupiedSlots, PlanType } from "@/lib/plans";

export const dynamic = "force-dynamic";

/**
 * POST /api/links/batch
 * Ações em lote seguras: pausar, reativar e excluir links selecionados.
 * Protegido por tenant/workspaceId, com lock exclusivo pessimista FOR UPDATE na reativação
 * para garantir integridade absoluta de cotas contra corridas concorrentes.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session || !session.workspaceId) {
      return NextResponse.json(
        { error: "Sessão inválida ou expirada. Faça login novamente.", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action, linkIds } = body;

    if (!Array.isArray(linkIds) || linkIds.length === 0) {
      return NextResponse.json(
        { error: "Nenhum link selecionado para a operação.", code: "INVALID_INPUT" },
        { status: 400 }
      );
    }

    if (!["pause", "resume", "delete"].includes(action)) {
      return NextResponse.json(
        { error: "Ação inválida. Ações permitidas: pause, resume, delete.", code: "INVALID_ACTION" },
        { status: 400 }
      );
    }

    // 1. Filtragem estrita dos links pertencentes ao workspace do usuário autenticado
    const ownedLinks = await db.smartLink.findMany({
      where: {
        id: { in: linkIds },
        workspaceId: session.workspaceId,
      },
      select: { id: true, status: true, slug: true, pauseReason: true, previousStatus: true, expiresAt: true },
    });

    const ownedIds = ownedLinks.map((l) => l.id);
    const unauthorizedCount = linkIds.length - ownedIds.length;

    if (ownedIds.length === 0) {
      return NextResponse.json(
        { error: "Nenhum dos links selecionados pertence à sua conta ou workspace.", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    // 2. Execução da ação com base no tipo
    if (action === "pause") {
      const result = await db.smartLink.updateMany({
        where: {
          id: { in: ownedIds },
          workspaceId: session.workspaceId,
          status: "ACTIVE",
        },
        data: {
          status: "PAUSED",
          pauseReason: "USER",
          previousStatus: "ACTIVE",
        },
      });

      return NextResponse.json({
        success: true,
        action: "pause",
        affectedCount: result.count,
        unauthorizedCount,
        message: `${result.count} link(s) pausado(s) com sucesso.`,
      });
    }

    if (action === "resume") {
      // Reativação transacional atômica com lock pessimista no Workspace
      const resumeResult = await db.$transaction(async (tx) => {
        // 1. Lock exclusivo FOR UPDATE no registro do Workspace
        const wsRows = await tx.$queryRaw<Array<{ id: string; plan: string }>>`
          SELECT id, plan FROM "Workspace" WHERE id = ${session.workspaceId} FOR UPDATE
        `;

        if (!wsRows || wsRows.length === 0) {
          return {
            error: "Workspace não encontrado.",
            code: "WORKSPACE_NOT_FOUND",
            status: 404,
          };
        }

        const rawPlan = wsRows[0].plan;
        const plan: PlanType = rawPlan in PLAN_LIMITS ? (rawPlan as PlanType) : "FREE";
        const maxSlots = PLAN_LIMITS[plan].maxSlots;
        const now = new Date();

        // 2. Busca os links pertencentes ao workspace com status PAUSED
        const candidateLinks = await tx.smartLink.findMany({
          where: {
            id: { in: ownedIds },
            workspaceId: session.workspaceId,
            status: "PAUSED",
          },
        });

        if (candidateLinks.length === 0) {
          return {
            success: true,
            action: "resume",
            affectedCount: 0,
            unauthorizedCount,
            message: "Nenhum link pausado encontrado para reativação.",
          };
        }

        // 3. Converte links que já expiraram para EXPIRED (não podem ser reativados para ACTIVE)
        const activeEligible: typeof candidateLinks = [];
        for (const link of candidateLinks) {
          if (link.expiresAt && link.expiresAt <= now) {
            await tx.smartLink.update({
              where: { id: link.id },
              data: { status: "EXPIRED", pauseReason: null, previousStatus: null },
            });
          } else {
            activeEligible.push(link);
          }
        }

        if (activeEligible.length === 0) {
          return {
            success: true,
            action: "resume",
            affectedCount: 0,
            unauthorizedCount,
            message: "Os links selecionados expiraram e não podem ser reativados.",
          };
        }

        // 4. Calcula vagas necessárias
        // Links com pauseReason === 'DOWNGRADE' não ocupavam vaga no Free e agora demandam nova vaga.
        // Links com USER ou null já ocupavam vaga segundo countOccupiedSlots.
        const currentOccupied = await countOccupiedSlots(session.workspaceId, tx, { now });
        const additionalSlotsNeeded = activeEligible.filter((l) => l.pauseReason === "DOWNGRADE").length;

        // 5. Validação estrita da cota: política atômica "tudo ou nada"
        // Se a operação requisitar mais vagas do que as disponíveis, rejeita o lote inteiro
        if (currentOccupied + additionalSlotsNeeded > maxSlots) {
          const availableSlots = Math.max(0, maxSlots - currentOccupied);
          return {
            error: `Limite de links ocupados atingido para o plano ${plan}. Vagas necessárias: ${additionalSlotsNeeded}, vagas disponíveis: ${availableSlots} (${currentOccupied}/${maxSlots} em uso).`,
            code: "QUOTA_EXCEEDED",
            status: 403,
            currentOccupied,
            maxSlots,
            requiredSlots: additionalSlotsNeeded,
            availableSlots,
          };
        }

        // 6. Atualização atômica para ACTIVE limpando motivo e status anterior
        const eligibleIds = activeEligible.map((l) => l.id);
        const updateResult = await tx.smartLink.updateMany({
          where: {
            id: { in: eligibleIds },
            workspaceId: session.workspaceId,
          },
          data: {
            status: "ACTIVE",
            pauseReason: null,
            previousStatus: null,
          },
        });

        return {
          success: true,
          action: "resume",
          affectedCount: updateResult.count,
          unauthorizedCount,
          message: `${updateResult.count} link(s) reativado(s) com sucesso.`,
        };
      });

      if ("error" in resumeResult && resumeResult.error) {
        return NextResponse.json(
          {
            error: resumeResult.error,
            code: resumeResult.code,
            currentOccupied: resumeResult.currentOccupied,
            maxSlots: resumeResult.maxSlots,
            requiredSlots: resumeResult.requiredSlots,
            availableSlots: resumeResult.availableSlots,
          },
          { status: resumeResult.status || 400 }
        );
      }

      return NextResponse.json(resumeResult);
    }

    if (action === "delete") {
      const result = await db.smartLink.deleteMany({
        where: {
          id: { in: ownedIds },
          workspaceId: session.workspaceId,
        },
      });

      return NextResponse.json({
        success: true,
        action: "delete",
        affectedCount: result.count,
        unauthorizedCount,
        message: `${result.count} link(s) excluído(s) permanentemente.`,
      });
    }

    return NextResponse.json({ error: "Ação não processada." }, { status: 400 });
  } catch (error: any) {
    console.error("[Batch Link Action Error]", error);
    return NextResponse.json(
      { error: "Erro interno ao processar a operação em lote no banco de dados." },
      { status: 500 }
    );
  }
}

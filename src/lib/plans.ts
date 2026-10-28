import { Prisma, PrismaClient } from "@prisma/client";

export type PlanType = "FREE" | "CREATOR" | "PRO" | "AGENCY";

export interface PlanLimits {
  maxSlots: number;
  analyticsDays: number;
  canExpire: boolean;
  canCustomFallback: boolean;
}

/**
 * Limites comerciais centralizados por plano.
 */
export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  FREE: {
    maxSlots: 5,
    analyticsDays: 30,
    canExpire: false,
    canCustomFallback: false,
  },
  CREATOR: {
    maxSlots: 1000,
    analyticsDays: 365,
    canExpire: true,
    canCustomFallback: true,
  },
  PRO: {
    maxSlots: 5000,
    analyticsDays: 365,
    canExpire: true,
    canCustomFallback: true,
  },
  AGENCY: {
    maxSlots: 50000,
    analyticsDays: 730,
    canExpire: true,
    canCustomFallback: true,
  },
};

/**
 * Retorna o limite máximo de dias de analytics permitido para um determinado plano.
 */
export function getAnalyticsRetentionDays(plan: string | null | undefined): number {
  const normalizedPlan: PlanType =
    plan && plan in PLAN_LIMITS ? (plan as PlanType) : "FREE";
  return PLAN_LIMITS[normalizedPlan]?.analyticsDays ?? PLAN_LIMITS.FREE.analyticsDays;
}

export interface AnalyticsDateRangeResult {
  startDate: Date;
  maxAllowedDays: number;
  effectiveDays: number;
  periodLabel: string;
}

/**
 * Calcula a data de corte inicial (startDate) para consultas de analytics,
 * garantindo que nenhum workspace acesse dados além da janela permitida pelo seu plano.
 *
 * Política de Retenção:
 * - FREE: máximo de 30 dias (qualquer tentativa de solicitar períodos maiores é truncada para 30 dias).
 * - CREATOR: máximo de 365 dias.
 * - PRO: máximo de 365 dias.
 * - AGENCY: máximo de 730 dias.
 *
 * Tratamento temporal e de fuso horário:
 * - O cálculo baseia-se em milissegundos UTC a partir de `now` (now.getTime() - effectiveDays * 24 * 60 * 60 * 1000).
 * - Comportamento no limite exato: A consulta no banco utiliza `timestamp: { gte: startDate }`.
 *   Portanto, um evento com timestamp exatamente igual a `startDate` é incluído (inclusivo);
 *   qualquer evento com timestamp < startDate (mesmo por 1ms) é estritamente ignorado.
 *
 * @param plan Plano do workspace ("FREE", "CREATOR", etc.)
 * @param requestedPeriod Período solicitado pelo cliente ("7d", "30d", "90d", "all", número, etc.)
 * @param options.now Data de referência opcional para testes ou sincronismo determinístico (padrão new Date())
 */
export function getAnalyticsDateRange(
  plan: string | null | undefined,
  requestedPeriod?: string | null,
  options?: { now?: Date }
): AnalyticsDateRangeResult {
  const now = options?.now ?? new Date();
  const maxAllowedDays = getAnalyticsRetentionDays(plan);

  let requestedDays: number;

  if (!requestedPeriod || typeof requestedPeriod !== "string") {
    requestedDays = 30;
  } else {
    const trimmed = requestedPeriod.trim().toLowerCase();
    if (trimmed === "7d") {
      requestedDays = 7;
    } else if (trimmed === "30d") {
      requestedDays = 30;
    } else if (trimmed === "90d") {
      requestedDays = 90;
    } else if (trimmed === "365d") {
      requestedDays = 365;
    } else if (trimmed === "all") {
      requestedDays = maxAllowedDays;
    } else if (trimmed.endsWith("d")) {
      const parsed = parseInt(trimmed.slice(0, -1), 10);
      requestedDays = Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
    } else {
      const parsed = parseInt(trimmed, 10);
      requestedDays = Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
    }
  }

  // Trunca estritamente pelo teto do plano
  const effectiveDays = Math.min(requestedDays, maxAllowedDays);

  const cutoffMs = now.getTime() - effectiveDays * 24 * 60 * 60 * 1000;
  const startDate = new Date(cutoffMs);

  return {
    startDate,
    maxAllowedDays,
    effectiveDays,
    periodLabel: `${effectiveDays}d`,
  };
}

export type QuotaCheckErrorCode =
  | "WORKSPACE_NOT_FOUND"
  | "QUOTA_EXCEEDED"
  | "DATABASE_ERROR";

export interface QuotaCheckSuccess {
  allowed: true;
  workspaceId: string;
  plan: PlanType;
  currentCount: number;
  maxSlots: number;
  remainingSlots: number;
}

export interface QuotaCheckFailure {
  allowed: false;
  code: QuotaCheckErrorCode;
  error: string;
  workspaceId: string;
  plan?: PlanType;
  currentCount?: number;
  maxSlots?: number;
}

export type QuotaCheckResult = QuotaCheckSuccess | QuotaCheckFailure;

/**
 * Conta os slots (vagas) efetivamente ocupados no workspace.
 *
 * Regra determinística:
 * 1. status IN ('ACTIVE', 'PAUSED')
 * 2. expiresAt IS NULL OR expiresAt > now (links já expirados nunca ocupam vaga)
 * 3. Por padrão, links congelados por downgrade (pauseReason == 'DOWNGRADE')
 *    são excluídos da contagem de vagas do Free/Ativas.
 */
export async function countOccupiedSlots(
  workspaceId: string,
  client: Prisma.TransactionClient | PrismaClient,
  options?: { now?: Date; includeDowngraded?: boolean }
): Promise<number> {
  const now = options?.now ?? new Date();

  const whereClause: Prisma.SmartLinkWhereInput = {
    workspaceId,
    status: { in: ["ACTIVE", "PAUSED"] },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };

  if (!options?.includeDowngraded) {
    whereClause.AND = [
      {
        OR: [
          { pauseReason: null },
          { pauseReason: { not: "DOWNGRADE" } },
        ],
      },
    ];
  }

  return client.smartLink.count({ where: whereClause });
}

/**
 * Adquire lock exclusivo de linha (SELECT ... FOR UPDATE) no registro do Workspace
 * no PostgreSQL e valida se o workspace possui cota disponível para alocar uma nova vaga.
 *
 * OBRIGATÓRIO: Deve ser executado dentro de uma transação Prisma (tx).
 * Erros de banco de dados NUNCA liberam cota.
 */
export async function checkAndLockWorkspaceQuota(
  workspaceId: string,
  tx: Prisma.TransactionClient,
  options?: { now?: Date }
): Promise<QuotaCheckResult> {
  if (!workspaceId || typeof workspaceId !== "string") {
    return {
      allowed: false,
      code: "WORKSPACE_NOT_FOUND",
      error: "Identificador de workspace inválido ou ausente.",
      workspaceId: String(workspaceId),
    };
  }

  const now = options?.now ?? new Date();

  // 1. Lock exclusivo no PostgreSQL garantindo serialização por workspace
  let rows: Array<{ id: string; plan: string }>;
  try {
    rows = await tx.$queryRaw<Array<{ id: string; plan: string }>>`
      SELECT id, plan FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE
    `;
  } catch (err: unknown) {
    // Jamais converte erro de banco em liberação de cota
    return {
      allowed: false,
      code: "DATABASE_ERROR",
      error: `Falha ao adquirir lock exclusivo do workspace: ${err instanceof Error ? err.message : String(err)}`,
      workspaceId,
    };
  }

  if (!rows || rows.length === 0) {
    return {
      allowed: false,
      code: "WORKSPACE_NOT_FOUND",
      error: `Workspace com ID '${workspaceId}' não foi encontrado.`,
      workspaceId,
    };
  }

  const rawPlan = rows[0].plan;
  const plan: PlanType = rawPlan in PLAN_LIMITS ? (rawPlan as PlanType) : "FREE";
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.FREE;
  const maxSlots = limits.maxSlots;

  // 2. Contagem de vagas ocupadas sob o lock serializado
  let currentCount: number;
  try {
    currentCount = await countOccupiedSlots(workspaceId, tx, { now });
  } catch (err: unknown) {
    return {
      allowed: false,
      code: "DATABASE_ERROR",
      error: `Falha ao contabilizar slots ocupados: ${err instanceof Error ? err.message : String(err)}`,
      workspaceId,
      plan,
      maxSlots,
    };
  }

  // 3. Verificação estrita de cota
  if (currentCount >= maxSlots) {
    return {
      allowed: false,
      code: "QUOTA_EXCEEDED",
      error: `Limite de links ocupados atingido para o plano ${plan} (${currentCount}/${maxSlots}).`,
      workspaceId,
      plan,
      currentCount,
      maxSlots,
    };
  }

  return {
    allowed: true,
    workspaceId,
    plan,
    currentCount,
    maxSlots,
    remainingSlots: maxSlots - currentCount,
  };
}

export type PlanTransitionAction =
  | "NO_CHANGE"
  | "DOWNGRADED_NO_CHANGE"
  | "DOWNGRADED_WITH_FREEZE"
  | "UPGRADED"
  | "UPGRADED_NO_CHANGE";

export interface PlanTransitionResult {
  success: boolean;
  workspaceId: string;
  previousPlan: PlanType;
  newPlan: PlanType;
  action: PlanTransitionAction;
  occupiedSlots: number;
  maxSlots: number;
  frozenCount: number;
  restoredCount: number;
  remainingFrozenCount: number;
  error?: string;
  code?: string;
}

/**
 * Executa a transição atômica de plano de um workspace (Upgrade ou Downgrade),
 * garantindo:
 * 1. Lock exclusivo pessimista no registro do Workspace (FOR UPDATE).
 * 2. Em caso de Downgrade com excedentes: congelamento determinístico dos links
 *    excedentes (ordem: clickCount desc, createdAt asc, id asc).
 * 3. Preservação estrita do status original em previousStatus e marcação com pauseReason = 'DOWNGRADE'.
 * 4. Preservação de links pausados manualmente pelo usuário (pauseReason = 'USER').
 * 5. Em caso de Upgrade: restauração apenas de links congelados por downgrade (pauseReason = 'DOWNGRADE'),
 *    respeitando a nova cota disponível e a intenção de pausa original.
 * 6. Tratamento de inconsistência histórica (se previousStatus for nulo ou inconsistente,
 *    restaura como PAUSED / USER, nunca presume ativo).
 * 7. Links arquivados ou expirados jamais são restaurados.
 */
export async function changeWorkspacePlan(
  workspaceId: string,
  targetPlan: string,
  client?: PrismaClient | Prisma.TransactionClient,
  options?: {
    now?: Date;
    expectedUserId?: string;
  }
): Promise<PlanTransitionResult> {
  if (!workspaceId || typeof workspaceId !== "string") {
    return {
      success: false,
      workspaceId: String(workspaceId),
      previousPlan: "FREE",
      newPlan: "FREE",
      action: "NO_CHANGE",
      occupiedSlots: 0,
      maxSlots: 0,
      frozenCount: 0,
      restoredCount: 0,
      remainingFrozenCount: 0,
      code: "WORKSPACE_NOT_FOUND",
      error: "Identificador de workspace inválido ou ausente.",
    };
  }

  const normalizedPlan = (targetPlan || "").trim().toUpperCase();

  // Tratamento explícito e seguro dos planos Pro e Agency não implementados para transição automática
  if (normalizedPlan === "PRO" || normalizedPlan === "AGENCY") {
    return {
      success: false,
      workspaceId,
      previousPlan: "FREE",
      newPlan: "FREE",
      action: "NO_CHANGE",
      occupiedSlots: 0,
      maxSlots: 0,
      frozenCount: 0,
      restoredCount: 0,
      remainingFrozenCount: 0,
      code: "FEATURE_NOT_IMPLEMENTED",
      error: "A contratação dos planos Pro e Agency está disponível exclusivamente sob consulta.",
    };
  }

  if (normalizedPlan !== "FREE" && normalizedPlan !== "CREATOR") {
    return {
      success: false,
      workspaceId,
      previousPlan: "FREE",
      newPlan: "FREE",
      action: "NO_CHANGE",
      occupiedSlots: 0,
      maxSlots: 0,
      frozenCount: 0,
      restoredCount: 0,
      remainingFrozenCount: 0,
      code: "INVALID_PLAN",
      error: `Plano '${targetPlan}' é inválido. Planos permitidos para transição: FREE ou CREATOR.`,
    };
  }

  const newPlan = normalizedPlan as PlanType;
  const newMaxSlots = PLAN_LIMITS[newPlan].maxSlots;
  const now = options?.now ?? new Date();

  // Função interna executada sob lock exclusivo de linha
  const executeTransition = async (tx: Prisma.TransactionClient): Promise<PlanTransitionResult> => {
    // 1. Lock exclusivo FOR UPDATE no registro do Workspace
    let rows: Array<{ id: string; plan: string; userId: string }>;
    try {
      rows = await tx.$queryRaw<Array<{ id: string; plan: string; userId: string }>>`
        SELECT id, plan, "userId" FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE
      `;
    } catch (err: unknown) {
      return {
        success: false,
        workspaceId,
        previousPlan: "FREE",
        newPlan,
        action: "NO_CHANGE",
        occupiedSlots: 0,
        maxSlots: newMaxSlots,
        frozenCount: 0,
        restoredCount: 0,
        remainingFrozenCount: 0,
        code: "DATABASE_ERROR",
        error: `Falha ao adquirir lock exclusivo do workspace: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    if (!rows || rows.length === 0) {
      return {
        success: false,
        workspaceId,
        previousPlan: "FREE",
        newPlan,
        action: "NO_CHANGE",
        occupiedSlots: 0,
        maxSlots: newMaxSlots,
        frozenCount: 0,
        restoredCount: 0,
        remainingFrozenCount: 0,
        code: "WORKSPACE_NOT_FOUND",
        error: `Workspace com ID '${workspaceId}' não foi encontrado.`,
      };
    }

    const currentRawPlan = rows[0].plan;
    const previousPlan: PlanType = currentRawPlan in PLAN_LIMITS ? (currentRawPlan as PlanType) : "FREE";
    const previousMaxSlots = PLAN_LIMITS[previousPlan].maxSlots;

    // 2. Validação de isolamento e propriedade de workspace
    if (options?.expectedUserId && rows[0].userId !== options.expectedUserId) {
      return {
        success: false,
        workspaceId,
        previousPlan,
        newPlan,
        action: "NO_CHANGE",
        occupiedSlots: 0,
        maxSlots: newMaxSlots,
        frozenCount: 0,
        restoredCount: 0,
        remainingFrozenCount: 0,
        code: "FORBIDDEN",
        error: "Acesso negado: o workspace solicitado não pertence ao usuário autenticado.",
      };
    }

    // 3. Caso o plano já seja o mesmo solicitado
    if (previousPlan === newPlan) {
      const occupied = await countOccupiedSlots(workspaceId, tx, { now });
      const remainingFrozen = await tx.smartLink.count({
        where: { workspaceId, status: "PAUSED", pauseReason: "DOWNGRADE" },
      });
      return {
        success: true,
        workspaceId,
        previousPlan,
        newPlan,
        action: "NO_CHANGE",
        occupiedSlots: occupied,
        maxSlots: newMaxSlots,
        frozenCount: 0,
        restoredCount: 0,
        remainingFrozenCount: remainingFrozen,
      };
    }

    const isDowngrade = newMaxSlots < previousMaxSlots;

    // -------------------------------------------------------------------------
    // FLUXO DE DOWNGRADE (ex: CREATOR -> FREE)
    // -------------------------------------------------------------------------
    if (isDowngrade) {
      // Busca todos os links que atualmente ocupam vaga (ACTIVE ou PAUSED/USER, não expirados e não congelados)
      const occupiedLinks = await tx.smartLink.findMany({
        where: {
          workspaceId,
          status: { in: ["ACTIVE", "PAUSED"] },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          AND: [
            {
              OR: [
                { pauseReason: null },
                { pauseReason: { not: "DOWNGRADE" } },
              ],
            },
          ],
        },
        orderBy: [
          { clickCount: "desc" },
          { createdAt: "asc" },
          { id: "asc" },
        ],
      });

      let frozenCount = 0;

      // Se a quantidade de vagas ocupadas exceder a nova cota
      if (occupiedLinks.length > newMaxSlots) {
        // Os primeiros newMaxSlots links são mantidos intactos (sem alteração).
        // Os excedentes (da posição newMaxSlots em diante) são congelados.
        const linksToFreeze = occupiedLinks.slice(newMaxSlots);

        for (const link of linksToFreeze) {
          // Preserva previousStatus original do link (ACTIVE ou PAUSED)
          await tx.smartLink.update({
            where: { id: link.id },
            data: {
              previousStatus: link.status,
              status: "PAUSED",
              pauseReason: "DOWNGRADE",
            },
          });
          frozenCount++;
        }
      }

      // Atualiza o plano do workspace
      await tx.workspace.update({
        where: { id: workspaceId },
        data: { plan: newPlan },
      });

      // Validação final de cota sob o lock antes do commit
      const finalOccupied = await countOccupiedSlots(workspaceId, tx, { now });
      if (finalOccupied > newMaxSlots) {
        throw new Error(
          `Falha de integridade: downgrade não pôde satisfazer a nova cota (${finalOccupied} > ${newMaxSlots})`
        );
      }

      const totalFrozen = await tx.smartLink.count({
        where: { workspaceId, status: "PAUSED", pauseReason: "DOWNGRADE" },
      });

      return {
        success: true,
        workspaceId,
        previousPlan,
        newPlan,
        action: frozenCount > 0 ? "DOWNGRADED_WITH_FREEZE" : "DOWNGRADED_NO_CHANGE",
        occupiedSlots: finalOccupied,
        maxSlots: newMaxSlots,
        frozenCount,
        restoredCount: 0,
        remainingFrozenCount: totalFrozen,
      };
    }

    // -------------------------------------------------------------------------
    // FLUXO DE UPGRADE (ex: FREE -> CREATOR)
    // -------------------------------------------------------------------------
    // 1. Atualiza o plano no workspace para o novo tier
    await tx.workspace.update({
      where: { id: workspaceId },
      data: { plan: newPlan },
    });

    // 2. Calcula as vagas atualmente ocupadas e as disponíveis para recuperação
    const currentOccupied = await countOccupiedSlots(workspaceId, tx, { now });
    const availableSlots = Math.max(0, newMaxSlots - currentOccupied);

    let restoredCount = 0;

    if (availableSlots > 0) {
      // Busca todos os links que estão congelados por downgrade
      const frozenCandidates = await tx.smartLink.findMany({
        where: {
          workspaceId,
          status: "PAUSED",
          pauseReason: "DOWNGRADE",
        },
        orderBy: [
          { clickCount: "desc" },
          { createdAt: "asc" },
          { id: "asc" },
        ],
      });

      const eligibleToRestore: typeof frozenCandidates = [];

      for (const link of frozenCandidates) {
        // Se o link congelado expirou enquanto esteve congelado, não recupera como ativo
        if (link.expiresAt && link.expiresAt <= now) {
          await tx.smartLink.update({
            where: { id: link.id },
            data: {
              status: "EXPIRED",
              pauseReason: null,
              previousStatus: null,
            },
          });
          continue;
        }

        if (eligibleToRestore.length < availableSlots) {
          eligibleToRestore.push(link);
        }
      }

      // Restaura deterministicamente até availableSlots
      for (const link of eligibleToRestore) {
        if (link.previousStatus === "ACTIVE") {
          // Restaura como ACTIVE
          await tx.smartLink.update({
            where: { id: link.id },
            data: {
              status: "ACTIVE",
              pauseReason: null,
              previousStatus: null,
            },
          });
        } else {
          // previousStatus === 'PAUSED' ou nulo/legado inconsistente:
          // NUNCA presumir ativo! Restaura sempre como PAUSED com pauseReason = USER
          await tx.smartLink.update({
            where: { id: link.id },
            data: {
              status: "PAUSED",
              pauseReason: "USER",
              previousStatus: null,
            },
          });
        }
        restoredCount++;
      }
    }

    // Validação final de cota sob o lock
    const finalOccupied = await countOccupiedSlots(workspaceId, tx, { now });
    if (finalOccupied > newMaxSlots) {
      throw new Error(
        `Falha de integridade: upgrade excedeu a cota do novo plano (${finalOccupied} > ${newMaxSlots})`
      );
    }

    const remainingFrozen = await tx.smartLink.count({
      where: { workspaceId, status: "PAUSED", pauseReason: "DOWNGRADE" },
    });

    return {
      success: true,
      workspaceId,
      previousPlan,
      newPlan,
      action: restoredCount > 0 ? "UPGRADED" : "UPGRADED_NO_CHANGE",
      occupiedSlots: finalOccupied,
      maxSlots: newMaxSlots,
      frozenCount: 0,
      restoredCount,
      remainingFrozenCount: remainingFrozen,
    };
  };

  // Se client já for uma TransactionClient, executa diretamente nela
  const activeClient = client || (await import("@/lib/db")).db;
  if ("$transaction" in activeClient && typeof activeClient.$transaction === "function") {
    return activeClient.$transaction(async (tx: Prisma.TransactionClient) => {
      return executeTransition(tx);
    });
  }

  return executeTransition(activeClient as Prisma.TransactionClient);
}

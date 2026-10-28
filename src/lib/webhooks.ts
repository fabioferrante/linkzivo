import crypto from "crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { db } from "./db";

/**
 * Obtém o segredo mestre de autenticação da aplicação com validação de segurança.
 */
function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  const isValid = typeof secret === "string" && secret.trim().length >= 32;

  if (process.env.NODE_ENV === "production") {
    if (!isValid) {
      throw new Error(
        "[Fatal Security Error] AUTH_SECRET environment variable is missing or has less than 32 characters in production."
      );
    }
    return secret.trim();
  }

  return isValid ? secret.trim() : "linkzivo-dev-local-salt-32chars-minimum-token";
}

/**
 * Gera um segredo exclusivo e criptograficamente assinado para o webhook de um Workspace.
 * Formato canônico: lz_wh_<workspaceId>.<hmac_sha256>
 */
export function generateWorkspaceWebhookSecret(workspaceId: string): string {
  if (!workspaceId || typeof workspaceId !== "string") {
    throw new Error("workspaceId é obrigatório para gerar o segredo de webhook.");
  }
  const secret = getAuthSecret();
  const contextPayload = `linkzivo:webhook:${workspaceId.trim()}`;
  const hmac = crypto.createHmac("sha256", secret).update(contextPayload).digest("hex");
  return `lz_wh_${workspaceId.trim()}.${hmac}`;
}

/**
 * Valida a autenticidade de um segredo de webhook de Workspace usando comparação em tempo constante.
 * Retorna o workspaceId autenticado se válido, ou { valid: false } se inválido ou adulterado.
 */
export function verifyWorkspaceWebhookSecret(secretToken: string | null | undefined): {
  valid: boolean;
  workspaceId?: string;
  error?: string;
} {
  if (!secretToken || typeof secretToken !== "string") {
    return { valid: false, error: "Segredo de webhook ausente ou não informado." };
  }

  const token = secretToken.trim();
  if (!token.startsWith("lz_wh_")) {
    return { valid: false, error: "Formato de segredo inválido (deve iniciar com 'lz_wh_')." };
  }

  const dotIndex = token.lastIndexOf(".");
  if (dotIndex === -1) {
    return { valid: false, error: "Estrutura do segredo malformada." };
  }

  const prefixAndWsId = token.slice(0, dotIndex);
  const providedHmac = token.slice(dotIndex + 1);
  const workspaceId = prefixAndWsId.replace(/^lz_wh_/, "");

  if (!workspaceId || !providedHmac) {
    return { valid: false, error: "Identificador ou assinatura ausente no segredo." };
  }

  const masterSecret = getAuthSecret();
  const contextPayload = `linkzivo:webhook:${workspaceId}`;
  const expectedHmac = crypto.createHmac("sha256", masterSecret).update(contextPayload).digest("hex");

  const providedBuffer = Buffer.from(providedHmac, "hex");
  const expectedBuffer = Buffer.from(expectedHmac, "hex");

  if (providedBuffer.length !== expectedBuffer.length) {
    return { valid: false, error: "Assinatura do segredo inválida." };
  }

  const isMatch = crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  if (!isMatch) {
    return { valid: false, error: "Assinatura do segredo inválida ou não autorizada." };
  }

  return { valid: true, workspaceId };
}

/**
 * Interface canônica normalizada de conversão
 */
export interface NormalizedConversionPayload {
  externalConversionId: string;
  clickId?: string | null;
  slug?: string | null;
  smartLinkId?: string | null;
  conversionType: "SALE" | "LEAD" | "SIGNUP";
  status: "ESTIMATED" | "CONFIRMED" | "REFUNDED" | "CANCELED";
  amount: number;
  commissionAmount: number;
  currency: string;
  platform: string;
}

/**
 * Valida formato de código de moeda ISO 4217 (ex: BRL, USD, EUR)
 */
function isValidCurrency(curr: any): boolean {
  return typeof curr === "string" && /^[A-Z]{3}$/.test(curr.trim().toUpperCase());
}

/**
 * Normaliza e adapta o payload recebido (Canônico, Hotmart ou Kiwify) para o formato interno.
 */
export function normalizePostbackPayload(
  rawBody: any,
  platformHint?: string | null
): { success: true; payload: NormalizedConversionPayload } | { success: false; error: string; code: string } {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return {
      success: false,
      error: "Payload de requisição deve ser um objeto JSON válido.",
      code: "INVALID_PAYLOAD",
    };
  }

  const hint = (platformHint || "").trim().toLowerCase();

  // 1. ADAPTADOR HOTMART (Webhook 2.0 Oficial)
  if (hint === "hotmart" || (rawBody.event && rawBody.data?.purchase)) {
    const purchase = rawBody.data?.purchase || {};
    const commissions = Array.isArray(rawBody.data?.commissions) ? rawBody.data.commissions : [];

    const transactionId = purchase.transaction;
    if (!transactionId || typeof transactionId !== "string" || !transactionId.trim()) {
      return {
        success: false,
        error: "Hotmart payload ausente de data.purchase.transaction.",
        code: "MISSING_TRANSACTION_ID",
      };
    }

    // Identificação de status
    const rawStatus = (purchase.status || rawBody.event || "").toString().toUpperCase();
    let status: NormalizedConversionPayload["status"] = "CONFIRMED";
    if (rawStatus.includes("REFUND") || rawStatus.includes("CHARGEBACK")) {
      status = "REFUNDED";
    } else if (rawStatus.includes("CANCEL") || rawStatus.includes("EXPIRED")) {
      status = "CANCELED";
    } else if (rawStatus.includes("WAITING") || rawStatus.includes("BILLET")) {
      status = "ESTIMATED";
    } else if (rawStatus.includes("APPROVED") || rawStatus.includes("COMPLETE")) {
      status = "CONFIRMED";
    }

    const priceValue = purchase.price?.value ?? 0;
    const affiliateCommission = commissions.find(
      (c: any) => (c.source || "").toUpperCase() === "AFFILIATE"
    );
    const commValue = affiliateCommission ? affiliateCommission.value : (purchase.price?.value ?? 0);

    const currency = (purchase.price?.currency_value || "BRL").toString().toUpperCase();
    const clickId = purchase.sck || purchase.src || null;

    return {
      success: true,
      payload: {
        externalConversionId: transactionId.trim(),
        clickId: typeof clickId === "string" && clickId.trim() ? clickId.trim() : null,
        slug: null,
        smartLinkId: null,
        conversionType: "SALE",
        status,
        amount: Number.isFinite(priceValue) ? Math.max(0, Number(priceValue)) : 0,
        commissionAmount: Number.isFinite(commValue) ? Math.max(0, Number(commValue)) : 0,
        currency: isValidCurrency(currency) ? currency : "BRL",
        platform: "hotmart",
      },
    };
  }

  // 2. ADAPTADOR KIWIFY (Webhook Oficial)
  if (hint === "kiwify" || rawBody.order_id || rawBody.order_ref) {
    const orderId = rawBody.order_id || rawBody.order_ref;
    if (!orderId || typeof orderId !== "string" || !orderId.trim()) {
      return {
        success: false,
        error: "Kiwify payload ausente de order_id.",
        code: "MISSING_TRANSACTION_ID",
      };
    }

    const rawStatus = (rawBody.order_status || "").toString().toLowerCase();
    let status: NormalizedConversionPayload["status"] = "CONFIRMED";
    if (rawStatus.includes("refund") || rawStatus.includes("chargeback")) {
      status = "REFUNDED";
    } else if (rawStatus.includes("cancel")) {
      status = "CANCELED";
    } else if (rawStatus.includes("waiting")) {
      status = "ESTIMATED";
    } else if (rawStatus.includes("paid")) {
      status = "CONFIRMED";
    }

    // Comissão e Valores Kiwify (podem vir em centavos ou float)
    let amount = 0;
    let commissionAmount = 0;
    const comm = rawBody.Commission || {};

    if (Number.isFinite(comm.charge_amount)) {
      // Se maior que 500 sem ponto decimal, provável valor em centavos
      amount = Number(comm.charge_amount) > 500 && Number.isInteger(comm.charge_amount)
        ? comm.charge_amount / 100
        : comm.charge_amount;
    }
    if (Number.isFinite(comm.my_commission)) {
      commissionAmount = Number(comm.my_commission) > 500 && Number.isInteger(comm.my_commission)
        ? comm.my_commission / 100
        : comm.my_commission;
    }

    const tracking = rawBody.TrackingParameters || {};
    const clickId = tracking.sck || tracking.src || null;
    const currency = (comm.currency || "BRL").toString().toUpperCase();

    return {
      success: true,
      payload: {
        externalConversionId: orderId.trim(),
        clickId: typeof clickId === "string" && clickId.trim() ? clickId.trim() : null,
        slug: null,
        smartLinkId: null,
        conversionType: "SALE",
        status,
        amount: Math.max(0, amount),
        commissionAmount: Math.max(0, commissionAmount),
        currency: isValidCurrency(currency) ? currency : "BRL",
        platform: "kiwify",
      },
    };
  }

  // 3. CANÔNICO LINKZIVO
  const externalConversionId = rawBody.externalConversionId || rawBody.transactionId || rawBody.orderId;
  if (!externalConversionId || typeof externalConversionId !== "string" || !externalConversionId.trim()) {
    return {
      success: false,
      error: "O campo 'externalConversionId' é obrigatório no formato canônico.",
      code: "MISSING_TRANSACTION_ID",
    };
  }

  const rawStatus = (rawBody.status || "CONFIRMED").toString().toUpperCase();
  const validStatuses = ["CONFIRMED", "ESTIMATED", "REFUNDED", "CANCELED"];
  if (!validStatuses.includes(rawStatus)) {
    return {
      success: false,
      error: `Status '${rawStatus}' inválido. Valores aceitos: ${validStatuses.join(", ")}.`,
      code: "INVALID_STATUS",
    };
  }

  const amount = Number(rawBody.amount ?? 0);
  const commissionAmount = Number(rawBody.commissionAmount ?? amount);

  if (!Number.isFinite(amount) || amount < 0) {
    return {
      success: false,
      error: "O campo 'amount' deve ser um número finito maior ou igual a zero.",
      code: "INVALID_AMOUNT",
    };
  }

  if (!Number.isFinite(commissionAmount) || commissionAmount < 0) {
    return {
      success: false,
      error: "O campo 'commissionAmount' deve ser um número finito maior ou igual a zero.",
      code: "INVALID_COMMISSION",
    };
  }

  const currency = (rawBody.currency || "BRL").toString().toUpperCase();
  if (!isValidCurrency(currency)) {
    return {
      success: false,
      error: `Moeda '${currency}' inválida. Deve seguir o padrão ISO 4217 de 3 letras (ex: BRL, USD, EUR).`,
      code: "INVALID_CURRENCY",
    };
  }

  const rawType = (rawBody.conversionType || "SALE").toString().toUpperCase();
  const validTypes = ["SALE", "LEAD", "SIGNUP"];
  const conversionType = validTypes.includes(rawType) ? (rawType as "SALE" | "LEAD" | "SIGNUP") : "SALE";

  return {
    success: true,
    payload: {
      externalConversionId: externalConversionId.trim(),
      clickId: typeof rawBody.clickId === "string" && rawBody.clickId.trim() ? rawBody.clickId.trim() : null,
      slug: typeof rawBody.slug === "string" && rawBody.slug.trim() ? rawBody.slug.trim() : null,
      smartLinkId: typeof rawBody.smartLinkId === "string" && rawBody.smartLinkId.trim() ? rawBody.smartLinkId.trim() : null,
      conversionType,
      status: rawStatus as NormalizedConversionPayload["status"],
      amount,
      commissionAmount,
      currency,
      platform: "canonical",
    },
  };
}

export type ProcessResult =
  | {
      success: true;
      action: "CREATED";
      conversionId: string;
      externalConversionId: string;
      status: string;
      amount: number;
      commissionAmount: number;
      smartLinkId: string;
      clickId?: string | null;
    }
  | {
      success: true;
      action: "UPDATED";
      conversionId: string;
      externalConversionId: string;
      previousStatus: string;
      newStatus: string;
    }
  | {
      success: true;
      action: "IGNORED_DUPLICATE";
      conversionId: string;
      externalConversionId: string;
      status: string;
      message: string;
    }
  | {
      success: true;
      action: "IGNORED_OUT_OF_ORDER";
      conversionId: string;
      externalConversionId: string;
      previousStatus: string;
      newStatus: string;
      message: string;
    }
  | {
      success: false;
      error: string;
      code: string;
      status: number;
    };

/**
 * Valida a máquina de estados para transições de conversão de afiliados.
 *
 * Regras estritas de integridade:
 * - ESTIMATED (aguardando pagamento/boleto) -> pode avançar para CONFIRMED (pago) ou CANCELED (expirado/cancelado).
 * - CONFIRMED (venda aprovada) -> pode avançar para REFUNDED (estorno) ou CANCELED (cancelamento de contestação).
 * - REFUNDED (estornado) -> Estado final financeiro absoluto. NUNCA pode ser revertido para CONFIRMED ou ESTIMATED.
 * - CANCELED (cancelado) -> Estado final de pedido abortado. NUNCA pode ser revertido para ESTIMATED ou CONFIRMED.
 * - Transição entre CANCELED e REFUNDED: Rejeitada. Pedido não pago (CANCELED) não gera reembolso; pedido pago estornado (REFUNDED) não vira cancelamento de boleto.
 */
export function isValidStatusTransition(
  currentStatus: string,
  newStatus: string
): boolean {
  if (currentStatus === newStatus) {
    return false; // É idempotência de mesmo status, tratada por IGNORED_DUPLICATE
  }

  switch (currentStatus) {
    case "ESTIMATED":
      return newStatus === "CONFIRMED" || newStatus === "CANCELED";
    case "CONFIRMED":
      return newStatus === "REFUNDED" || newStatus === "CANCELED";
    case "REFUNDED":
      // Estado terminal financeiro: estornos não podem ser desfeitos por webhooks de retry
      return false;
    case "CANCELED":
      // Estado terminal: pedidos cancelados não podem ser revividos
      return false;
    default:
      return false;
  }
}

/**
 * Processa a ingestão da conversão de forma atômica, validando estritamente
 * a relação entre workspace, link, clique e garantindo idempotência e concorrência segura.
 */
export async function processConversionWebhook(
  authenticatedWorkspaceId: string,
  payload: NormalizedConversionPayload,
  rawPayloadString: string,
  client: PrismaClient | Prisma.TransactionClient = db
): Promise<ProcessResult> {
  // 1. Validação de Atribuição e Propriedade de Workspace
  let resolvedSmartLinkId: string | null = null;
  let resolvedClickId: string | null = null;
  let resolvedCampaignId: string | null = null;
  let resolvedProductId: string | null = null;
  let resolvedOfferId: string | null = null;

  // Cenário 1: Atribuição por clickId (Preferencial e mais precisa)
  if (payload.clickId) {
    const click = await client.click.findUnique({
      where: { id: payload.clickId },
      include: {
        smartLink: {
          select: { id: true, workspaceId: true, slug: true, campaignId: true, productId: true, offerId: true },
        },
      },
    });

    if (!click) {
      return {
        success: false,
        error: `Identificador de clique '${payload.clickId}' não encontrado para atribuição.`,
        code: "INVALID_CLICK_ID",
        status: 422,
      };
    }

    // Verificação estrita anti-IDOR: O clique deve pertencer ao workspace autenticado
    if (click.workspaceId !== authenticatedWorkspaceId) {
      return {
        success: false,
        error: "O clique informado pertence a um workspace diferente daquele autenticado pelo segredo.",
        code: "CROSS_WORKSPACE_VIOLATION",
        status: 403,
      };
    }

    // Se o payload enviou slug e o slug não bater com o link do clique:
    if (payload.slug && click.smartLink.slug !== payload.slug) {
      return {
        success: false,
        error: `Inconsistência de atribuição: o slug '${payload.slug}' diverge do link associado ao clique '${click.smartLink.slug}'.`,
        code: "ATTRIBUTION_MISMATCH",
        status: 422,
      };
    }

    resolvedSmartLinkId = click.smartLinkId;
    resolvedClickId = click.id;
    resolvedCampaignId = click.campaignId || click.smartLink.campaignId;
    resolvedProductId = click.productId || click.smartLink.productId;
    resolvedOfferId = click.offerId || click.smartLink.offerId;
  }
  // Cenário 2: Atribuição direta por slug ou smartLinkId (Fallback sem sck)
  else if (payload.slug || payload.smartLinkId) {
    const smartLink = await client.smartLink.findFirst({
      where: {
        OR: [
          ...(payload.smartLinkId ? [{ id: payload.smartLinkId }] : []),
          ...(payload.slug ? [{ slug: payload.slug }] : []),
        ],
      },
      select: {
        id: true,
        workspaceId: true,
        slug: true,
        campaignId: true,
        productId: true,
        offerId: true,
      },
    });

    if (!smartLink) {
      return {
        success: false,
        error: "Nenhum Smart Link correspondente foi encontrado com os parâmetros fornecidos.",
        code: "INVALID_LINK",
        status: 422,
      };
    }

    // Verificação estrita anti-IDOR: O link deve pertencer ao workspace autenticado
    if (smartLink.workspaceId !== authenticatedWorkspaceId) {
      return {
        success: false,
        error: "O link informado pertence a um workspace diferente daquele autenticado pelo segredo.",
        code: "CROSS_WORKSPACE_VIOLATION",
        status: 403,
      };
    }

    resolvedSmartLinkId = smartLink.id;
    resolvedCampaignId = smartLink.campaignId;
    resolvedProductId = smartLink.productId;
    resolvedOfferId = smartLink.offerId;
  }
  // Cenário 3: Ausência total de dados de atribuição confiáveis
  else {
    return {
      success: false,
      error: "O evento não contém dados de atribuição confiáveis (clickId, sck, src, slug ou smartLinkId são obrigatórios).",
      code: "MISSING_ATTRIBUTION",
      status: 400,
    };
  }

  // 2. Consulta prévia por externalConversionId para tratamento de Idempotência, Reembolso ou Cancelamento
  const existingConversion = await client.conversion.findUnique({
    where: { externalConversionId: payload.externalConversionId },
    include: {
      smartLink: { select: { workspaceId: true } },
    },
  });

  if (existingConversion) {
    // Verificação de isolamento: evento prévio não pode ser alterado por outro workspace
    if (existingConversion.smartLink.workspaceId !== authenticatedWorkspaceId) {
      return {
        success: false,
        error: "Esta transação já está associada a outro workspace no sistema.",
        code: "CROSS_WORKSPACE_VIOLATION",
        status: 403,
      };
    }

    // Caso A: Evento idêntico com o mesmo status -> IDEMPOTÊNCIA (Ignorar sem duplicar)
    if (existingConversion.status === payload.status) {
      return {
        success: true,
        action: "IGNORED_DUPLICATE",
        conversionId: existingConversion.id,
        externalConversionId: payload.externalConversionId,
        status: existingConversion.status,
        message: "Evento duplicado já registrado com o mesmo status. Nenhuma alteração aplicada.",
      };
    }

    // Caso B: Verificação da Máquina de Estados contra eventos fora de ordem
    if (!isValidStatusTransition(existingConversion.status, payload.status)) {
      return {
        success: true,
        action: "IGNORED_OUT_OF_ORDER",
        conversionId: existingConversion.id,
        externalConversionId: payload.externalConversionId,
        previousStatus: existingConversion.status,
        newStatus: payload.status,
        message: `Transição de '${existingConversion.status}' para '${payload.status}' ignorada: estado terminal não pode ser revertido por evento atrasado.`,
      };
    }

    // Caso C: Atualização atômica e segura sob concorrência (Optimistic Concurrency Control)
    const updateResult = await client.conversion.updateMany({
      where: {
        id: existingConversion.id,
        status: existingConversion.status, // Garante que o status não foi alterado concorrentemente
      },
      data: {
        status: payload.status,
        amount: payload.amount,
        commissionAmount: payload.commissionAmount,
        rawPayload: rawPayloadString,
      },
    });

    if (updateResult.count === 0) {
      // Concorrência: outra requisição alterou o registro simultaneamente
      const reloaded = await client.conversion.findUnique({
        where: { id: existingConversion.id },
      });

      if (reloaded) {
        if (reloaded.status === payload.status) {
          return {
            success: true,
            action: "IGNORED_DUPLICATE",
            conversionId: reloaded.id,
            externalConversionId: payload.externalConversionId,
            status: reloaded.status,
            message: "Evento duplicado já registrado concorrentemente.",
          };
        }

        if (!isValidStatusTransition(reloaded.status, payload.status)) {
          return {
            success: true,
            action: "IGNORED_OUT_OF_ORDER",
            conversionId: reloaded.id,
            externalConversionId: payload.externalConversionId,
            previousStatus: reloaded.status,
            newStatus: payload.status,
            message: `Transição concorrente de '${reloaded.status}' para '${payload.status}' ignorada.`,
          };
        }

        await client.conversion.update({
          where: { id: reloaded.id },
          data: {
            status: payload.status,
            amount: payload.amount,
            commissionAmount: payload.commissionAmount,
            rawPayload: rawPayloadString,
          },
        });

        return {
          success: true,
          action: "UPDATED",
          conversionId: reloaded.id,
          externalConversionId: payload.externalConversionId,
          previousStatus: reloaded.status,
          newStatus: payload.status,
        };
      }
    }

    return {
      success: true,
      action: "UPDATED",
      conversionId: existingConversion.id,
      externalConversionId: payload.externalConversionId,
      previousStatus: existingConversion.status,
      newStatus: payload.status,
    };
  }

  // 3. Criação de nova conversão no banco de dados com tratamento atômico de corrida
  try {
    const created = await client.conversion.create({
      data: {
        externalConversionId: payload.externalConversionId,
        clickId: resolvedClickId,
        smartLinkId: resolvedSmartLinkId,
        campaignId: resolvedCampaignId,
        productId: resolvedProductId,
        offerId: resolvedOfferId,
        conversionType: payload.conversionType,
        status: payload.status,
        amount: payload.amount,
        commissionAmount: payload.commissionAmount,
        currency: payload.currency,
        rawPayload: rawPayloadString,
      },
    });

    return {
      success: true,
      action: "CREATED",
      conversionId: created.id,
      externalConversionId: created.externalConversionId!,
      status: created.status,
      amount: created.amount,
      commissionAmount: created.commissionAmount,
      smartLinkId: created.smartLinkId,
      clickId: created.clickId,
    };
  } catch (error: any) {
    // Tratamento de concorrência com constraint única de externalConversionId (código Prisma P2002)
    if (error?.code === "P2002") {
      // 1. Confirma qual constraint falhou para não mascarar outras violações
      const target = error.meta?.target;
      const isTargetExternalId =
        Array.isArray(target)
          ? target.includes("externalConversionId")
          : typeof target === "string"
          ? target.includes("externalConversionId")
          : true;

      if (!isTargetExternalId) {
        console.error("[Postback Processing Error - Constraint Mismatch]", error);
        return {
          success: false,
          error: "Violação de restrição de integridade no banco de dados.",
          code: "DATABASE_ERROR",
          status: 500,
        };
      }

      // 2. Recupera o registro concorrente incluindo relação do Workspace
      const concurrentRecord = await client.conversion.findUnique({
        where: { externalConversionId: payload.externalConversionId },
        include: {
          smartLink: { select: { workspaceId: true } },
        },
      });

      if (concurrentRecord) {
        // 3. Validação anti-IDOR na concorrência: Garante que o registro pertence ao workspace autenticado
        if (concurrentRecord.smartLink.workspaceId !== authenticatedWorkspaceId) {
          return {
            success: false,
            error: "Esta transação já está associada a outro workspace no sistema.",
            code: "CROSS_WORKSPACE_VIOLATION",
            status: 403,
          };
        }

        // 4. Aplica idempotência de mesmo status
        if (concurrentRecord.status === payload.status) {
          return {
            success: true,
            action: "IGNORED_DUPLICATE",
            conversionId: concurrentRecord.id,
            externalConversionId: payload.externalConversionId,
            status: concurrentRecord.status,
            message: "Evento registrado concorrentemente com sucesso.",
          };
        }

        // 5. Validação da máquina de estados na concorrência
        if (!isValidStatusTransition(concurrentRecord.status, payload.status)) {
          return {
            success: true,
            action: "IGNORED_OUT_OF_ORDER",
            conversionId: concurrentRecord.id,
            externalConversionId: payload.externalConversionId,
            previousStatus: concurrentRecord.status,
            newStatus: payload.status,
            message: `Transição concorrente de '${concurrentRecord.status}' para '${payload.status}' ignorada (evento fora de ordem).`,
          };
        }

        const updated = await client.conversion.update({
          where: { id: concurrentRecord.id },
          data: {
            status: payload.status,
            amount: payload.amount,
            commissionAmount: payload.commissionAmount,
            rawPayload: rawPayloadString,
          },
        });

        return {
          success: true,
          action: "UPDATED",
          conversionId: updated.id,
          externalConversionId: payload.externalConversionId,
          previousStatus: concurrentRecord.status,
          newStatus: updated.status,
        };
      }
    }

    console.error("[Postback Processing Error]", error);
    return {
      success: false,
      error: "Falha de persistência no banco de dados ao registrar conversão.",
      code: "DATABASE_ERROR",
      status: 500,
    };
  }
}

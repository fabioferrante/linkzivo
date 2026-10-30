/**
 * Utilitários de Domínio para Extrato de Conversões, Auditoria e Sanitização
 */

const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /hottok/i,
  /password/i,
  /senha/i,
  /auth/i,
  /credential/i,
  /cookie/i,
  /signature/i,
  /hash/i,
  /api[_-]?key/i,
  /private[_-]?key/i,
  /access[_-]?token/i,
];

/**
 * Sanitiza recursivamente objetos ou JSONs de rawPayload para visualização segura no painel.
 * Preserva campos úteis de negócio (comprador, produto, moeda, valores, sck, src, etc.)
 * e mascara credenciais, tokens de webhook e chaves criptográficas.
 */
export function sanitizeConversionPayload(input: unknown): unknown {
  if (input === null || input === undefined) {
    return null;
  }

  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      return sanitizeConversionPayload(parsed);
    } catch {
      // Se for string pura não-JSON, mascara padrões conhecidos
      let sanitized = input;
      for (const pattern of SENSITIVE_KEY_PATTERNS) {
        sanitized = sanitized.replace(
          new RegExp(`("${pattern.source}"\\s*:\\s*")[^"]+(")`, "gi"),
          '$1[REDACTED]$2'
        );
      }
      return sanitized;
    }
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeConversionPayload(item));
  }

  if (typeof input === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
      if (isSensitive) {
        cleaned[key] = "[PROTEGIDO POR SEGURANÇA]";
      } else if (typeof value === "object" && value !== null) {
        cleaned[key] = sanitizeConversionPayload(value);
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }

  return input;
}

/**
 * Identifica a plataforma de origem do postback com base nas características do payload
 * e relacionamentos cadastrados, sem criar dados fictícios.
 */
export function detectConversionPlatform(
  productPlatform?: string | null,
  rawPayload?: unknown
): { platform: string; isGuaranteed: boolean } {
  if (productPlatform && productPlatform.trim()) {
    return { platform: productPlatform.trim(), isGuaranteed: true };
  }

  if (!rawPayload) {
    return { platform: "Postback Canônico", isGuaranteed: false };
  }

  const payloadStr = typeof rawPayload === "string" ? rawPayload : JSON.stringify(rawPayload);
  const lower = payloadStr.toLowerCase();

  if (lower.includes("hotmart") || lower.includes("hottok") || lower.includes("purchase")) {
    return { platform: "Hotmart", isGuaranteed: false };
  }

  if (lower.includes("kiwify") || lower.includes("order_id") || lower.includes("trackingparameters")) {
    return { platform: "Kiwify", isGuaranteed: false };
  }

  if (lower.includes("eduzz")) {
    return { platform: "Eduzz", isGuaranteed: false };
  }

  if (lower.includes("monetizze")) {
    return { platform: "Monetizze", isGuaranteed: false };
  }

  if (lower.includes("braip")) {
    return { platform: "Braip", isGuaranteed: false };
  }

  return { platform: "Linkzivo Webhook", isGuaranteed: false };
}

/**
 * Extrai notas técnicas de processamento ou motivos de status a partir do rawPayload.
 */
export function extractTechnicalProcessingInfo(rawPayload?: unknown): {
  notes?: string | null;
  originalEvent?: string | null;
  transactionRef?: string | null;
} {
  if (!rawPayload) return {};

  try {
    const parsed = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
    if (typeof parsed !== "object" || parsed === null) return {};

    const obj = parsed as Record<string, any>;
    const originalEvent = obj.event || obj.event_type || obj.status || null;
    const transactionRef = obj.transaction || obj.order_id || obj.id || null;
    const notes = obj.message || obj.reason || obj.status_reason || obj.error || null;

    return {
      notes: typeof notes === "string" ? notes : null,
      originalEvent: typeof originalEvent === "string" ? originalEvent : null,
      transactionRef: typeof transactionRef === "string" ? transactionRef : null,
    };
  } catch {
    return {};
  }
}

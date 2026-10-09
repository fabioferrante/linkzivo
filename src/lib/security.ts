import { z } from "zod";

/**
 * Lista de hostnames e padrões proibidos para mitigação severa de SSRF e abusos.
 */
const FORBIDDEN_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // Loopback IPv4
  /^0\.0\.0\.0$/,
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // RFC1918 Class A
  /^172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}$/, // RFC1918 Class B
  /^192\.168\.\d{1,3}\.\d{1,3}$/, // RFC1918 Class C
  /^169\.254\.\d{1,3}\.\d{1,3}$/, // Link-local / Cloud metadata (AWS/GCP/Azure)
  /^::1$/, // Loopback IPv6
  /^fc00:/i, // Unique local address IPv6
  /^fe80:/i, // Link-local IPv6
];

export const urlSchema = z.string().trim().refine((val) => {
  try {
    let toCheck = val;
    if (!toCheck.startsWith("http://") && !toCheck.startsWith("https://")) {
      toCheck = "https://" + toCheck;
    }
    const parsed = new URL(toCheck);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}, {
  message: "URL inválida. Utilize um endereço válido começando com http:// ou https://",
});

export interface UrlValidationResult {
  isValid: boolean;
  sanitizedUrl?: string;
  error?: string;
}

/**
 * Valida a URL de destino prevenindo SSRF, esquemas perigosos (javascript:, data:)
 * e domínios de loopback ou metadados de nuvem.
 */
export function validateAndSanitizeUrl(rawUrl: string): UrlValidationResult {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { isValid: false, error: "A URL não pode estar vazia." };
  }

  let cleaned = rawUrl.trim();

  // Rejeita esquemas maliciosos explicitamente
  const lower = cleaned.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("file:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("blob:")
  ) {
    return { isValid: false, error: "Protocolo de URL não permitido por motivos de segurança." };
  }

  // Prepend protocol if missing
  if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
    cleaned = "https://" + cleaned;
  }

  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    return { isValid: false, error: "Formato de URL inválido." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { isValid: false, error: "Apenas protocolos HTTP e HTTPS são aceitos." };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Bloqueio contra SSRF e IPs privados/reservados
  for (const pattern of FORBIDDEN_HOST_PATTERNS) {
    if (pattern.test(hostname)) {
      return {
        isValid: false,
        error: "URLs apontando para redes locais, loopback ou metadados de nuvem são proibidas.",
      };
    }
  }

  // Não permitir apontar para o próprio domínio de links em loop
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return {
      isValid: false,
      error: "O destino não pode apontar para o próprio servidor de redirecionamento.",
    };
  }

  return {
    isValid: true,
    sanitizedUrl: parsed.toString(),
  };
}

/**
 * Validação de custom slugs
 */
export function isValidCustomSlug(slug: string): boolean {
  // Apenas letras, números, hífen e underscore. Entre 3 e 60 caracteres.
  const slugRegex = /^[a-zA-Z0-9_-]{3,60}$/;
  if (!slugRegex.test(slug)) return false;

  // Slugs reservados do sistema
  const reservedSlugs = [
    "api",
    "dashboard",
    "login",
    "register",
    "admin",
    "settings",
    "terms",
    "privacy",
    "pricing",
    "links",
    "qr",
    "analytics",
    "campaigns",
    "products",
    "offers",
    "billing",
    "logout",
    "favicon.ico",
    "robots.txt",
    "sitemap.xml",
    "brand",
  ];

  return !reservedSlugs.includes(slug.toLowerCase());
}

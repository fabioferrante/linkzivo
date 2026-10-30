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
  /^\[::1\]$/, // Loopback IPv6 com colchetes
  /^fc00:/i, // Unique local address IPv6
  /^\[fc00:/i,
  /^fe80:/i, // Link-local IPv6
  /^\[fe80:/i,
  /^fd[0-9a-f]{2}:/i,
  /^\[fd[0-9a-f]{2}:/i,
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
 * Valida a URL de destino prevenindo SSRF, esquemas perigosos (javascript:, data:),
 * credenciais embutidas, domínios malformados e endereços de loopback ou metadados de nuvem.
 */
export function validateAndSanitizeUrl(rawUrl: string): UrlValidationResult {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { isValid: false, error: "A URL não pode estar vazia." };
  }

  let cleaned = rawUrl.trim();
  if (!cleaned) {
    return { isValid: false, error: "A URL não pode estar vazia." };
  }

  const lower = cleaned.toLowerCase();

  // Rejeita esquemas maliciosos ou não-HTTP explicitamente
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("file:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("blob:") ||
    lower.startsWith("mailto:")
  ) {
    return { isValid: false, error: "Protocolo de URL não permitido por motivos de segurança." };
  }

  // Se possui esquema explícito (ex: ftp://, ssh://), exige estritamente http:// ou https://
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(cleaned)) {
    if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
      return { isValid: false, error: "Apenas protocolos HTTP e HTTPS são aceitos." };
    }
  } else {
    // Sem protocolo especificado: assume HTTPS por padrão
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

  // Rejeita URLs contendo credenciais embutidas (mitigação de Open Redirect e phishing)
  if (parsed.username || parsed.password) {
    return {
      isValid: false,
      error: "URLs contendo credenciais de usuário embutidas não são permitidas por segurança.",
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Tratamento de endereços IPv6
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    for (const pattern of FORBIDDEN_HOST_PATTERNS) {
      if (pattern.test(hostname)) {
        return {
          isValid: false,
          error: "URLs apontando para redes locais, loopback ou metadados de nuvem são proibidas.",
        };
      }
    }
    return {
      isValid: true,
      sanitizedUrl: parsed.toString(),
    };
  }

  // Validação estrutural de hostname (domínio nominal ou IPv4)
  if (!hostname.includes(".") || hostname.startsWith(".") || hostname.endsWith(".") || hostname.includes("..")) {
    return {
      isValid: false,
      error: "A URL informada deve conter um domínio válido com extensão (ex: exemplo.com).",
    };
  }

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

  // Validação dos labels do domínio
  const labels = hostname.split(".");
  const isAllNumericIpv4 = labels.length === 4 && labels.every((l) => /^\d+$/.test(l));

  if (isAllNumericIpv4) {
    // Validação de octetos IPv4
    const validOctets = labels.every((l) => {
      const num = parseInt(l, 10);
      return num >= 0 && num <= 255;
    });
    if (!validOctets) {
      return { isValid: false, error: "Endereço IPv4 inválido." };
    }
  } else {
    // Domínio nominal: validação de cada label (RFC 1034 / 1123)
    for (const label of labels) {
      if (label.length === 0 || label.startsWith("-") || label.endsWith("-")) {
        return { isValid: false, error: "Domínio com labels malformados (hífen no início ou fim)." };
      }
      if (!/^[a-z0-9-]+$/i.test(label)) {
        return { isValid: false, error: "Domínio contém caracteres inválidos." };
      }
    }
    // TLD (último label) deve ter pelo menos 2 caracteres e não ser puramente numérico
    const tld = labels[labels.length - 1];
    if (tld.length < 2 || /^\d+$/.test(tld)) {
      return { isValid: false, error: "Extensão de domínio (TLD) inválida." };
    }
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

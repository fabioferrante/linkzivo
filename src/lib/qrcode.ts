import QRCode from "qrcode";
import sharp from "sharp";
import { validateAndSanitizeUrl } from "./security";

export type QrStyle = "SQUARES" | "DOTS" | "ROUNDED";

export interface QrCodeOptions {
  fgColor?: string;
  bgColor?: string;
  style?: QrStyle;
  logoUrl?: string | null;
  margin?: number;
  width?: number;
}

export interface QrLogoValidationResult {
  isValid: boolean;
  sanitizedLogo?: string | null;
  error?: string;
}

/**
 * Validação segura de logotipo para inserção no QR Code.
 * Previne ataques de payload excessivo (DoS), injeção de scripts (XSS em SVG) e SSRF em URLs externas.
 */
export function validateQrLogo(logoUrl: string | null | undefined): QrLogoValidationResult {
  if (!logoUrl || typeof logoUrl !== "string") {
    return { isValid: true, sanitizedLogo: null };
  }

  const trimmed = logoUrl.trim();
  if (!trimmed) {
    return { isValid: true, sanitizedLogo: null };
  }

  // Limite estrito de tamanho de string (250 KB base64 equivale a ~180 KB binário)
  if (trimmed.length > 250_000) {
    return {
      isValid: false,
      error: "O arquivo de logotipo é muito grande. O tamanho máximo permitido é 200 KB.",
    };
  }

  // 1. Caso Data URL (upload direto no cliente / base64)
  if (trimmed.startsWith("data:")) {
    const dataUrlPattern = /^data:image\/(png|jpeg|jpg|webp|svg\+xml)(;charset=[^;]+)?;base64,/i;
    const isSvgPlain = trimmed.startsWith("data:image/svg+xml;utf8,");

    if (!dataUrlPattern.test(trimmed) && !isSvgPlain) {
      return {
        isValid: false,
        error: "Formato de imagem não suportado. Utilize PNG, JPG, WebP ou SVG.",
      };
    }

    // Se for SVG, mitigar injeção de scripts ou entidades perigosas
    if (trimmed.includes("svg+xml")) {
      const lowerSvg = trimmed.toLowerCase();
      const dangerousPatterns = [
        "<script",
        "javascript:",
        "onload",
        "onerror",
        "onclick",
        "onmouseover",
        "<iframe",
        "<object",
        "<embed",
        "xlink:href=\"javascript:",
        "href=\"javascript:",
      ];

      for (const pattern of dangerousPatterns) {
        if (lowerSvg.includes(pattern)) {
          return {
            isValid: false,
            error: "O arquivo SVG contém elementos ou scripts não permitidos por segurança.",
          };
        }
      }
    }

    return { isValid: true, sanitizedLogo: trimmed };
  }

  // 2. Caso URL remota (HTTP / HTTPS)
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const urlValidation = validateAndSanitizeUrl(trimmed);
    if (!urlValidation.isValid || !urlValidation.sanitizedUrl) {
      return {
        isValid: false,
        error: urlValidation.error || "URL de logotipo inválida ou não permitida.",
      };
    }

    return { isValid: true, sanitizedLogo: urlValidation.sanitizedUrl };
  }

  return {
    isValid: false,
    error: "Formato de logotipo inválido. Utilize uma imagem PNG, JPG, WebP, SVG ou uma URL HTTPS segura.",
  };
}

/**
 * Verifica se um módulo (row, col) pertence a um dos 3 Finder Patterns (padrões de posicionamento nos cantos).
 */
function isFinderPattern(row: number, col: number, size: number): boolean {
  // Top-Left (7x7)
  if (row < 7 && col < 7) return true;
  // Top-Right (7x7)
  if (row < 7 && col >= size - 7) return true;
  // Bottom-Left (7x7)
  if (row >= size - 7 && col < 7) return true;
  return false;
}

/**
 * Gera o SVG vetorial do QR Code com suporte a estilos de módulos (SQUARES, DOTS, ROUNDED)
 * e sobreposição proporcional segura de logotipo central.
 */
export async function generateQrCodeSvg(
  text: string,
  options: QrCodeOptions = {}
): Promise<string> {
  const {
    fgColor = "#151724",
    bgColor = "#FFFFFF",
    style = "SQUARES",
    logoUrl = null,
    margin = 4,
    width = 512,
  } = options;

  // Validação segura do logotipo
  const logoCheck = validateQrLogo(logoUrl);
  const safeLogo = logoCheck.isValid ? logoCheck.sanitizedLogo : null;

  // Gera a matriz QR Code com redundância H (30% de tolerância de erro)
  const qr = QRCode.create(text, { errorCorrectionLevel: "H" });
  const size = qr.modules.size;
  const totalSize = size + margin * 2;

  // Calcula dimensão e limites do logotipo central
  let logoModules = 0;
  let minR = -1;
  let maxR = -1;
  let minC = -1;
  let maxC = -1;

  if (safeLogo) {
    // Logotipo ocupa ~22% da largura do QR Code
    logoModules = Math.max(5, Math.floor(size * 0.22));
    if (logoModules % 2 === 0) logoModules += 1; // Mantém ímpar para simetria perfeita
    const center = Math.floor(size / 2);
    const half = Math.floor(logoModules / 2);
    minR = center - half;
    maxR = center + half;
    minC = center - half;
    maxC = center + half;
  }

  let paths = "";

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!qr.modules.get(r, c)) continue;

      // Se houver logotipo central, omite os módulos cobertos pela área do logotipo
      if (safeLogo && r >= minR && r <= maxR && c >= minC && c <= maxC) {
        continue;
      }

      const x = c + margin;
      const y = r + margin;
      const isFinder = isFinderPattern(r, c, size);

      // Os Finder Patterns dos cantos são sempre preservados com contornos nítidos para leitura universal
      if (isFinder || style === "SQUARES") {
        paths += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fgColor}" />\n`;
      } else if (style === "DOTS") {
        paths += `<circle cx="${x + 0.5}" cy="${y + 0.5}" r="0.48" fill="${fgColor}" />\n`;
      } else if (style === "ROUNDED") {
        paths += `<rect x="${x + 0.05}" y="${y + 0.05}" width="0.9" height="0.9" rx="0.32" ry="0.32" fill="${fgColor}" />\n`;
      }
    }
  }

  // Renderização do badge de respiro e do logotipo central
  let logoElement = "";
  if (safeLogo) {
    const lx = minC + margin;
    const ly = minR + margin;
    const badgePadding = 0.25;
    const badgeSize = logoModules + badgePadding * 2;
    const badgeX = lx - badgePadding;
    const badgeY = ly - badgePadding;

    // Badge protetor com a cor de fundo (bgColor) para isolar o logotipo e manter o contraste dos módulos
    logoElement = `
      <rect x="${badgeX}" y="${badgeY}" width="${badgeSize}" height="${badgeSize}" fill="${bgColor}" rx="0.6" ry="0.6" />
      <image href="${safeLogo}" x="${lx}" y="${ly}" width="${logoModules}" height="${logoModules}" preserveAspectRatio="xMidYMid meet" />
    `;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${width}" height="${width}">
  <rect width="${totalSize}" height="${totalSize}" fill="${bgColor}" />
  ${paths}
  ${logoElement}
</svg>`;
}

/**
 * Gera o Buffer binário PNG a partir do SVG estilizado utilizando Sharp.
 * Possui fallback de segurança caso ocorra qualquer exceção na renderização.
 */
export async function generateQrCodePngBuffer(
  text: string,
  options: QrCodeOptions = {}
): Promise<Buffer> {
  const { width = 512, fgColor = "#151724", bgColor = "#FFFFFF", margin = 4 } = options;

  try {
    const svg = await generateQrCodeSvg(text, { ...options, width });
    return await sharp(Buffer.from(svg))
      .resize(width, width)
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch (err) {
    console.warn("[QRCode] Fallback para gerador padrão devido a erro no Sharp:", err);
    return QRCode.toBuffer(text, {
      type: "png",
      errorCorrectionLevel: "H",
      margin,
      width,
      color: {
        dark: fgColor,
        light: bgColor,
      },
    });
  }
}

/**
 * Gera um Data URL (PNG base64) para renderização imediata de QR Code no frontend ou API.
 */
export async function generateQrCodeDataUrl(
  text: string,
  options: QrCodeOptions = {}
): Promise<string> {
  const buffer = await generateQrCodePngBuffer(text, options);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

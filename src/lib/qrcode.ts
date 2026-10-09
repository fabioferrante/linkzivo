import QRCode from "qrcode";

export interface QrCodeOptions {
  fgColor?: string;
  bgColor?: string;
  margin?: number;
  width?: number;
}

/**
 * Gera um Data URL (PNG base64) para renderização imediata de QR Code no frontend.
 */
export async function generateQrCodeDataUrl(
  text: string,
  options: QrCodeOptions = {}
): Promise<string> {
  const {
    fgColor = "#151724", // Deep Obsidian padrão da marca
    bgColor = "#FFFFFF",
    margin = 2,
    width = 400,
  } = options;

  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "H", // Alta redundância (permite logos no centro)
    margin,
    width,
    color: {
      dark: fgColor,
      light: bgColor,
    },
  });
}

/**
 * Gera o SVG vetorial do QR Code para download com alta resolução para materiais impressos/offline.
 */
export async function generateQrCodeSvg(
  text: string,
  options: QrCodeOptions = {}
): Promise<string> {
  const {
    fgColor = "#151724",
    bgColor = "#FFFFFF",
    margin = 2,
    width = 400,
  } = options;

  return QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin,
    width,
    color: {
      dark: fgColor,
      light: bgColor,
    },
  });
}

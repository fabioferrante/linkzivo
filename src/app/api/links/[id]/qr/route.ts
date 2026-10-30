import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  generateQrCodeDataUrl,
  generateQrCodeSvg,
  generateQrCodePngBuffer,
  validateQrLogo,
  QrStyle,
} from "@/lib/qrcode";

export const dynamic = "force-dynamic";

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
const VALID_STYLES: QrStyle[] = ["SQUARES", "DOTS", "ROUNDED"];

/**
 * GET /api/links/[id]/qr?format=png|svg&style=SQUARES|DOTS|ROUNDED&fg=#151724&bg=#FFFFFF&download=1
 * Gera visualização ou download do QR Code dinâmico do Smart Link com alta resolução e redundância H.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const link = await db.smartLink.findUnique({
    where: { id },
    include: { qrCode: true },
  });

  if (!link) {
    return NextResponse.json({ error: "Link não encontrado." }, { status: 404 });
  }

  const searchParams = request.nextUrl.searchParams;
  const format = searchParams.get("format") || "png";
  const download = searchParams.get("download") === "1" || searchParams.get("download") === "true";

  // Prioriza query params; se omitidos, utiliza as configurações salvas no banco
  const reqStyle = searchParams.get("style") as QrStyle | null;
  const style: QrStyle = reqStyle && VALID_STYLES.includes(reqStyle)
    ? reqStyle
    : (link.qrCode?.style as QrStyle) || "SQUARES";

  const reqFg = searchParams.get("fg");
  const fg = reqFg && HEX_COLOR_REGEX.test(reqFg) ? reqFg : (link.qrCode?.fgColor || "#151724");

  const reqBg = searchParams.get("bg");
  const bg = reqBg && HEX_COLOR_REGEX.test(reqBg) ? reqBg : (link.qrCode?.bgColor || "#FFFFFF");

  const reqLogo = searchParams.get("logoUrl");
  const logoUrl = reqLogo !== null ? reqLogo : link.qrCode?.logoUrl;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  // O QR Code aponta para a URL curta com a tag src=qr para distinguir scans de cliques normais
  const targetShortUrl = `${appUrl}/${link.slug}?src=qr`;

  // 1. Exportação em formato SVG
  if (format === "svg") {
    const svg = await generateQrCodeSvg(targetShortUrl, {
      fgColor: fg,
      bgColor: bg,
      style,
      logoUrl,
      width: 512,
    });

    const headers: Record<string, string> = {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
    };

    if (download) {
      headers["Content-Disposition"] = `attachment; filename="linkzivo-qr-${link.slug}.svg"`;
    }

    return new NextResponse(svg, { headers });
  }

  // 2. Download direto do binário PNG
  if (download || request.headers.get("accept")?.includes("image/png")) {
    const pngBuffer = await generateQrCodePngBuffer(targetShortUrl, {
      fgColor: fg,
      bgColor: bg,
      style,
      logoUrl,
      width: 1024,
    });

    return new NextResponse(new Uint8Array(pngBuffer), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="linkzivo-qr-${link.slug}.png"`,
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  }

  // 3. Resposta JSON padrão com dataUrl base64 para preview imediato no frontend
  const dataUrl = await generateQrCodeDataUrl(targetShortUrl, {
    fgColor: fg,
    bgColor: bg,
    style,
    logoUrl,
    width: 600,
  });

  return NextResponse.json({
    dataUrl,
    shortUrl: targetShortUrl,
    config: {
      style,
      fgColor: fg,
      bgColor: bg,
      logoUrl: logoUrl || null,
      scanCount: link.qrCode?.scanCount || 0,
    },
  });
}

/**
 * PATCH /api/links/[id]/qr
 * Salva e persiste as customizações de QR Code (estilo, cores, logotipo) no banco de dados.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession(request);

    if (!session) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const link = await db.smartLink.findUnique({
      where: { id },
      include: { qrCode: true },
    });

    if (!link) {
      return NextResponse.json({ error: "Link não encontrado." }, { status: 404 });
    }

    // Proteção contra IDOR: apenas o proprietário do workspace ou ADMIN pode alterar o QR Code
    if (link.workspaceId !== session.workspaceId && session.role !== "ADMIN") {
      return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { style, fgColor, bgColor, logoUrl } = body;

    // Validações
    let safeStyle: QrStyle = (link.qrCode?.style as QrStyle) || "SQUARES";
    if (style) {
      if (!VALID_STYLES.includes(style)) {
        return NextResponse.json(
          { error: "Estilo inválido. Opções permitidas: SQUARES, DOTS, ROUNDED." },
          { status: 400 }
        );
      }
      safeStyle = style;
    }

    let safeFg = link.qrCode?.fgColor || "#151724";
    if (fgColor) {
      if (!HEX_COLOR_REGEX.test(fgColor)) {
        return NextResponse.json({ error: "Cor de primeiro plano inválida (formato hex esperado: #RRGGBB)." }, { status: 400 });
      }
      safeFg = fgColor;
    }

    let safeBg = link.qrCode?.bgColor || "#FFFFFF";
    if (bgColor) {
      if (!HEX_COLOR_REGEX.test(bgColor)) {
        return NextResponse.json({ error: "Cor de fundo inválida (formato hex esperado: #RRGGBB)." }, { status: 400 });
      }
      safeBg = bgColor;
    }

    let safeLogo: string | null = link.qrCode?.logoUrl || null;
    if (logoUrl !== undefined) {
      if (logoUrl === null || logoUrl === "") {
        safeLogo = null;
      } else {
        const logoValidation = validateQrLogo(logoUrl);
        if (!logoValidation.isValid) {
          return NextResponse.json(
            { error: logoValidation.error || "Logotipo inválido." },
            { status: 400 }
          );
        }
        safeLogo = logoValidation.sanitizedLogo || null;
      }
    }

    // Persistência com Upsert no Prisma
    const updatedQr = await db.qrCode.upsert({
      where: { smartLinkId: link.id },
      update: {
        style: safeStyle,
        fgColor: safeFg,
        bgColor: safeBg,
        logoUrl: safeLogo,
      },
      create: {
        smartLinkId: link.id,
        style: safeStyle,
        fgColor: safeFg,
        bgColor: safeBg,
        logoUrl: safeLogo,
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const targetShortUrl = `${appUrl}/${link.slug}?src=qr`;

    const dataUrl = await generateQrCodeDataUrl(targetShortUrl, {
      style: safeStyle,
      fgColor: safeFg,
      bgColor: safeBg,
      logoUrl: safeLogo,
      width: 600,
    });

    return NextResponse.json({
      success: true,
      qrCode: updatedQr,
      dataUrl,
      shortUrl: targetShortUrl,
    });
  } catch (error: any) {
    console.error("[QR Update Error]", error);
    return NextResponse.json(
      { error: "Erro interno ao atualizar configurações do QR Code." },
      { status: 500 }
    );
  }
}

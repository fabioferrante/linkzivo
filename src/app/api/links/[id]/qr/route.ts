import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateQrCodeDataUrl, generateQrCodeSvg } from "@/lib/qrcode";

export const dynamic = "force-dynamic";

/**
 * GET /api/links/[id]/qr?format=png|svg&fg=#151724&bg=#FFFFFF
 * Gera ou faz download do QR Code dinâmico do Smart Link com opções de customização.
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

  const format = request.nextUrl.searchParams.get("format") || "png";
  const fg = request.nextUrl.searchParams.get("fg") || link.qrCode?.fgColor || "#151724";
  const bg = request.nextUrl.searchParams.get("bg") || link.qrCode?.bgColor || "#FFFFFF";

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  // O QR Code aponta para o domínio curto + slug com a tag src=qr para distinguir scans de cliques normais
  const targetShortUrl = `${appUrl}/${link.slug}?src=qr`;

  if (format === "svg") {
    const svg = await generateQrCodeSvg(targetShortUrl, {
      fgColor: fg,
      bgColor: bg,
      width: 512,
    });

    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Content-Disposition": `attachment; filename="linkzivo-qr-${link.slug}.svg"`,
      },
    });
  }

  const dataUrl = await generateQrCodeDataUrl(targetShortUrl, {
    fgColor: fg,
    bgColor: bg,
    width: 600,
  });

  // Retorna como JSON com o dataUrl para pré-visualização ou download direto
  return NextResponse.json({
    dataUrl,
    shortUrl: targetShortUrl,
  });
}

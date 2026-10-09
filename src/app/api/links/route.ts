import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { validateAndSanitizeUrl, isValidCustomSlug } from "@/lib/security";
import { generateUniqueSlug } from "@/lib/slug";
import { generateQrCodeDataUrl } from "@/lib/qrcode";

export const dynamic = "force-dynamic";

/**
 * GET /api/links
 * Retorna todos os links do workspace ativo.
 */
export async function GET() {
  const session = await getSession();

  // Para permitir uso do encurtador público anônimo sem login obrigatório:
  // Se logado, filtra pelo workspace do usuário. Se não logado, retorna vazio ou links públicos.
  const workspaceId = session?.workspaceId;

  if (!workspaceId) {
    return NextResponse.json({ links: [] });
  }

  const links = await db.smartLink.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    include: {
      qrCode: true,
      product: { select: { id: true, name: true } },
      campaign: { select: { id: true, name: true } },
      channel: { select: { id: true, name: true } },
      _count: { select: { clicks: true, conversions: true } },
    },
  });

  return NextResponse.json({ links });
}

/**
 * POST /api/links
 * Cria um novo Smart Link (modo rápido ou avançado).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      url,
      customSlug,
      title,
      productId,
      offerId,
      campaignId,
      channelId,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
    } = body;

    // 1. Validação estrita e sanitização da URL contra SSRF
    const validation = validateAndSanitizeUrl(url);
    if (!validation.isValid || !validation.sanitizedUrl) {
      return NextResponse.json(
        { error: validation.error || "URL informada é inválida." },
        { status: 400 }
      );
    }

    const sanitizedUrl = validation.sanitizedUrl;

    // 2. Resolução do Slug (Customizado ou Gerado)
    let slug: string;
    if (customSlug && customSlug.trim()) {
      const cleanSlug = customSlug.trim();
      if (!isValidCustomSlug(cleanSlug)) {
        return NextResponse.json(
          { error: "Slug personalizado inválido ou reservado pelo sistema (use apenas letras, números e hífens)." },
          { status: 400 }
        );
      }

      const existingSlug = await db.smartLink.findUnique({
        where: { slug: cleanSlug },
        select: { id: true },
      });

      if (existingSlug) {
        return NextResponse.json(
          { error: "Este slug já está em uso. Por favor, escolha outro." },
          { status: 409 }
        );
      }
      slug = cleanSlug;
    } else {
      slug = await generateUniqueSlug();
    }

    // 3. Obtenção do workspace do usuário autenticado (ou workspace demo padrão)
    const session = await getSession();
    let workspaceId = session?.workspaceId;
    let creatorId = session?.id;

    if (!workspaceId) {
      // Criação ou busca de workspace anônimo/default para permitir encurtamento na Home
      let publicWs = await db.workspace.findUnique({
        where: { slug: "public-anonymous" },
      });
      if (!publicWs) {
        publicWs = await db.workspace.create({
          data: {
            name: "Público / Visitantes",
            slug: "public-anonymous",
            plan: "FREE",
          },
        });
      }
      workspaceId = publicWs.id;
      creatorId = undefined;
    }

    // 4. Criação atômica do SmartLink e do seu QR Code associado
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const shortUrl = `${appUrl}/${slug}`;
    const qrDataUrl = await generateQrCodeDataUrl(shortUrl, {
      fgColor: "#151724",
      bgColor: "#FFFFFF",
    });

    const smartLink = await db.smartLink.create({
      data: {
        workspaceId,
        creatorId,
        slug,
        title: title?.trim() || new URL(sanitizedUrl).hostname,
        destinationUrl: sanitizedUrl,
        productId: productId || null,
        offerId: offerId || null,
        campaignId: campaignId || null,
        channelId: channelId || null,
        utmSource: utmSource || null,
        utmMedium: utmMedium || null,
        utmCampaign: utmCampaign || null,
        utmTerm: utmTerm || null,
        utmContent: utmContent || null,
        qrCode: {
          create: {
            fgColor: "#151724",
            bgColor: "#FFFFFF",
          },
        },
      },
      include: {
        qrCode: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        link: smartLink,
        shortUrl,
        qrDataUrl,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    console.error("[Create Link Error]", err);
    return NextResponse.json(
      { error: "Erro interno ao processar a criação do link." },
      { status: 500 }
    );
  }
}

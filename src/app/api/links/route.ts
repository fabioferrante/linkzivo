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
      history: { orderBy: { changedAt: "desc" } },
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
      const cleanSlug = customSlug.trim().toLowerCase();
      if (!isValidCustomSlug(cleanSlug)) {
        return NextResponse.json(
          { error: "Slug personalizado inválido ou reservado pelo sistema (use apenas letras, números e hífens)." },
          { status: 400 }
        );
      }

      const existingSlug = await db.smartLink.findFirst({
        where: { slug: { equals: cleanSlug, mode: "insensitive" } },
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
      // Reutiliza ou inicializa de forma atômica o workspace exclusivo do usuário de sistema público (1:1)
      let publicWs = await db.workspace.findUnique({
        where: { slug: "public-anonymous" },
      });

      if (!publicWs) {
        try {
          publicWs = await db.$transaction(async (tx) => {
            let systemUser = await tx.user.findUnique({
              where: { email: "public-system@linkzivo.internal" },
            });
            if (!systemUser) {
              systemUser = await tx.user.create({
                data: {
                  name: "Sistema Público",
                  email: "public-system@linkzivo.internal",
                  role: "USER",
                  status: "ACTIVE",
                },
              });
            }

            const existing = await tx.workspace.findUnique({
              where: { userId: systemUser.id },
            });
            if (existing) return existing;

            return await tx.workspace.create({
              data: {
                userId: systemUser.id,
                name: "Público / Visitantes",
                slug: "public-anonymous",
                plan: "FREE",
              },
            });
          });
        } catch (err: unknown) {
          const isP2002 =
            err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002";
          if (isP2002) {
            publicWs = await db.workspace.findUnique({
              where: { slug: "public-anonymous" },
            });
          }
          if (!publicWs) throw err;
        }
      }
      workspaceId = publicWs.id;
      creatorId = undefined;
    }

    // 4. Criação atômica do SmartLink e do seu QR Code associado
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const shortUrl = `${appUrl}/${slug}`;
    const qrTargetUrl = `${appUrl}/${slug}?src=qr`;
    const qrDataUrl = await generateQrCodeDataUrl(qrTargetUrl, {
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
    if (err && typeof err === "object" && "code" in err && (err as any).code === "P2002") {
      return NextResponse.json(
        { error: "Este slug já está em uso. Por favor, escolha outro." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Erro interno no servidor ao processar a criação do link." },
      { status: 500 }
    );
  }
}

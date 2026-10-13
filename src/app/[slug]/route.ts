import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateClickId } from "@/lib/slug";

export const dynamic = "force-dynamic";

/**
 * Endpoint de Redirecionamento de Ultra Baixa Latência (Smart Link Resolver).
 * GET /[slug]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!slug || slug.length > 80) {
    return NextResponse.json({ error: "Slug inválido" }, { status: 400 });
  }

  // 1. Busca otimizada do link
  const link = await db.smartLink.findUnique({
    where: { slug },
    include: {
      rules: {
        where: { isActive: true },
        orderBy: { priority: "desc" },
      },
      product: {
        select: { id: true, platform: true },
      },
      offer: {
        select: { id: true, affiliateUrl: true },
      },
    },
  });

  if (!link || link.status !== "ACTIVE") {
    // Redireciona para página de erro 404 / link expirado da plataforma
    return NextResponse.redirect(new URL("/not-found-link", request.url), 302);
  }

  // Checagem de expiração se configurada
  if (link.expiresAt && new Date() > link.expiresAt) {
    if (link.fallbackUrl) {
      return NextResponse.redirect(link.fallbackUrl, 302);
    }
    return NextResponse.redirect(new URL("/expired-link", request.url), 302);
  }

  // 2. Determinação da URL de destino base (considera regras de smart redirect se houver)
  let destination = link.destinationUrl;
  const userAgent = request.headers.get("user-agent") || "";
  const isQrScan = request.nextUrl.searchParams.get("src") === "qr";

  if (link.isSmartRouting && link.rules.length > 0) {
    for (const rule of link.rules) {
      if (rule.ruleType === "OS") {
        if (rule.conditionValue === "iOS" && /iphone|ipad|ipod/i.test(userAgent)) {
          destination = rule.targetUrl;
          break;
        } else if (rule.conditionValue === "Android" && /android/i.test(userAgent)) {
          destination = rule.targetUrl;
          break;
        }
      }
    }
  }

  // 3. Geração de click_id único para atribuição
  const clickId = generateClickId();

  // 4. Injeção de Rastreio (Forwarding): anexa click_id para checkouts de afiliados (Hotmart, Kiwify, etc.)
  try {
    const destUrl = new URL(destination);

    // Repassar UTMs configuradas no link caso não estejam presentes
    if (link.utmSource && !destUrl.searchParams.has("utm_source")) destUrl.searchParams.set("utm_source", link.utmSource);
    if (link.utmMedium && !destUrl.searchParams.has("utm_medium")) destUrl.searchParams.set("utm_medium", link.utmMedium);
    if (link.utmCampaign && !destUrl.searchParams.has("utm_campaign")) destUrl.searchParams.set("utm_campaign", link.utmCampaign);
    if (link.utmTerm && !destUrl.searchParams.has("utm_term")) destUrl.searchParams.set("utm_term", link.utmTerm);
    if (link.utmContent && !destUrl.searchParams.has("utm_content")) destUrl.searchParams.set("utm_content", link.utmContent);

    // Injeção de rastreio de afiliados
    // Hotmart usa 'sck', Kiwify/Eduzz costumam usar 'src' ou 'utm_term'
    destUrl.searchParams.set("sck", clickId);
    destUrl.searchParams.set("linkzivo_click", clickId);

    // Repassa também parâmetros adicionais passados pelo usuário na URL de entrada
    request.nextUrl.searchParams.forEach((value, key) => {
      if (key !== "src" && !destUrl.searchParams.has(key)) {
        destUrl.searchParams.set(key, value);
      }
    });

    destination = destUrl.toString();
  } catch {
    // Mantém destination original em caso de URL não padrão
  }

  // 5. Extração de metadados de analytics do visitante (sem armazenar IP bruto - LGPD)
  const referer = request.headers.get("referer") || undefined;
  const country = request.headers.get("x-vercel-ip-country") || request.headers.get("cf-ipcountry") || "BR";

  // Detecção de cabeçalhos de prefetch/preview (leitor de QR Code ou navegador pré-carregando link)
  const purpose =
    request.headers.get("purpose") ||
    request.headers.get("sec-purpose") ||
    request.headers.get("x-purpose") ||
    request.headers.get("x-moz");
  const isPrefetch = Boolean(purpose && /prefetch|preview/i.test(purpose));

  // Detecção de bots / crawlers de link preview
  const isBotOrCrawler = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegrambot|twitterbot|slackbot|google-inspectiontool|applebot/i.test(
    userAgent
  );

  // Classificação robusta de dispositivo (evita classificar câmeras/scanners mobile como Desktop)
  let device = "Desktop";
  if (/ipad|tablet/i.test(userAgent)) {
    device = "Tablet";
  } else if (
    /iphone|ipod|android|mobile|blackberry|iemobile|kindle|silk|opera mini/i.test(
      userAgent
    )
  ) {
    device = "Mobile";
  }

  let os = "Outro";
  if (/windows/i.test(userAgent)) os = "Windows";
  else if (/iphone|ipad|ipod/i.test(userAgent)) os = "iOS";
  else if (/android/i.test(userAgent)) os = "Android";
  else if (/macintosh|mac os x/i.test(userAgent)) os = "macOS";
  else if (/linux/i.test(userAgent)) os = "Linux";

  let browser = "Outro";
  if (/edg/i.test(userAgent)) browser = "Edge";
  else if (/chrome|crios/i.test(userAgent)) browser = "Chrome";
  else if (/firefox|fxios/i.test(userAgent)) browser = "Firefox";
  else if (/safari/i.test(userAgent)) browser = "Safari";

  // 6. Registro ASSÍNCRONO do clique (Não bloqueia o redirect)
  // Ignora requisições de prefetch puro ou bots para não inflar métricas humanas
  if (!isPrefetch && !isBotOrCrawler) {
    const trackClickPromise = (async () => {
      try {
        // Se for acesso por QR Code, deduplica escaneamento rápido (janela de 4s para debounce entre scanner e browser)
        if (isQrScan) {
          const recentScan = await db.click.findFirst({
            where: {
              smartLinkId: link.id,
              isQrScan: true,
              timestamp: { gte: new Date(Date.now() - 4000) },
            },
            select: { id: true },
          });

          if (recentScan) {
            // Já contabilizado na abertura imediata do leitor de QR Code; evita segundo clique duplicado
            return;
          }
        }

        await db.$transaction([
          db.click.create({
            data: {
              id: clickId,
              smartLinkId: link.id,
              workspaceId: link.workspaceId,
              campaignId: link.campaignId,
              productId: link.productId,
              offerId: link.offerId,
              channelId: link.channelId,
              country,
              device,
              os,
              browser,
              referer: referer?.slice(0, 500),
              isQrScan,
            },
          }),
          db.smartLink.update({
            where: { id: link.id },
            data: {
              clickCount: { increment: 1 },
              qrScanCount: isQrScan ? { increment: 1 } : undefined,
            },
          }),
          ...(isQrScan
            ? [
                db.qrCode.updateMany({
                  where: { smartLinkId: link.id },
                  data: {
                    scanCount: { increment: 1 },
                  },
                }),
              ]
            : []),
        ]);
      } catch (err) {
        console.error("[Tracking Error]", err);
      }
    })();

    trackClickPromise.catch(() => {});
  }

  // 7. Resposta HTTP 302 Imediata com cabeçalhos anti-cache
  const response = NextResponse.redirect(destination, 302);
  response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("X-Linkzivo-Click-Id", clickId);

  return response;
}

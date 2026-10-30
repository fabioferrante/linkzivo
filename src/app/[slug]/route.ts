import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { generateClickId } from "@/lib/slug";

/**
 * Validação mandatória de AUTH_SECRET.
 * Em produção: é estritamente obrigatório possuir no mínimo 32 caracteres.
 * Caso esteja ausente ou com menos de 32 caracteres, a inicialização é imediatamente interrompida
 * com mensagem segura de erro, eliminando qualquer salt efêmero (que geraria inconsistência de
 * fingerprints entre réplicas/processos em cluster) e prevenindo execução insegura.
 * Em desenvolvimento/testes locais: provê comportamento conveniente sem reintroduzir fallback em produção.
 * O valor do segredo nunca é registrado em logs.
 */
function getValidatedAuthSalt(): string {
  const secret = process.env.AUTH_SECRET;
  const isValid = typeof secret === "string" && secret.trim().length >= 32;

  if (process.env.NODE_ENV === "production") {
    if (!isValid) {
      throw new Error(
        "[Fatal Security Error] AUTH_SECRET environment variable is missing or has less than 32 characters in production. Application startup aborted."
      );
    }
    return secret.trim();
  }

  // Ambiente de desenvolvimento / testes locais
  return isValid ? secret.trim() : "linkzivo-dev-local-salt-32chars-minimum-token";
}

// Em ambiente de produção, valida na carga do módulo para interromper o startup imediatamente
if (process.env.NODE_ENV === "production") {
  getValidatedAuthSalt();
}

/**
 * Constrói com segurança uma URL de redirecionamento interno garantindo que o cabeçalho
 * Location aponte exclusivamente para a origem pública canônica, sem expor portas ou hosts
 * internos de containers (ex: localhost:8080 ou 127.0.0.1).
 */
function getPublicInternalRedirectUrl(path: string, request: NextRequest): URL {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  // 1. Tenta utilizar a URL base canônica configurada
  if (rawAppUrl) {
    try {
      const parsed = new URL(rawAppUrl);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        const isLocalHost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "0.0.0.0";
        if (process.env.NODE_ENV !== "production" || !isLocalHost) {
          return new URL(cleanPath, parsed.origin);
        }
      }
    } catch {
      // Ignora erro de parsing e segue para fallback
    }
  }

  // 2. Fallback por cabeçalhos padrão de proxy reverso (Railway / Cloudflare / Nginx)
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";

  if (forwardedHost) {
    const isLocalHost = forwardedHost.startsWith("localhost") || forwardedHost.startsWith("127.0.0.1") || forwardedHost.startsWith("0.0.0.0");
    if (process.env.NODE_ENV !== "production" || !isLocalHost) {
      try {
        return new URL(cleanPath, `${forwardedProto}://${forwardedHost}`);
      } catch {
        // Fallback
      }
    }
  }

  // 3. Fallback de emergência baseado na requisição
  try {
    const origin = request.nextUrl?.origin || new URL(request.url).origin;
    const parsedOrigin = new URL(origin);

    if (process.env.NODE_ENV === "production") {
      const hostHeader = request.headers.get("host")?.split(":")[0]?.trim();
      if (hostHeader && hostHeader !== "localhost" && hostHeader !== "127.0.0.1") {
        return new URL(cleanPath, `https://${hostHeader}`);
      }
    }

    return new URL(cleanPath, origin);
  } catch {
    return new URL(cleanPath, request.url);
  }
}

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

  if (!link) {
    return NextResponse.redirect(getPublicInternalRedirectUrl("/not-found-link", request), 302);
  }

  // Se o Smart Link estiver pausado, retorna resposta controlada sem redirecionar e sem registrar métricas (Requisito 7)
  if (link.status === "PAUSED") {
    return NextResponse.redirect(getPublicInternalRedirectUrl("/paused-link", request), 302);
  }

  if (link.status !== "ACTIVE") {
    // Redireciona para página de erro 404 / não encontrado
    return NextResponse.redirect(getPublicInternalRedirectUrl("/not-found-link", request), 302);
  }

  // Checagem de expiração se configurada
  if (link.expiresAt && new Date() > link.expiresAt) {
    // Atualização condicional assíncrona para EXPIRED (não-bloqueante e segura contra sobrescrita)
    db.smartLink
      .updateMany({
        where: { id: link.id, status: "ACTIVE", expiresAt: { lte: new Date() } },
        data: { status: "EXPIRED", pauseReason: null, previousStatus: null },
      })
      .catch(() => {});

    if (link.fallbackUrl) {
      return NextResponse.redirect(link.fallbackUrl, 302);
    }
    return NextResponse.redirect(getPublicInternalRedirectUrl("/expired-link", request), 302);
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

  // Headers de Client Hints móveis
  const secChMobile = request.headers.get("sec-ch-ua-mobile");
  const secChPlatform = request.headers.get("sec-ch-ua-platform");

  // Classificação precisa de dispositivo
  let device = "Desktop";
  const isTablet = /ipad|tablet/i.test(userAgent);
  const isMobileUa = /iphone|ipod|android|mobile|blackberry|iemobile|kindle|silk|opera mini|cfnetwork|darwin|dalvik|lens|barcode|scanner|camera/i.test(userAgent);
  const isMobileHint = secChMobile === "?1" || /ios|android/i.test(secChPlatform || "");

  if (isTablet) {
    device = "Tablet";
  } else if (isMobileUa || isMobileHint) {
    device = "Mobile";
  } else if (isQrScan) {
    // Escaneamento de QR Code provém quase universalmente de dispositivo móvel (câmera)
    // Se não for explicitamente um desktop Windows NT puro sem scanner, classifica como Mobile
    if (/windows nt/i.test(userAgent) && !/mobile|phone|android/i.test(userAgent)) {
      device = "Desktop";
    } else {
      device = "Mobile";
    }
  }

  let os = "Outro";
  if (/windows/i.test(userAgent)) os = "Windows";
  else if (/iphone|ipad|ipod|darwin|cfnetwork/i.test(userAgent)) os = "iOS";
  else if (/android|dalvik/i.test(userAgent)) os = "Android";
  else if (/macintosh|mac os x/i.test(userAgent)) os = "macOS";
  else if (/linux/i.test(userAgent)) os = "Linux";

  let browser = "Outro";
  if (/edg/i.test(userAgent)) browser = "Edge";
  else if (/chrome|crios/i.test(userAgent)) browser = "Chrome";
  else if (/firefox|fxios/i.test(userAgent)) browser = "Firefox";
  else if (/safari/i.test(userAgent)) browser = "Safari";

  // 6. Registro do clique
  // Ignora requisições de prefetch puro ou bots para não inflar métricas humanas
  let recordedQrScan = false;

  if (!isPrefetch && !isBotOrCrawler) {
    let shouldRecord = true;

    if (isQrScan) {
      // 6.1. Validação do cookie de correlação (para acessos sequenciais/retries nos 15s)
      const qrCookie = request.cookies.get(`__lz_qr_${link.id}`)?.value;
      if (qrCookie && qrCookie.length >= 8 && qrCookie.length <= 40) {
        try {
          const existingScan = await db.click.findFirst({
            where: {
              id: qrCookie,
              smartLinkId: link.id,
              isQrScan: true,
              timestamp: { gte: new Date(Date.now() - 15000) },
            },
            select: { id: true },
          });

          if (existingScan) {
            shouldRecord = false;
            recordedQrScan = true;
          }
        } catch {
          // Em caso de erro transitório de leitura, prossegue para verificação transacional
        }
      }
    }

    if (shouldRecord) {
      // 6.2. Obtenção do endereço IP e identificadores de rede disponíveis
      // DOCUMENTAÇÃO E LIMITAÇÕES DE SEGURANÇA DE REDE:
      // A ordem de resolução (cf-connecting-ip -> x-real-ip -> x-forwarded-for) é preservada
      // para compatibilidade com a infraestrutura de borda/CDN.
      // GARANTIA COMPROVADA: A expressão regular /^[\da-f.:]{3,45}$/i valida unicamente
      // a conformidade sintática do formato do endereço (IPv4/IPv6 sanitizado).
      // LIMITAÇÃO INERENTE: A regex NÃO comprova autenticidade ou procedência da origem do endereço IP.
      // Em ambientes sem garantia estrita da camada de borda (ex.: edge proxies que não sobrescrevam
      // ou expurguem cabeçalhos forjados), cabeçalhos HTTP podem ser manipulados pelo cliente externo.
      // A confiança na origem não pode ser comprovada exclusivamente a nível de aplicação Next.js.
      // O fingerprint gerado atua estritamente como uma heurística de amortecimento de concorrência
      // para deduplicação temporária de QR Codes (janela de 3s), e NUNCA como mecanismo de autenticação ou autorização.
      // O endereço IP bruto NUNCA é persistido nem registrado em logs (em conformidade com a LGPD e privacidade).
      const rawClientIp =
        request.headers.get("cf-connecting-ip") ||
        request.headers.get("x-real-ip") ||
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "127.0.0.1";
      const clientIp = /^[\da-f.:]{3,45}$/i.test(rawClientIp) ? rawClientIp : "127.0.0.1";
      const acceptLang = request.headers.get("accept-language") || "";
      const salt = getValidatedAuthSalt();

      // Pseudonimização unidirecional criptográfica (sem armazenar IP bruto)
      // LIMITAÇÃO DE COLISÃO: Visitantes compartilhando a mesma rede (mesmo IP público via NAT/Wi-Fi),
      // mesmo User-Agent (mesmo dispositivo/versão) e mesmo Accept-Language produzirão o mesmo fingerprint.
      // Dentro da janela de 3 segundos, acessos simultâneos desses usuários colidirão e serão amortecidos.
      const clientFingerprint = crypto
        .createHash("sha256")
        .update(`${clientIp}:${userAgent}:${acceptLang}:${salt}`)
        .digest("hex");

      const lockId = crypto
        .createHash("sha256")
        .update(`${link.id}:${clientFingerprint}`)
        .digest("hex");

      const now = new Date();
      const lockWindowMs = 3000; // Janela de 3 segundos para absorver concorrência de pré-carregamento móvel
      const lockedUntil = new Date(now.getTime() + lockWindowMs);

      // 6.3. Transação Atômica Unificada: Lock + Click + Contadores sob garantia ACID do PostgreSQL
      try {
        await db.$transaction(async (tx) => {
          if (isQrScan) {
            // Operação de idempotência atômica no PostgreSQL apoiada em constraint primária:
            // Tenta inserir o lock; se colidir (concorrência simultânea), só assume se o lock anterior estiver expirado (< NOW()).
            const lockRows = await tx.$queryRaw<Array<{ id: string }>>`
              INSERT INTO "QrScanLock" ("id", "smartLinkId", "clickId", "lockedUntil", "createdAt")
              VALUES (${lockId}, ${link.id}, ${clickId}, ${lockedUntil}, NOW())
              ON CONFLICT ("id") DO UPDATE
              SET "clickId" = EXCLUDED."clickId",
                  "lockedUntil" = EXCLUDED."lockedUntil"
              WHERE "QrScanLock"."lockedUntil" < NOW()
              RETURNING "id";
            `;

            if (!lockRows || lockRows.length === 0) {
              // Lock ativo pertencente a outra requisição concorrente do mesmo escaneamento.
              // Aborta a gravação do clique e contadores nesta requisição duplicada sem gerar erro.
              recordedQrScan = true;
              return;
            }
          }

          // Gravação atômica do Click dentro da MESMA transação
          await tx.click.create({
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
          });

          // Atualização atômica dos contadores no SmartLink dentro da MESMA transação
          await tx.smartLink.update({
            where: { id: link.id },
            data: {
              clickCount: { increment: 1 },
              qrScanCount: isQrScan ? { increment: 1 } : undefined,
            },
          });

          if (isQrScan) {
            await tx.qrCode.updateMany({
              where: { smartLinkId: link.id },
              data: {
                scanCount: { increment: 1 },
              },
            });
            recordedQrScan = true;
          }
        });

        // Limpeza assíncrona não bloqueante de locks expirados antigos (> 60s)
        if (isQrScan) {
          db.qrScanLock
            .deleteMany({
              where: {
                lockedUntil: { lt: new Date(Date.now() - 60000) },
              },
            })
            .catch(() => {});
        }
      } catch (err) {
        console.error("[Tracking Transaction Error]", err);
        // Em caso de erro na transação, o PostgreSQL executou ROLLBACK automático:
        // Nenhum lock órfão foi deixado, nenhum click parcial foi gravado e contadores permanecem consistentes.
      }
    }
  }

  // 7. Resposta HTTP 302 Imediata com cabeçalhos anti-cache
  const response = NextResponse.redirect(destination, 302);
  response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("X-Linkzivo-Click-Id", clickId);

  // Anexa cookie efêmero de correlação apenas quando o acesso de QR Code for gravado ou já estiver ativo
  // Max-Age de 15s: expira rapidamente e não realiza rastreamento persistente de visitantes
  if (isQrScan && recordedQrScan) {
    response.cookies.set({
      name: `__lz_qr_${link.id}`,
      value: clickId,
      maxAge: 15,
      path: `/${slug}`,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  return response;
}

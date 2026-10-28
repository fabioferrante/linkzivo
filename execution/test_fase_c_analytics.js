/**
 * LINKZIVO — Suíte de Testes Automatizados da Fase C (Limitação de Analytics por Plano)
 * 
 * Validação rigorosa dos 11 requisitos obrigatórios:
 * 1. FREE consegue consultar dados dentro dos últimos 30 dias.
 * 2. FREE não recebe eventos anteriores ao limite de 30 dias.
 * 3. CREATOR consegue consultar dados dentro dos últimos 365 dias.
 * 4. CREATOR não recebe eventos anteriores ao limite de 365 dias.
 * 5. Eventos exatamente no limite temporal têm comportamento consistente e documentado (gte).
 * 6. Consultas com datas/períodos manipulados (ex: 90d, all, 9999d no Free) são estritamente truncadas para 30d.
 * 7. Gráficos (dailyTimeline) e agregações (deviceBreakdown, osBreakdown, recentClicks) não incluem eventos fora da janela.
 * 8. Endpoints alternativos (GET /api/campaigns/[id] e GET /api/products/[id]) respeitam a mesma política.
 * 9. Um workspace não consegue consultar analytics de outro workspace (isolamento estrito).
 * 10. Os dados históricos permanecem íntegros no banco (retenção lógica sem purge destrutivo).
 * 11. Mudança de plano dinâmica (upgrade de Free para Creator desbloqueia cliques históricos imediatamente).
 */

const { PrismaClient } = require("@prisma/client");
const { NextRequest } = require("next/server");
const crypto = require("crypto");

// ============================================================================
// 1. SAFETY GATE ESTÁTICO
// ============================================================================
function validateSafetyGateStatic(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string" || !rawUrl.trim()) {
    throw new Error("[SAFETY GATE BLOQUEIO]: DATABASE_URL ausente. Aponte para 'linkzivo_test_isolated'.");
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error("[SAFETY GATE BLOQUEIO]: Formato inválido de DATABASE_URL.");
  }

  const allowedProtocols = ["postgresql:", "postgres:"];
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(`[SAFETY GATE BLOQUEIO]: Protocolo '${parsed.protocol}' não autorizado.`);
  }

  const allowedHosts = ["localhost", "127.0.0.1"];
  if (!allowedHosts.includes(parsed.hostname)) {
    throw new Error(`[SAFETY GATE BLOQUEIO]: Host '${parsed.hostname}' não autorizado.`);
  }

  if (parsed.port !== "5432") {
    throw new Error(`[SAFETY GATE BLOQUEIO]: Porta '${parsed.port}' não autorizada. Esperada: 5432.`);
  }

  const dbName = parsed.pathname.replace(/^\//, "");
  if (dbName !== "linkzivo_test_isolated") {
    throw new Error(`[SAFETY GATE BLOQUEIO]: Banco '${dbName}' não autorizado! Permitido exclusivamente: 'linkzivo_test_isolated'.`);
  }
}

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/linkzivo_test_isolated?schema=public";
validateSafetyGateStatic(TEST_DATABASE_URL);
process.env.DATABASE_URL = TEST_DATABASE_URL;

const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DATABASE_URL } },
});

// Importação dos handlers reais e serviços
const { GET: getAnalyticsHandler } = require("../src/app/api/analytics/route");
const { GET: getCampaignHandler } = require("../src/app/api/campaigns/[id]/route");
const { GET: getProductHandler } = require("../src/app/api/products/[id]/route");
const { getAnalyticsDateRange, getAnalyticsRetentionDays } = require("../src/lib/plans");
const { signSessionToken } = require("../src/lib/auth");

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`  ❌ FALHA: ${message}`);
    throw new Error(`Asserção falhou: ${message}`);
  }
  passedTests++;
  console.log(`  ✅ ${message}`);
}

// Helpers para autenticação e requests HTTP reais
async function createAuthSession(userId, workspaceId) {
  const session = await prisma.session.create({
    data: {
      userId,
      workspaceId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  const rawPayload = `${session.id}:${userId}:${workspaceId}`;
  return signSessionToken(rawPayload);
}

function makeGetRequest(urlPath, signedToken) {
  const url = `http://localhost:3000${urlPath}`;
  const headers = new Headers();
  if (signedToken) {
    headers.set("cookie", `linkzivo_session=${signedToken}`);
  }
  return new NextRequest(url, { method: "GET", headers });
}

// ============================================================================
// EXECUÇÃO PRINCIPAL DOS TESTES
// ============================================================================
async function runSuite() {
  console.log("================================================================================");
  console.log("LINKZIVO — INICIANDO SUÍTE DE TESTES DA FASE C (ANALYTICS POR PLANO)");
  console.log("================================================================================\n");

  const runId = Date.now();
  const emailFree = `user_free_${runId}@linkzivotest.com`;
  const emailCreator = `user_creator_${runId}@linkzivotest.com`;
  const emailOther = `user_other_${runId}@linkzivotest.com`;

  let userFree, wsFree, tokenFree;
  let userCreator, wsCreator, tokenCreator;
  let userOther, wsOther, tokenOther;

  let linkFree1, linkCreator1, linkOther1;
  let campaignFree, productFree;

  try {
    // ------------------------------------------------------------------------
    // SETUP: Criação de Usuários e Workspaces sintéticos
    // ------------------------------------------------------------------------
    console.log("--- Setup: Provisionando workspaces de teste ---");

    userFree = await prisma.user.create({
      data: { email: emailFree, name: "User Free Test" },
    });
    wsFree = await prisma.workspace.create({
      data: {
        userId: userFree.id,
        name: `Workspace Free ${runId}`,
        slug: `ws-free-${runId}`,
        plan: "FREE",
      },
    });
    tokenFree = await createAuthSession(userFree.id, wsFree.id);

    userCreator = await prisma.user.create({
      data: { email: emailCreator, name: "User Creator Test" },
    });
    wsCreator = await prisma.workspace.create({
      data: {
        userId: userCreator.id,
        name: `Workspace Creator ${runId}`,
        slug: `ws-creator-${runId}`,
        plan: "CREATOR",
      },
    });
    tokenCreator = await createAuthSession(userCreator.id, wsCreator.id);

    userOther = await prisma.user.create({
      data: { email: emailOther, name: "User Other Test" },
    });
    wsOther = await prisma.workspace.create({
      data: {
        userId: userOther.id,
        name: `Workspace Other ${runId}`,
        slug: `ws-other-${runId}`,
        plan: "FREE",
      },
    });
    tokenOther = await createAuthSession(userOther.id, wsOther.id);

    // Links de teste
    linkFree1 = await prisma.smartLink.create({
      data: {
        workspaceId: wsFree.id,
        slug: `link-free-${runId}`,
        destinationUrl: "https://example.com/free",
        title: "Link Free 1",
      },
    });

    linkCreator1 = await prisma.smartLink.create({
      data: {
        workspaceId: wsCreator.id,
        slug: `link-creator-${runId}`,
        destinationUrl: "https://example.com/creator",
        title: "Link Creator 1",
      },
    });

    linkOther1 = await prisma.smartLink.create({
      data: {
        workspaceId: wsOther.id,
        slug: `link-other-${runId}`,
        destinationUrl: "https://example.com/other",
        title: "Link Other 1",
      },
    });

    // Campanha e Produto vinculados ao workspace Free
    campaignFree = await prisma.campaign.create({
      data: {
        workspaceId: wsFree.id,
        name: `Campanha Free ${runId}`,
        status: "ACTIVE",
      },
    });

    productFree = await prisma.product.create({
      data: {
        workspaceId: wsFree.id,
        name: `Produto Free ${runId}`,
        status: "ACTIVE",
      },
    });

    // Associar linkFree1 à campanha e produto
    await prisma.smartLink.update({
      where: { id: linkFree1.id },
      data: {
        campaignId: campaignFree.id,
        productId: productFree.id,
      },
    });

    console.log("Workspaces e Links criados com sucesso.");

    // ------------------------------------------------------------------------
    // SETUP: Inserção de Cliques e Conversões sintéticos com idades controladas
    // ------------------------------------------------------------------------
    console.log("--- Setup: Inserindo cliques sintéticos com idades temporais precisas ---");
    const nowMs = Date.now();
    const msInDay = 24 * 60 * 60 * 1000;

    // Helper para gerar clique com timestamp retroativo
    async function createClick(smartLinkId, workspaceId, daysAgo, extra = {}) {
      const ts = new Date(nowMs - daysAgo * msInDay);
      return prisma.click.create({
        data: {
          id: `click-${smartLinkId.slice(-6)}-${daysAgo}-${crypto.randomBytes(4).toString("hex")}`,
          smartLinkId,
          workspaceId,
          timestamp: ts,
          device: extra.device || "Mobile",
          os: extra.os || "Android",
          browser: extra.browser || "Chrome",
          country: extra.country || "BR",
          city: extra.city || "São Paulo",
          isQrScan: Boolean(extra.isQrScan),
        },
      });
    }

    // Helper para gerar conversão retroativa
    async function createConversion(smartLinkId, campaignId, productId, daysAgo, amount) {
      const ts = new Date(nowMs - daysAgo * msInDay);
      return prisma.conversion.create({
        data: {
          smartLinkId,
          campaignId,
          productId,
          amount,
          commissionAmount: amount * 0.1,
          status: "CONFIRMED",
          timestamp: ts,
        },
      });
    }

    // Cliques no workspace FREE:
    // Dentro da janela de 30 dias:
    await createClick(linkFree1.id, wsFree.id, 2, { device: "Mobile", os: "iOS", isQrScan: false });
    await createClick(linkFree1.id, wsFree.id, 10, { device: "Desktop", os: "Windows", isQrScan: true });
    await createClick(linkFree1.id, wsFree.id, 25, { device: "Mobile", os: "Android", isQrScan: false });

    // Fora da janela de 30 dias do FREE:
    await createClick(linkFree1.id, wsFree.id, 35, { device: "Desktop", os: "macOS" });
    await createClick(linkFree1.id, wsFree.id, 60, { device: "Tablet", os: "iPadOS" });
    await createClick(linkFree1.id, wsFree.id, 180, { device: "Mobile", os: "Android" });
    await createClick(linkFree1.id, wsFree.id, 400, { device: "Desktop", os: "Linux" });

    // Conversões no workspace FREE:
    await createConversion(linkFree1.id, campaignFree.id, productFree.id, 5, 100.0); // 5 dias (dentro)
    await createConversion(linkFree1.id, campaignFree.id, productFree.id, 45, 200.0); // 45 dias (fora de 30d)

    // Cliques no workspace CREATOR:
    await createClick(linkCreator1.id, wsCreator.id, 5, { device: "Desktop", os: "Windows" });
    await createClick(linkCreator1.id, wsCreator.id, 50, { device: "Mobile", os: "iOS" });
    await createClick(linkCreator1.id, wsCreator.id, 120, { device: "Tablet", os: "Android" });
    await createClick(linkCreator1.id, wsCreator.id, 300, { device: "Mobile", os: "Android" });
    await createClick(linkCreator1.id, wsCreator.id, 400, { device: "Desktop", os: "macOS" }); // 400 dias (fora de 365d)

    // Cliques no workspace OTHER:
    await createClick(linkOther1.id, wsOther.id, 1, { device: "Desktop", os: "Windows" });

    console.log("Cliques e conversões sintéticos inseridos.\n");

    // ========================================================================
    // TESTE 1: FREE consulta dados dentro dos últimos 30 dias (HTTP GET /api/analytics)
    // ========================================================================
    console.log("--- Grupo 1: Validação do Plano FREE ---");
    {
      const req = makeGetRequest("/api/analytics?period=30d", tokenFree);
      const res = await getAnalyticsHandler(req);
      assert(res.status === 200, "GET /api/analytics para Free retorna HTTP 200 OK");
      const data = await res.json();

      assert(data.period === "30d", "Período retornado no Free é '30d'");
      assert(data.retentionDays === 30, "Metadado retentionDays é 30 no Free");
      assert(data.effectiveDays === 30, "Metadado effectiveDays é 30 no Free");
      assert(data.totalClicks === 3, `Free recebe exatamente os 3 cliques dentro dos 30 dias (recebeu ${data.totalClicks})`);
      assert(data.totalQrScans === 1, `Free calcula corretamente 1 QR scan dentro dos 30 dias`);
      assert(data.conversionsCount === 1, `Free calcula apenas a conversão recente de 5 dias atrás (recebeu ${data.conversionsCount})`);
      assert(data.confirmedCommission === 10, `Comissão confirmada reflete apenas a conversão recente (recebeu ${data.confirmedCommission})`);
    }

    // ========================================================================
    // TESTE 2: FREE não recebe eventos anteriores ao limite de 30 dias
    // ========================================================================
    {
      const req = makeGetRequest("/api/analytics?period=30d", tokenFree);
      const res = await getAnalyticsHandler(req);
      const data = await res.json();

      const timestamps = data.recentClicks.map(c => new Date(c.timestamp).getTime());
      const cutoff30d = nowMs - 30 * msInDay;
      const hasOldClick = timestamps.some(t => t < cutoff30d);
      assert(!hasOldClick, "Nenhum clique retornado em recentClicks tem data anterior a 30 dias");
    }

    // ========================================================================
    // TESTE 3 & 4: CREATOR consulta até 365 dias e bloqueia eventos > 365 dias
    // ========================================================================
    console.log("\n--- Grupo 2: Validação do Plano CREATOR ---");
    {
      const req = makeGetRequest("/api/analytics?period=all", tokenCreator);
      const res = await getAnalyticsHandler(req);
      assert(res.status === 200, "GET /api/analytics para Creator retorna HTTP 200 OK");
      const data = await res.json();

      assert(data.period === "365d", "Creator solicitando 'all' recebe period: '365d'");
      assert(data.retentionDays === 365, "Creator tem retentionDays: 365");
      assert(data.effectiveDays === 365, "Creator tem effectiveDays: 365");
      // Criamos 5 cliques para o Creator: 5d, 50d, 120d, 300d (4 dentro) e 400d (1 fora)
      assert(data.totalClicks === 4, `Creator recebe exatamente os 4 cliques dentro dos 365 dias (recebeu ${data.totalClicks})`);

      const timestamps = data.recentClicks.map(c => new Date(c.timestamp).getTime());
      const cutoff365d = nowMs - 365 * msInDay;
      const hasOldClick = timestamps.some(t => t < cutoff365d);
      assert(!hasOldClick, "Nenhum clique retornado ao Creator tem data anterior a 365 dias (o de 400d foi excluído)");
    }

    // ========================================================================
    // TESTE 5: Comportamento consistente no limite temporal exato (gte)
    // ========================================================================
    console.log("\n--- Grupo 3: Comportamento no Limite Temporal Exato (gte) ---");
    {
      const fixedNow = new Date("2026-10-27T12:00:00.000Z");
      const range = getAnalyticsDateRange("FREE", "30d", { now: fixedNow });
      const expectedCutoff = new Date(fixedNow.getTime() - 30 * 24 * 60 * 60 * 1000);

      assert(
        range.startDate.getTime() === expectedCutoff.getTime(),
        `startDate calculado (${range.startDate.toISOString()}) é exatamente 30 dias em UTC (${expectedCutoff.toISOString()})`
      );

      // Inserir dois cliques de teste no limite cirúrgico:
      // Clique A: exatamente no startDate (deve ser incluído pelo gte)
      const exactClick = await prisma.click.create({
        data: {
          id: `click-exact-${runId}`,
          smartLinkId: linkFree1.id,
          workspaceId: wsFree.id,
          timestamp: range.startDate,
        },
      });

      // Clique B: 1 milissegundo antes de startDate (deve ser excluído pelo gte)
      const outsideClick = await prisma.click.create({
        data: {
          id: `click-outside-${runId}`,
          smartLinkId: linkFree1.id,
          workspaceId: wsFree.id,
          timestamp: new Date(range.startDate.getTime() - 1),
        },
      });

      // Consulta no banco usando a regra canônica gte: startDate
      const result = await prisma.click.findMany({
        where: {
          workspaceId: wsFree.id,
          id: { in: [exactClick.id, outsideClick.id] },
          timestamp: { gte: range.startDate },
        },
      });

      assert(result.length === 1, `Filtro gte selecionou exatamente 1 dos 2 cliques`);
      assert(result[0].id === exactClick.id, `O clique exatamente no timestamp de startDate foi incluído`);
      assert(!result.some(c => c.id === outsideClick.id), `O clique de (startDate - 1ms) foi excluído`);

      // Limpeza dos cliques de teste de limite
      await prisma.click.deleteMany({
        where: { id: { in: [exactClick.id, outsideClick.id] } },
      });
    }

    // ========================================================================
    // TESTE 6: Parâmetros manipulados pelo cliente não ampliam a janela permitida
    // ========================================================================
    console.log("\n--- Grupo 4: Blindagem contra Manipulação de Parâmetros de Data ---");
    {
      // Free tenta pedir 90 dias
      const req90 = makeGetRequest("/api/analytics?period=90d", tokenFree);
      const res90 = await getAnalyticsHandler(req90);
      const data90 = await res90.json();
      assert(data90.period === "30d", "Free solicitando '90d' tem o período truncado para '30d'");
      assert(data90.totalClicks === 3, "Free pedindo 90d não recebe cliques de 35d ou 60d");

      // Free tenta pedir 'all'
      const reqAll = makeGetRequest("/api/analytics?period=all", tokenFree);
      const resAll = await getAnalyticsHandler(reqAll);
      const dataAll = await resAll.json();
      assert(dataAll.period === "30d", "Free solicitando 'all' tem o período truncado para '30d'");
      assert(dataAll.totalClicks === 3, "Free pedindo 'all' não recebe cliques além de 30d");

      // Free tenta pedir 9999 dias
      const req9999 = makeGetRequest("/api/analytics?period=9999d", tokenFree);
      const res9999 = await getAnalyticsHandler(req9999);
      const data9999 = await res9999.json();
      assert(data9999.period === "30d", "Free solicitando '9999d' é truncado para '30d'");
      assert(data9999.totalClicks === 3, "Free pedindo 9999d continua restrito a 3 cliques");

      // Creator tenta pedir 730 dias
      const req730 = makeGetRequest("/api/analytics?period=730d", tokenCreator);
      const res730 = await getAnalyticsHandler(req730);
      const data730 = await res730.json();
      assert(data730.period === "365d", "Creator solicitando '730d' é truncado para '365d'");
      assert(data730.totalClicks === 4, "Creator pedindo 730d não recebe o clique de 400d");
    }

    // ========================================================================
    // TESTE 7: Gráficos e Agregações não incluem eventos fora da janela
    // ========================================================================
    console.log("\n--- Grupo 5: Integridade de Agregações e Gráficos ---");
    {
      const req = makeGetRequest("/api/analytics?period=30d", tokenFree);
      const res = await getAnalyticsHandler(req);
      const data = await res.json();

      // Soma de todos os dispositivos na quebra
      const totalInDeviceBreakdown = data.deviceBreakdown.reduce((acc, d) => acc + d.count, 0);
      assert(
        totalInDeviceBreakdown === data.totalClicks,
        `Soma do deviceBreakdown (${totalInDeviceBreakdown}) é idêntica a totalClicks (${data.totalClicks})`
      );

      // Soma de todos os cliques na dailyTimeline
      const totalInTimeline = data.dailyTimeline.reduce((acc, d) => acc + d.clicks, 0);
      assert(
        totalInTimeline === data.totalClicks,
        `Soma da dailyTimeline (${totalInTimeline}) é idêntica a totalClicks (${data.totalClicks})`
      );

      // Nenhum dispositivo ou SO de cliques antigos (ex: Tablet/iPadOS de 60 dias atrás) deve existir no Free
      const hasOldOs = data.osBreakdown.some(o => o.name === "iPadOS");
      assert(!hasOldOs, "SO de clique fora da janela ('iPadOS' de 60d) não polui osBreakdown no Free");
    }

    // ========================================================================
    // TESTE 8: Endpoints alternativos (Campanhas e Produtos) respeitam a retenção
    // ========================================================================
    console.log("\n--- Grupo 6: Endpoints Alternativos (Campanhas e Produtos) ---");
    {
      // GET /api/campaigns/[id]
      const reqCamp = makeGetRequest(`/api/campaigns/${campaignFree.id}`, tokenFree);
      const resCamp = await getCampaignHandler(reqCamp, {
        params: Promise.resolve({ id: campaignFree.id }),
      });
      assert(resCamp.status === 200, "GET /api/campaigns/[id] retorna HTTP 200");
      const campData = await resCamp.json();
      assert(
        campData.campaign.conversions.length === 1,
        `Campanha no Free retorna apenas 1 conversão dentro dos 30 dias (recebeu ${campData.campaign.conversions.length})`
      );
      assert(
        campData.metrics.totalClicks === 3,
        `Métricas da campanha no Free contêm apenas os 3 cliques dentro dos 30 dias (recebeu ${campData.metrics.totalClicks})`
      );

      // GET /api/products/[id]
      const reqProd = makeGetRequest(`/api/products/${productFree.id}`, tokenFree);
      const resProd = await getProductHandler(reqProd, {
        params: Promise.resolve({ id: productFree.id }),
      });
      assert(resProd.status === 200, "GET /api/products/[id] retorna HTTP 200");
      const prodData = await resProd.json();
      assert(
        prodData.product.conversions.length === 1,
        `Produto no Free retorna apenas 1 conversão dentro dos 30 dias (recebeu ${prodData.product.conversions.length})`
      );
      assert(
        prodData.metrics.totalClicks === 3,
        `Métricas do produto no Free contêm apenas os 3 cliques dentro dos 30 dias (recebeu ${prodData.metrics.totalClicks})`
      );
    }

    // ========================================================================
    // TESTE 9: Isolamento entre Workspaces (Sem vazamento de dados analíticos)
    // ========================================================================
    console.log("\n--- Grupo 7: Isolamento Rigoroso por Workspace (IDOR Protection) ---");
    {
      // Free consulta analytics
      const req = makeGetRequest("/api/analytics", tokenFree);
      const res = await getAnalyticsHandler(req);
      const data = await res.json();

      // Nenhum clique do workspace Creator ou Other pode aparecer no Free
      const recentSlugs = data.recentClicks.map(c => c.slug);
      assert(!recentSlugs.includes(linkCreator1.slug), "Analytics do Free não contém cliques de links do Creator");
      assert(!recentSlugs.includes(linkOther1.slug), "Analytics do Free não contém cliques de links do Other");

      // Free tenta acessar campanha de outro workspace
      const reqCampIdor = makeGetRequest(`/api/campaigns/${campaignFree.id}`, tokenCreator);
      const resCampIdor = await getCampaignHandler(reqCampIdor, {
        params: Promise.resolve({ id: campaignFree.id }),
      });
      assert(resCampIdor.status === 404, "Workspace Creator recebe 404 ao tentar acessar campanha do Workspace Free");

      // Free tenta acessar produto de outro workspace
      const reqProdIdor = makeGetRequest(`/api/products/${productFree.id}`, tokenCreator);
      const resProdIdor = await getProductHandler(reqProdIdor, {
        params: Promise.resolve({ id: productFree.id }),
      });
      assert(resProdIdor.status === 404, "Workspace Creator recebe 404 ao tentar acessar produto do Workspace Free");
    }

    // ========================================================================
    // TESTE 10: Preservação de Dados Históricos (Sem Purge Destrutivo)
    // ========================================================================
    console.log("\n--- Grupo 8: Preservação de Dados Históricos no Banco de Dados ---");
    {
      const allDbClicks = await prisma.click.findMany({
        where: { workspaceId: wsFree.id },
      });
      // Inserimos 7 cliques no wsFree: 2d, 10d, 25d, 35d, 60d, 180d, 400d
      assert(
        allDbClicks.length === 7,
        `Todos os 7 cliques históricos permanecem intactos no banco de dados (encontrados ${allDbClicks.length})`
      );

      const allDbConversions = await prisma.conversion.findMany({
        where: { smartLink: { workspaceId: wsFree.id } },
      });
      assert(
        allDbConversions.length === 2,
        `Todas as 2 conversões históricas permanecem intactas no banco de dados`
      );
    }

    // ========================================================================
    // TESTE 11: Mudança de Plano Dinâmica (Upgrade Free -> Creator)
    // ========================================================================
    console.log("\n--- Grupo 9: Atualização de Plano Dinâmica em Tempo Real ---");
    {
      // 1. Antes do upgrade: Free vê 3 cliques
      const reqBefore = makeGetRequest("/api/analytics?period=all", tokenFree);
      const resBefore = await getAnalyticsHandler(reqBefore);
      const dataBefore = await resBefore.json();
      assert(dataBefore.totalClicks === 3, `Antes do upgrade: Free visualiza 3 cliques`);

      // 2. Realiza upgrade de plano do workspace diretamente no banco
      await prisma.workspace.update({
        where: { id: wsFree.id },
        data: { plan: "CREATOR" },
      });

      // 3. Imediatamente após o upgrade (mesmo token/sessão), a consulta reflete o novo teto
      const reqAfter = makeGetRequest("/api/analytics?period=all", tokenFree);
      const resAfter = await getAnalyticsHandler(reqAfter);
      const dataAfter = await resAfter.json();

      assert(dataAfter.period === "365d", "Após upgrade: período 'all' passa a entregar '365d'");
      assert(dataAfter.retentionDays === 365, "Após upgrade: retentionDays passa a 365");
      // Dos 7 cliques do wsFree, 6 têm <= 180 dias (2d, 10d, 25d, 35d, 60d, 180d) e 1 tem 400d.
      // Logo, o Creator deve ver exatamente 6 cliques!
      assert(
        dataAfter.totalClicks === 6,
        `Após upgrade: workspace passa a visualizar 6 cliques históricos retroativos (visualizou ${dataAfter.totalClicks})`
      );
      assert(
        dataAfter.conversionsCount === 2,
        `Após upgrade: ambas as conversões (5d e 45d) tornam-se visíveis (visualizou ${dataAfter.conversionsCount})`
      );
    }

    console.log("\n================================================================================");
    console.log(`SUÍTE DA FASE C CONCLUÍDA COM SUCESSO: ${passedTests} de ${totalTests} asserções aprovadas!`);
    console.log("================================================================================\n");
  } finally {
    // Limpeza de teardown isolada
    console.log("--- Teardown: Limpando registros de teste ---");
    if (wsFree?.id) {
      await prisma.conversion.deleteMany({ where: { smartLink: { workspaceId: wsFree.id } } }).catch(() => {});
      await prisma.click.deleteMany({ where: { workspaceId: wsFree.id } }).catch(() => {});
      await prisma.smartLink.deleteMany({ where: { workspaceId: wsFree.id } }).catch(() => {});
      await prisma.campaign.deleteMany({ where: { workspaceId: wsFree.id } }).catch(() => {});
      await prisma.product.deleteMany({ where: { workspaceId: wsFree.id } }).catch(() => {});
      await prisma.session.deleteMany({ where: { workspaceId: wsFree.id } }).catch(() => {});
      await prisma.workspace.deleteMany({ where: { id: wsFree.id } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: userFree.id } }).catch(() => {});
    }

    if (wsCreator?.id) {
      await prisma.click.deleteMany({ where: { workspaceId: wsCreator.id } }).catch(() => {});
      await prisma.smartLink.deleteMany({ where: { workspaceId: wsCreator.id } }).catch(() => {});
      await prisma.session.deleteMany({ where: { workspaceId: wsCreator.id } }).catch(() => {});
      await prisma.workspace.deleteMany({ where: { id: wsCreator.id } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: userCreator.id } }).catch(() => {});
    }

    if (wsOther?.id) {
      await prisma.click.deleteMany({ where: { workspaceId: wsOther.id } }).catch(() => {});
      await prisma.smartLink.deleteMany({ where: { workspaceId: wsOther.id } }).catch(() => {});
      await prisma.session.deleteMany({ where: { workspaceId: wsOther.id } }).catch(() => {});
      await prisma.workspace.deleteMany({ where: { id: wsOther.id } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: userOther.id } }).catch(() => {});
    }

    await prisma.$disconnect();
  }
}

runSuite().catch((err) => {
  console.error("\n❌ ERRO NA EXECUÇÃO DA SUÍTE DA FASE C:", err);
  process.exit(1);
});

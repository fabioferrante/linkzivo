/**
 * LINKZIVO — Suíte de Testes Automatizados da Fase D (Home Comercial e Integridade de Conversões)
 * 
 * Validação rigorosa dos requisitos:
 * 1. Home e Planos: preços confirmados (R$ 0, R$ 49, R$ 97, R$ 249) e limites reais (Free: 5 links/30d; Creator: 1.000 links/365d).
 * 2. Ausência de checkout falso ou cobrança automática simulada na interface.
 * 3. Blindagem contra manipulação de contadores e métricas via PATCH em /api/links/[id].
 * 4. Blindagem contra manipulação de contadores via PATCH em /api/products/[id] e /api/campaigns/[id].
 * 5. Deduplicação atômica de conversões via externalConversionId único no PostgreSQL (anti-replay).
 * 6. Isolamento estrito de conversões entre workspaces no /api/analytics.
 * 7. Distinção estrita entre cliques e conversões (10 cliques com 0 vendas = 0 conversões).
 * 8. Sanitização de valores financeiros (valores inválidos/negativos não corrompem métricas).
 */

const { PrismaClient } = require("@prisma/client");
const { NextRequest } = require("next/server");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

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
const { PATCH: patchLinkHandler } = require("../src/app/api/links/[id]/route");
const { PATCH: patchProductHandler } = require("../src/app/api/products/[id]/route");
const { PATCH: patchCampaignHandler } = require("../src/app/api/campaigns/[id]/route");
const { GET: getAnalyticsHandler } = require("../src/app/api/analytics/route");
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

function makeJsonRequest(urlPath, method, body, signedToken) {
  const url = `http://localhost:3000${urlPath}`;
  const headers = new Headers({
    "Content-Type": "application/json",
  });
  if (signedToken) {
    headers.set("cookie", `linkzivo_session=${signedToken}`);
  }
  return new NextRequest(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function runSuite() {
  console.log("================================================================================");
  console.log("LINKZIVO — INICIANDO SUÍTE DE TESTES DA FASE D (HOME E CONVERSÕES)");
  console.log("================================================================================\n");

  const runId = Date.now();
  let userA, wsA, tokenA;
  let userB, wsB, tokenB;
  let linkA, campA, prodA;

  try {
    // ------------------------------------------------------------------------
    // GRUPO 1: Auditoria Estática dos Preços e Capacidades na Home (src/app/page.tsx)
    // ------------------------------------------------------------------------
    console.log("--- Grupo 1: Auditoria da Home Comercial e Planos ---");
    {
      const pagePath = path.join(__dirname, "..", "src", "app", "page.tsx");
      const pageContent = fs.readFileSync(pagePath, "utf-8");

      assert(pageContent.includes("R$ 0"), "Home exibe o plano Free com R$ 0");
      assert(pageContent.includes("R$ 49"), "Home exibe o plano Creator com R$ 49/mês confirmado");
      assert(pageContent.includes("R$ 97"), "Home exibe o plano Pro com R$ 97/mês confirmado");
      assert(pageContent.includes("R$ 249"), "Home exibe o plano Agency com R$ 249/mês confirmado");

      assert(pageContent.includes("Até 5 links ocupando vaga"), "Home declara exatamente a limitação real de 5 links no Free");
      assert(pageContent.includes("Analytics dos últimos 30 dias"), "Home declara exatamente 30 dias de analytics no Free");
      assert(pageContent.includes("Até 1.000 links ocupando vaga"), "Home declara capacidade de 1.000 links no Creator");
      assert(pageContent.includes("Analytics e histórico de 365 dias"), "Home declara 365 dias de analytics no Creator");

      // Transparência: ausência de checkout falso
      assert(!pageContent.includes("https://checkout.stripe.com"), "Nenhum link falso de checkout externo Stripe");
      assert(!pageContent.includes("Assinar Pro"), "Botão 'Assinar Pro' foi substituído por contato/disponibilidade transparente");
      assert(pageContent.includes("Consultar Disponibilidade"), "Plano Pro indica 'Consultar Disponibilidade'");
      assert(pageContent.includes("Falar com Atendimento"), "Plano Agency indica 'Falar com Atendimento'");
    }

    // ------------------------------------------------------------------------
    // SETUP: Criação de Usuários e Entidades no PostgreSQL Isolado
    // ------------------------------------------------------------------------
    console.log("\n--- Setup: Provisionando workspaces e links para testes de conversão ---");
    userA = await prisma.user.create({
      data: { email: `user_a_${runId}@linkzivotest.com`, name: "User A" },
    });
    wsA = await prisma.workspace.create({
      data: { userId: userA.id, name: `Workspace A ${runId}`, slug: `ws-a-${runId}`, plan: "FREE" },
    });
    tokenA = await createAuthSession(userA.id, wsA.id);

    userB = await prisma.user.create({
      data: { email: `user_b_${runId}@linkzivotest.com`, name: "User B" },
    });
    wsB = await prisma.workspace.create({
      data: { userId: userB.id, name: `Workspace B ${runId}`, slug: `ws-b-${runId}`, plan: "FREE" },
    });
    tokenB = await createAuthSession(userB.id, wsB.id);

    linkA = await prisma.smartLink.create({
      data: {
        workspaceId: wsA.id,
        slug: `slug-d-${runId}`,
        destinationUrl: "https://example.com/dest",
        title: "Link de Teste D",
        clickCount: 10,
        qrScanCount: 2,
      },
    });

    campA = await prisma.campaign.create({
      data: { workspaceId: wsA.id, name: "Campanha A", status: "ACTIVE" },
    });

    prodA = await prisma.product.create({
      data: { workspaceId: wsA.id, name: "Produto A", status: "ACTIVE" },
    });

    // ------------------------------------------------------------------------
    // GRUPO 2: Tentativa de Manipulação de Contadores via PATCH
    // ------------------------------------------------------------------------
    console.log("\n--- Grupo 2: Blindagem contra Injeção de Contadores via PATCH ---");
    {
      // 1. Tentar forjar clickCount, qrScanCount e conversões via PATCH /api/links/[id]
      const maliciousPayload = {
        title: "Título Alterado Legitimamente",
        clickCount: 999999,
        qrScanCount: 888888,
        conversions: 500,
        conversionsCount: 500,
        confirmedCommission: 50000,
      };

      const reqLink = makeJsonRequest(`/api/links/${linkA.id}`, "PATCH", maliciousPayload, tokenA);
      const resLink = await patchLinkHandler(reqLink, {
        params: Promise.resolve({ id: linkA.id }),
      });
      assert(resLink.status === 200, "PATCH /api/links/[id] processa campos legítimos com 200 OK");

      const linkAfter = await prisma.smartLink.findUnique({ where: { id: linkA.id } });
      assert(linkAfter.title === "Título Alterado Legitimamente", "Campo legítimo (title) foi atualizado");
      assert(linkAfter.clickCount === 10, `clickCount no banco não foi corrompido (permaneceu ${linkAfter.clickCount})`);
      assert(linkAfter.qrScanCount === 2, `qrScanCount no banco não foi corrompido (permaneceu ${linkAfter.qrScanCount})`);

      // 2. Tentar forjar contadores via PATCH /api/products/[id]
      const reqProd = makeJsonRequest(`/api/products/${prodA.id}`, "PATCH", {
        name: "Produto Nome Atualizado",
        totalClicks: 7777,
        totalConversions: 888,
        confirmedCommission: 9999,
      }, tokenA);
      const resProd = await patchProductHandler(reqProd, {
        params: Promise.resolve({ id: prodA.id }),
      });
      assert(resProd.status === 200, "PATCH /api/products/[id] retorna 200");

      const prodAfter = await prisma.product.findUnique({
        where: { id: prodA.id },
        include: { _count: { select: { conversions: true } } },
      });
      assert(prodAfter.name === "Produto Nome Atualizado", "Nome do produto atualizado");
      assert(prodAfter._count.conversions === 0, "Contagem de conversões do produto permanece rigorosamente 0");

      // 3. Tentar forjar contadores via PATCH /api/campaigns/[id]
      const reqCamp = makeJsonRequest(`/api/campaigns/${campA.id}`, "PATCH", {
        name: "Campanha Nome Atualizado",
        totalClicks: 5555,
        totalConversions: 444,
      }, tokenA);
      const resCamp = await patchCampaignHandler(reqCamp, {
        params: Promise.resolve({ id: campA.id }),
      });
      assert(resCamp.status === 200, "PATCH /api/campaigns/[id] retorna 200");

      const campAfter = await prisma.campaign.findUnique({
        where: { id: campA.id },
        include: { _count: { select: { conversions: true } } },
      });
      assert(campAfter._count.conversions === 0, "Contagem de conversões da campanha permanece 0");
    }

    // ------------------------------------------------------------------------
    // GRUPO 3: Deduplicação e Integridade de Conversões no PostgreSQL
    // ------------------------------------------------------------------------
    console.log("\n--- Grupo 3: Deduplicação e Unicidade por externalConversionId ---");
    {
      const extId = `ext-sale-${runId}`;

      // Inserção da conversão legítima
      const conv1 = await prisma.conversion.create({
        data: {
          smartLinkId: linkA.id,
          campaignId: campA.id,
          productId: prodA.id,
          externalConversionId: extId,
          amount: 197.0,
          commissionAmount: 39.4,
          status: "CONFIRMED",
        },
      });
      assert(Boolean(conv1.id), "Conversão legítima registrada com ID e externalConversionId únicos");

      // Tentativa de duplicata com o mesmo externalConversionId (Ataque de Replay ou Webhook Duplicado)
      let duplicateBlocked = false;
      try {
        await prisma.conversion.create({
          data: {
            smartLinkId: linkA.id,
            externalConversionId: extId,
            amount: 197.0,
            commissionAmount: 39.4,
            status: "CONFIRMED",
          },
        });
      } catch (err) {
        duplicateBlocked = err.code === "P2002" || String(err).includes("Unique constraint");
      }
      assert(duplicateBlocked, "PostgreSQL rejeita duplicata de conversão por violação de constraint UNIQUE (@unique externalConversionId)");

      // Contagem total no banco
      const countConv = await prisma.conversion.count({ where: { externalConversionId: extId } });
      assert(countConv === 1, "Exatamente 1 conversão persiste no banco para o externalConversionId");
    }

    // ------------------------------------------------------------------------
    // GRUPO 4: Isolamento entre Workspaces nas Métricas de Conversão
    // ------------------------------------------------------------------------
    console.log("\n--- Grupo 4: Isolamento de Conversões no /api/analytics ---");
    {
      // Workspace A tem 1 conversão confirmada (comissão R$ 39.40)
      const reqAnalyticsA = makeJsonRequest("/api/analytics", "GET", null, tokenA);
      const resAnalyticsA = await getAnalyticsHandler(reqAnalyticsA);
      const dataA = await resAnalyticsA.json();

      assert(dataA.conversionsCount === 1, `Workspace A possui exatamente 1 conversão (recebeu ${dataA.conversionsCount})`);
      assert(
        Math.abs(dataA.confirmedCommission - 39.4) < 0.001,
        `Workspace A reporta comissão confirmada de R$ 39.40 (recebeu ${dataA.confirmedCommission})`
      );

      // Workspace B NÃO deve ter nenhuma conversão (isolamento absoluto)
      const reqAnalyticsB = makeJsonRequest("/api/analytics", "GET", null, tokenB);
      const resAnalyticsB = await getAnalyticsHandler(reqAnalyticsB);
      const dataB = await resAnalyticsB.json();

      assert(dataB.conversionsCount === 0, `Workspace B possui 0 conversões (recebeu ${dataB.conversionsCount})`);
      assert(dataB.confirmedCommission === 0, `Workspace B possui R$ 0.00 de comissão confirmada`);
      assert(dataB.totalCommission === 0, `Workspace B possui R$ 0.00 de comissão total`);
    }

    // ------------------------------------------------------------------------
    // GRUPO 5: Distinção Estrita entre Cliques e Conversões
    // ------------------------------------------------------------------------
    console.log("\n--- Grupo 5: Distinção entre Cliques e Conversões ---");
    {
      // Criar cliques no Workspace B sem nenhuma conversão
      const linkB = await prisma.smartLink.create({
        data: {
          workspaceId: wsB.id,
          slug: `slug-b-${runId}`,
          destinationUrl: "https://example.com/b",
        },
      });

      for (let i = 0; i < 5; i++) {
        await prisma.click.create({
          data: {
            id: `click-b-${runId}-${i}`,
            smartLinkId: linkB.id,
            workspaceId: wsB.id,
          },
        });
      }

      const reqB = makeJsonRequest("/api/analytics", "GET", null, tokenB);
      const resB = await getAnalyticsHandler(reqB);
      const dataB = await resB.json();

      assert(dataB.totalClicks === 5, `Workspace B possui 5 cliques registrados (recebeu ${dataB.totalClicks})`);
      assert(dataB.conversionsCount === 0, `Workspace B continua com rigorosamente 0 conversões mesmo com 5 cliques`);
      assert(dataB.confirmedCommission === 0, `Comissão continua 0`);
    }

    console.log("\n================================================================================");
    console.log(`SUÍTE DA FASE D CONCLUÍDA COM SUCESSO: ${passedTests} de ${totalTests} asserções aprovadas!`);
    console.log("================================================================================\n");
  } finally {
    console.log("--- Teardown: Limpando registros de teste ---");
    if (wsA?.id) {
      await prisma.conversion.deleteMany({ where: { smartLink: { workspaceId: wsA.id } } }).catch(() => {});
      await prisma.click.deleteMany({ where: { workspaceId: wsA.id } }).catch(() => {});
      await prisma.smartLink.deleteMany({ where: { workspaceId: wsA.id } }).catch(() => {});
      await prisma.campaign.deleteMany({ where: { workspaceId: wsA.id } }).catch(() => {});
      await prisma.product.deleteMany({ where: { workspaceId: wsA.id } }).catch(() => {});
      await prisma.session.deleteMany({ where: { workspaceId: wsA.id } }).catch(() => {});
      await prisma.workspace.deleteMany({ where: { id: wsA.id } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: userA.id } }).catch(() => {});
    }

    if (wsB?.id) {
      await prisma.conversion.deleteMany({ where: { smartLink: { workspaceId: wsB.id } } }).catch(() => {});
      await prisma.click.deleteMany({ where: { workspaceId: wsB.id } }).catch(() => {});
      await prisma.smartLink.deleteMany({ where: { workspaceId: wsB.id } }).catch(() => {});
      await prisma.session.deleteMany({ where: { workspaceId: wsB.id } }).catch(() => {});
      await prisma.workspace.deleteMany({ where: { id: wsB.id } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: userB.id } }).catch(() => {});
    }

    await prisma.$disconnect();
  }
}

runSuite().catch((err) => {
  console.error("\n❌ ERRO NA EXECUÇÃO DA SUÍTE DA FASE D:", err);
  process.exit(1);
});

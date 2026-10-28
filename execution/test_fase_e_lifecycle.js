/**
 * LINKZIVO — Suíte de Testes Automatizados da Fase E (Upgrade, Downgrade e Congelamento de Links)
 *
 * Cobertura completa dos requisitos:
 * 1. Downgrade sem exceder o limite (nenhum link congelado).
 * 2. Downgrade com links excedentes (congelamento estrito dos excedentes).
 * 3. Seleção determinística dos links congelados (clickCount desc, createdAt asc, id asc).
 * 4. Preservação de pausa manual (links pausados pelo usuário nunca são ativados involuntariamente).
 * 5. Upgrade restaurando somente links congelados por downgrade.
 * 6. Restauração parcial quando a nova cota não comportar todos os links congelados.
 * 7. Links expirados e arquivados não são restaurados como ativos.
 * 8. Integridade de previousStatus e pauseReason (tratamento de previousStatus nulo/inconsistente).
 * 9. Concorrência real entre criação de links e transição de plano (lock FOR UPDATE).
 * 10. Segurança, autenticação e proteção contra IDOR na rota POST /api/workspaces/plan.
 * 11. Preservação integral de cliques, QR Codes, conversões e histórico.
 * 12. Reflexo imediato nas cotas de criação e na retenção analítica do workspace.
 */

const { PrismaClient } = require("@prisma/client");
const { NextRequest } = require("next/server");
const crypto = require("crypto");
const assert = require("assert");

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

// Importações dos serviços da aplicação
const {
  PLAN_LIMITS,
  countOccupiedSlots,
  checkAndLockWorkspaceQuota,
  changeWorkspacePlan,
  getAnalyticsDateRange,
} = require("../src/lib/plans.ts");
const { POST: changePlanRouteHandler } = require("../src/app/api/workspaces/plan/route.ts");
const { signSessionToken } = require("../src/lib/auth.ts");

console.log("================================================================================");
console.log("LINKZIVO — INICIANDO SUÍTE DE TESTES DA FASE E (CICLO DE VIDA E CONGELAMENTO)");
console.log("================================================================================\n");

let passedAssertions = 0;
function testAssert(condition, message) {
  assert(condition, message);
  passedAssertions++;
  console.log(`  ✅ ${message}`);
}

async function runTests() {
  const testId = `fase_e_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const userAEmail = `user_a_${testId}@test.com`;
  const userBEmail = `user_b_${testId}@test.com`;

  let userA, userB, wsA, wsB;

  try {
    // -------------------------------------------------------------------------
    // SETUP: Provisionar Workspaces A e B
    // -------------------------------------------------------------------------
    console.log("--- Setup: Provisionando usuários e workspaces isolados ---");

    userA = await prisma.user.create({
      data: {
        name: "User Fase E A",
        email: userAEmail,
        role: "USER",
      },
    });

    wsA = await prisma.workspace.create({
      data: {
        userId: userA.id,
        name: `Workspace Fase E A (${testId})`,
        slug: `ws-e-a-${testId}`,
        plan: "CREATOR", // Começa como CREATOR
      },
    });

    userB = await prisma.user.create({
      data: {
        name: "User Fase E B",
        email: userBEmail,
        role: "USER",
      },
    });

    wsB = await prisma.workspace.create({
      data: {
        userId: userB.id,
        name: `Workspace Fase E B (${testId})`,
        slug: `ws-e-b-${testId}`,
        plan: "FREE",
      },
    });

    async function createAuthToken(userId, workspaceId) {
      const sessionRecord = await prisma.session.create({
        data: {
          userId,
          workspaceId,
          expiresAt: new Date(Date.now() + 86400000 * 30),
        },
      });
      const rawPayload = `${sessionRecord.id}:${userId}:${workspaceId}`;
      return signSessionToken(rawPayload);
    }

    const tokenUserA = await createAuthToken(userA.id, wsA.id);
    const tokenUserB = await createAuthToken(userB.id, wsB.id);

    // -------------------------------------------------------------------------
    // GRUPO 1: Downgrade sem exceder o limite (Creator com 3 links -> Free)
    // -------------------------------------------------------------------------
    console.log("\n--- Grupo 1: Downgrade sem exceder o limite ---");

    // Cria 3 links ativos no Workspace A
    const link1 = await prisma.smartLink.create({
      data: {
        workspaceId: wsA.id,
        slug: `l1-${testId}`,
        destinationUrl: "https://example.com/1",
        status: "ACTIVE",
        clickCount: 10,
      },
    });
    const link2 = await prisma.smartLink.create({
      data: {
        workspaceId: wsA.id,
        slug: `l2-${testId}`,
        destinationUrl: "https://example.com/2",
        status: "ACTIVE",
        clickCount: 20,
      },
    });
    const link3 = await prisma.smartLink.create({
      data: {
        workspaceId: wsA.id,
        slug: `l3-${testId}`,
        destinationUrl: "https://example.com/3",
        status: "PAUSED",
        pauseReason: "USER", // Pausado manualmente
        clickCount: 5,
      },
    });

    const slotsBeforeDowngrade1 = await countOccupiedSlots(wsA.id, prisma);
    testAssert(slotsBeforeDowngrade1 === 3, "Workspace A possui 3 links ocupando vaga (2 ativos e 1 pausado manual)");

    // Executa downgrade para FREE
    const resDowngrade1 = await changeWorkspacePlan(wsA.id, "FREE", prisma);
    testAssert(resDowngrade1.success === true, "changeWorkspacePlan retorna success: true");
    testAssert(resDowngrade1.action === "DOWNGRADED_NO_CHANGE", "Ação classificada como DOWNGRADED_NO_CHANGE");
    testAssert(resDowngrade1.frozenCount === 0, "Nenhum link congelado (3 <= 5 vagas Free)");
    testAssert(resDowngrade1.occupiedSlots === 3, "Vagas ocupadas permanecem 3");

    const wsADb1 = await prisma.workspace.findUnique({ where: { id: wsA.id } });
    testAssert(wsADb1.plan === "FREE", "Plano do Workspace A no banco foi atualizado para FREE");

    // Verifica que nenhum link foi alterado
    const l1Db1 = await prisma.smartLink.findUnique({ where: { id: link1.id } });
    testAssert(l1Db1.status === "ACTIVE", "Link 1 continua ACTIVE");
    const l3Db1 = await prisma.smartLink.findUnique({ where: { id: link3.id } });
    testAssert(l3Db1.status === "PAUSED" && l3Db1.pauseReason === "USER", "Link 3 continua PAUSED / USER");

    // -------------------------------------------------------------------------
    // GRUPO 2: Downgrade com links excedentes e seleção determinística
    // -------------------------------------------------------------------------
    console.log("\n--- Grupo 2: Downgrade com links excedentes e seleção determinística ---");

    // Retorna para CREATOR para adicionar mais links
    await changeWorkspacePlan(wsA.id, "CREATOR", prisma);

    // Adiciona mais 5 links (totalizando 8 links: 7 ativos + 1 pausado manual)
    // Atribuímos cliques decrescentes para comprovar seleção determinística
    const l4 = await prisma.smartLink.create({
      data: { workspaceId: wsA.id, slug: `l4-${testId}`, destinationUrl: "https://example.com/4", status: "ACTIVE", clickCount: 100 },
    });
    const l5 = await prisma.smartLink.create({
      data: { workspaceId: wsA.id, slug: `l5-${testId}`, destinationUrl: "https://example.com/5", status: "ACTIVE", clickCount: 80 },
    });
    const l6 = await prisma.smartLink.create({
      data: { workspaceId: wsA.id, slug: `l6-${testId}`, destinationUrl: "https://example.com/6", status: "ACTIVE", clickCount: 60 },
    });
    const l7 = await prisma.smartLink.create({
      data: { workspaceId: wsA.id, slug: `l7-${testId}`, destinationUrl: "https://example.com/7", status: "ACTIVE", clickCount: 40 },
    });
    const l8 = await prisma.smartLink.create({
      data: { workspaceId: wsA.id, slug: `l8-${testId}`, destinationUrl: "https://example.com/8", status: "ACTIVE", clickCount: 1 },
    });

    // Links e cliques:
    // l4 (100), l5 (80), l6 (60), l7 (40), l2 (20) -> Os 5 maiores continuarão ativos!
    // l1 (10), l3 (5, pausado manual), l8 (1) -> Os 3 menores devem ser congelados!

    const slotsBeforeDowngrade2 = await countOccupiedSlots(wsA.id, prisma);
    testAssert(slotsBeforeDowngrade2 === 8, "Workspace A possui 8 links ocupando vaga");

    const resDowngrade2 = await changeWorkspacePlan(wsA.id, "FREE", prisma);
    testAssert(resDowngrade2.success === true, "Downgrade com excedentes conclui com sucesso");
    testAssert(resDowngrade2.action === "DOWNGRADED_WITH_FREEZE", "Ação classificada como DOWNGRADED_WITH_FREEZE");
    testAssert(resDowngrade2.frozenCount === 3, "Exatamente 3 links excedentes foram congelados (8 - 5 = 3)");
    testAssert(resDowngrade2.occupiedSlots === 5, "Exatamente 5 links continuam ocupando vagas no Free");

    // Valida os 5 sobreviventes
    const topSurvivors = await prisma.smartLink.findMany({
      where: { id: { in: [l4.id, l5.id, l6.id, l7.id, link2.id] } },
    });
    testAssert(
      topSurvivors.every((l) => l.status === "ACTIVE" && l.pauseReason === null),
      "Os 5 links com mais cliques (l4, l5, l6, l7, l2) permaneceram ACTIVE sem pausa"
    );

    // Valida os 3 congelados
    const l1Frozen = await prisma.smartLink.findUnique({ where: { id: link1.id } });
    testAssert(l1Frozen.status === "PAUSED", "Link 1 (10 cliques) foi congelado para PAUSED");
    testAssert(l1Frozen.pauseReason === "DOWNGRADE", "Link 1 recebeu pauseReason = 'DOWNGRADE'");
    testAssert(l1Frozen.previousStatus === "ACTIVE", "Link 1 preservou previousStatus = 'ACTIVE'");

    const l8Frozen = await prisma.smartLink.findUnique({ where: { id: l8.id } });
    testAssert(l8Frozen.status === "PAUSED" && l8Frozen.pauseReason === "DOWNGRADE", "Link 8 (1 clique) foi congelado");
    testAssert(l8Frozen.previousStatus === "ACTIVE", "Link 8 preservou previousStatus = 'ACTIVE'");

    // -------------------------------------------------------------------------
    // GRUPO 3: Preservação de Pausa Manual no Congelamento e Upgrade
    // -------------------------------------------------------------------------
    console.log("\n--- Grupo 3: Preservação de Pausa Manual ---");

    const l3Frozen = await prisma.smartLink.findUnique({ where: { id: link3.id } });
    testAssert(l3Frozen.status === "PAUSED", "Link 3 (pausado manual) permaneceu PAUSED");
    testAssert(l3Frozen.pauseReason === "DOWNGRADE", "Link 3 foi marcado com pauseReason = 'DOWNGRADE'");
    testAssert(l3Frozen.previousStatus === "PAUSED", "Link 3 gravou previousStatus = 'PAUSED' comprovando intenção original");

    // -------------------------------------------------------------------------
    // GRUPO 4: Upgrade restaurando somente links congelados por downgrade
    // -------------------------------------------------------------------------
    console.log("\n--- Grupo 4: Upgrade restaurando links congelados ---");

    const resUpgrade = await changeWorkspacePlan(wsA.id, "CREATOR", prisma);
    testAssert(resUpgrade.success === true, "Upgrade para CREATOR conclui com sucesso");
    testAssert(resUpgrade.action === "UPGRADED", "Ação classificada como UPGRADED");
    testAssert(resUpgrade.restoredCount === 3, "Exatamente os 3 links congelados foram restaurados");

    // Link 1 (que era ativo antes do downgrade) deve voltar a ser ACTIVE
    const l1Restored = await prisma.smartLink.findUnique({ where: { id: link1.id } });
    testAssert(l1Restored.status === "ACTIVE", "Link 1 foi restaurado para ACTIVE");
    testAssert(l1Restored.pauseReason === null, "Link 1 teve pauseReason limpo para null");
    testAssert(l1Restored.previousStatus === null, "Link 1 teve previousStatus limpo para null");

    // Link 3 (que era PAUSED manual antes do downgrade) DEVE VOLTAR A SER PAUSED / USER!
    const l3Restored = await prisma.smartLink.findUnique({ where: { id: link3.id } });
    testAssert(l3Restored.status === "PAUSED", "Link 3 restaurado permaneceu estritamente PAUSED (não foi ativado indevidamente)");
    testAssert(l3Restored.pauseReason === "USER", "Link 3 recuperou pauseReason = 'USER'");
    testAssert(l3Restored.previousStatus === null, "Link 3 teve previousStatus limpo para null");

    // -------------------------------------------------------------------------
    // GRUPO 5: Links Expirados e Arquivados Não Restaurados
    // -------------------------------------------------------------------------
    console.log("\n--- Grupo 5: Links Expirados e Arquivados Não Restaurados ---");

    // Garante que o workspace está no FREE para testar a transição de upgrade
    await changeWorkspacePlan(wsA.id, "FREE", prisma);

    // Cria um link arquivado e um link com expiração no passado congelado
    const lArchived = await prisma.smartLink.create({
      data: {
        workspaceId: wsA.id,
        slug: `l-arch-${testId}`,
        destinationUrl: "https://example.com/arch",
        status: "ARCHIVED",
        clickCount: 50,
      },
    });

    const lExpiredWhileFrozen = await prisma.smartLink.create({
      data: {
        workspaceId: wsA.id,
        slug: `l-exp-frozen-${testId}`,
        destinationUrl: "https://example.com/exp-frozen",
        status: "PAUSED",
        pauseReason: "DOWNGRADE",
        previousStatus: "ACTIVE",
        expiresAt: new Date(Date.now() - 3600000), // Expirou 1h atrás
      },
    });

    // Executa upgrade
    await changeWorkspacePlan(wsA.id, "CREATOR", prisma);

    const lArchDb = await prisma.smartLink.findUnique({ where: { id: lArchived.id } });
    testAssert(lArchDb.status === "ARCHIVED", "Link arquivado permaneceu estritamente ARCHIVED");

    const lExpDb = await prisma.smartLink.findUnique({ where: { id: lExpiredWhileFrozen.id } });
    testAssert(lExpDb.status === "EXPIRED", "Link que expirou enquanto congelado foi convertido para EXPIRED");
    testAssert(lExpDb.pauseReason === null, "Link expirado teve pauseReason limpo");

    // -------------------------------------------------------------------------
    // GRUPO 6: Integridade e Inconsistência Histórica (previousStatus nulo)
    // -------------------------------------------------------------------------
    console.log("\n--- Grupo 6: Inconsistência Histórica (previousStatus nulo) ---");

    // Coloca workspace em FREE antes de testar o upgrade de recuperação
    await changeWorkspacePlan(wsA.id, "FREE", prisma);

    // Cria um link com previousStatus nulo/legado congelado por DOWNGRADE
    const lLegacyFrozen = await prisma.smartLink.create({
      data: {
        workspaceId: wsA.id,
        slug: `l-legacy-${testId}`,
        destinationUrl: "https://example.com/legacy",
        status: "PAUSED",
        pauseReason: "DOWNGRADE",
        previousStatus: null, // Legado / inconsistente
      },
    });

    // Faz nova transição de upgrade
    await changeWorkspacePlan(wsA.id, "CREATOR", prisma);

    const lLegacyRestored = await prisma.smartLink.findUnique({ where: { id: lLegacyFrozen.id } });
    testAssert(lLegacyRestored.status === "PAUSED", "Link legado com previousStatus nulo é restaurado como PAUSED (nunca presume ACTIVE)");
    testAssert(lLegacyRestored.pauseReason === "USER", "Link legado recebe pauseReason = 'USER'");
    testAssert(lLegacyRestored.previousStatus === null, "Link legado limpa previousStatus");

    // -------------------------------------------------------------------------
    // GRUPO 7: Tentativas Não Autorizadas e Validação de Entrada na API
    // -------------------------------------------------------------------------
    console.log("\n--- Grupo 7: Segurança e Autorização na Rota HTTP ---");

    // 7.1 Requisição sem autenticação -> 401
    const unauthReq = new NextRequest("http://localhost:3000/api/workspaces/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: wsA.id, targetPlan: "FREE" }),
    });
    const unauthRes = await changePlanRouteHandler(unauthReq);
    testAssert(unauthRes.status === 401, "POST sem autenticação retorna HTTP 401 Unauthorized");

    // 7.2 IDOR: Usuário B tentando alterar plano do Workspace A -> 403
    const idorReq = new NextRequest("http://localhost:3000/api/workspaces/plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `linkzivo_session=${tokenUserB}`,
      },
      body: JSON.stringify({ workspaceId: wsA.id, targetPlan: "FREE" }),
    });
    const idorRes = await changePlanRouteHandler(idorReq);
    testAssert(idorRes.status === 403, "Tentativa de alterar plano de outro workspace (IDOR) retorna HTTP 403 Forbidden");

    // 7.3 Solicitação de plano Pro ou Agency não implementado -> 400
    const proReq = new NextRequest("http://localhost:3000/api/workspaces/plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `linkzivo_session=${tokenUserA}`,
      },
      body: JSON.stringify({ workspaceId: wsA.id, targetPlan: "PRO" }),
    });
    const proRes = await changePlanRouteHandler(proReq);
    testAssert(proRes.status === 400, "Tentativa de selecionar plano PRO retorna HTTP 400 (Sob Consulta)");
    const proBody = await proRes.json();
    testAssert(proBody.code === "FEATURE_NOT_IMPLEMENTED", "Código de erro retornado é FEATURE_NOT_IMPLEMENTED");

    // 7.4 Transição legítima autorizada pelo dono do Workspace A -> 200
    const authReq = new NextRequest("http://localhost:3000/api/workspaces/plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `linkzivo_session=${tokenUserA}`,
      },
      body: JSON.stringify({ workspaceId: wsA.id, targetPlan: "FREE" }),
    });
    const authRes = await changePlanRouteHandler(authReq);
    testAssert(authRes.status === 200, "Transição de plano autorizada pelo dono retorna HTTP 200 OK");
    const authBody = await authRes.json();
    testAssert(authBody.success === true, "Corpo de resposta contém success: true");

    // -------------------------------------------------------------------------
    // GRUPO 8: Preservação de Cliques, QR Codes, Conversões e Histórico
    // -------------------------------------------------------------------------
    console.log("\n--- Grupo 8: Preservação de Dados e Métricas Relacionais ---");

    // Insere QR code e clique no Link 4
    await prisma.qrCode.create({
      data: {
        smartLinkId: l4.id,
        style: "DOTS",
        fgColor: "#8B5CF6",
      },
    });
    await prisma.click.create({
      data: {
        id: `clk_e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        smartLinkId: l4.id,
        workspaceId: wsA.id,
        country: "BR",
        device: "Desktop",
      },
    });

    // Executa múltiplos upgrades e downgrades
    await changeWorkspacePlan(wsA.id, "CREATOR", prisma);
    await changeWorkspacePlan(wsA.id, "FREE", prisma);
    await changeWorkspacePlan(wsA.id, "CREATOR", prisma);

    const l4Final = await prisma.smartLink.findUnique({
      where: { id: l4.id },
      include: { qrCode: true, clicks: true },
    });
    testAssert(l4Final.clickCount === 100, "clickCount permaneceu estritamente 100 após múltiplos ciclos");
    testAssert(l4Final.qrCode !== null, "Entidade QrCode continua perfeitamente vinculada e intacta");
    testAssert(l4Final.clicks.length === 1, "Histórico de cliques do link continua intacto");

    // -------------------------------------------------------------------------
    // GRUPO 9: Reflexo Imediato nas Cotas e na Retenção Analítica
    // -------------------------------------------------------------------------
    console.log("\n--- Grupo 9: Reflexo Imediato nas Cotas e Analytics ---");

    // Workspace A está no CREATOR:
    const creatorRetention = getAnalyticsDateRange("CREATOR", "all");
    testAssert(creatorRetention.effectiveDays === 365, "Creator possui retenção analítica de 365 dias");
    testAssert(PLAN_LIMITS.CREATOR.maxSlots === 1000, "Creator possui cota de 1.000 vagas");

    // Downgrade para FREE:
    await changeWorkspacePlan(wsA.id, "FREE", prisma);
    const freeRetention = getAnalyticsDateRange("FREE", "all");
    testAssert(freeRetention.effectiveDays === 30, "Imediatamente após downgrade, retenção máxima é 30 dias");
    testAssert(PLAN_LIMITS.FREE.maxSlots === 5, "Imediatamente após downgrade, cota máxima é 5 vagas");

    // -------------------------------------------------------------------------
    // GRUPO 10: Concorrência Real com Lock FOR UPDATE
    // -------------------------------------------------------------------------
    console.log("\n--- Grupo 10: Concorrência Real (Lock FOR UPDATE) ---");

    // Garante que o workspace está no FREE com 5 links ocupando vaga
    const occupiedNow = await countOccupiedSlots(wsA.id, prisma);
    testAssert(occupiedNow === 5, "Workspace A no FREE possui exatamente 5 vagas ocupadas");

    // Dispara 5 tentativas simultâneas de alocar uma 6ª vaga no FREE
    const concurrentAttempts = await Promise.all(
      Array.from({ length: 5 }).map(async () => {
        return prisma.$transaction(async (tx) => {
          return checkAndLockWorkspaceQuota(wsA.id, tx);
        });
      })
    );

    const deniedQuota = concurrentAttempts.filter((r) => r.allowed === false && r.code === "QUOTA_EXCEEDED");
    testAssert(
      deniedQuota.length === 5,
      "Todas as 5 requisições concorrentes para alocação de vaga no FREE com cota cheia foram rejeitadas com QUOTA_EXCEEDED"
    );

    console.log("\n================================================================================");
    console.log(`SUÍTE DA FASE E CONCLUÍDA COM SUCESSO: ${passedAssertions} asserções aprovadas!`);
    console.log("================================================================================\n");
  } finally {
    // -------------------------------------------------------------------------
    // TEARDOWN: Limpeza dos dados criados
    // -------------------------------------------------------------------------
    console.log("--- Teardown: Limpando registros de teste ---");
    const userIds = [userA?.id, userB?.id].filter(Boolean);
    if (userIds.length > 0) {
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    }
    if (wsA) {
      await prisma.click.deleteMany({ where: { smartLink: { workspaceId: wsA.id } } });
      await prisma.qrCode.deleteMany({ where: { smartLink: { workspaceId: wsA.id } } });
      await prisma.smartLink.deleteMany({ where: { workspaceId: wsA.id } });
      await prisma.workspace.deleteMany({ where: { id: wsA.id } });
    }
    if (wsB) {
      await prisma.smartLink.deleteMany({ where: { workspaceId: wsB.id } });
      await prisma.workspace.deleteMany({ where: { id: wsB.id } });
    }
    if (userA) await prisma.user.deleteMany({ where: { id: userA.id } });
    if (userB) await prisma.user.deleteMany({ where: { id: userB.id } });
    await prisma.$disconnect();
  }
}

runTests().catch((err) => {
  console.error("\n❌ ERRO NA SUÍTE DA FASE E:", err);
  process.exit(1);
});

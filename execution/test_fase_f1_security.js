/**
 * LINKZIVO — Suíte de Testes de Segurança e Blindagem de Cotas (Fase F1)
 * 
 * Validações obrigatórias:
 * 1. POST /api/links/batch (Resume & Concorrência):
 *    - Resume dentro da cota (sucesso, reativa e limpa motivos).
 *    - Resume quando a cota está cheia tentando reativar congelados por downgrade (rejeição 403 QUOTA_EXCEEDED).
 *    - Atomicidade do lote ("tudo ou nada"): se solicitar 2 links congelados e houver só 1 vaga, nenhum é reativado.
 *    - Preservação e reativação de links pausados manualmente (USER não demanda nova vaga).
 *    - Links expirados são convertidos para EXPIRED e não consomem vaga nem reativam.
 *    - Proteção contra IDOR: tentar reativar links de outro workspace resulta em 403 FORBIDDEN.
 *    - Concorrência real de 2 lotes simultâneos disputando a última vaga disponível (1 vence, 1 recebe 403, cota não fura).
 * 
 * 2. POST /api/workspaces/plan (Bloqueio de Upgrade Gratuito e Proteção):
 *    - Usuário FREE tentando promover-se para CREATOR via API direta é bloqueado com 403 UPGRADE_PAYMENT_REQUIRED.
 *    - Payload adulterado com campos extras de pagamento/assinatura é sumariamente bloqueado.
 *    - Tentativa de upgrade para PRO ou AGENCY resulta em 400 FEATURE_NOT_IMPLEMENTED.
 *    - Tentativa com plano inválido resulta em 400 INVALID_PLAN.
 *    - Proteção contra IDOR: usuário tentando alterar workspace de terceiro resulta em 403 FORBIDDEN.
 *    - Downgrade voluntário para FREE é permitido e executado com sucesso.
 * 
 * 3. Validação de Lógica da Sidebar:
 *    - Planos válidos (FREE, CREATOR, PRO, AGENCY) são exibidos corretamente.
 *    - Planos ausentes (null, undefined, vazio) ou forjados/inválidos têm fallback estrito para "FREE".
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

// Importação dos handlers reais da aplicação
const { POST: postBatchHandler } = require("../src/app/api/links/batch/route.ts");
const { POST: postPlanHandler } = require("../src/app/api/workspaces/plan/route.ts");
const { signSessionToken } = require("../src/lib/auth.ts");
const { countOccupiedSlots } = require("../src/lib/plans.ts");

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`  ❌ FALHA: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`  ✓ ${message}`);
}

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

function createAuthenticatedRequest(url, method, body, authToken) {
  const headers = new Headers({
    "Content-Type": "application/json",
    cookie: `linkzivo_session=${authToken}`,
  });

  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// Lógica de resolução do plano da Sidebar (idêntica a src/components/dashboard/Sidebar.tsx)
function resolveSidebarPlan(workspacePlan) {
  return workspacePlan && ["FREE", "CREATOR", "PRO", "AGENCY"].includes(workspacePlan.toUpperCase())
    ? workspacePlan.toUpperCase()
    : "FREE";
}

async function runTests() {
  console.log("\n====================================================================");
  console.log("LINKZIVO — Suíte de Testes de Segurança e Blindagem de Cotas (Fase F1)");
  console.log(`Banco Alvo: ${TEST_DATABASE_URL}`);
  console.log("====================================================================\n");

  const runId = `f1_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

  try {
    // --------------------------------------------------------------------------
    // Setup Usuários e Workspaces
    // --------------------------------------------------------------------------
    const userA = await prisma.user.create({
      data: { email: `userA_${runId}@test.local`, name: "User A Free" },
    });
    const wsA = await prisma.workspace.create({
      data: { userId: userA.id, name: `WS A ${runId}`, slug: `wsa-${runId}`, plan: "FREE" },
    });
    const tokenA = await createAuthToken(userA.id, wsA.id);

    const userB = await prisma.user.create({
      data: { email: `userB_${runId}@test.local`, name: "User B Creator" },
    });
    const wsB = await prisma.workspace.create({
      data: { userId: userB.id, name: `WS B ${runId}`, slug: `wsb-${runId}`, plan: "CREATOR" },
    });
    const tokenB = await createAuthToken(userB.id, wsB.id);

    // ==========================================================================
    // SEÇÃO 1: TESTES DA ROTA EM LOTE (POST /api/links/batch)
    // ==========================================================================
    console.log("--- SEÇÃO 1: Blindagem de Cotas na Rota em Lote (POST /api/links/batch) ---");

    // Cria 4 links ativos no workspace A (Free tem limite de 5 links)
    const linkA1 = await prisma.smartLink.create({
      data: {
        workspaceId: wsA.id,
        title: "Link 1",
        destinationUrl: "https://example.com/1",
        slug: `slug-a1-${runId}`,
        status: "ACTIVE",
      },
    });
    const linkA2 = await prisma.smartLink.create({
      data: {
        workspaceId: wsA.id,
        title: "Link 2",
        destinationUrl: "https://example.com/2",
        slug: `slug-a2-${runId}`,
        status: "ACTIVE",
      },
    });
    const linkA3 = await prisma.smartLink.create({
      data: {
        workspaceId: wsA.id,
        title: "Link 3",
        destinationUrl: "https://example.com/3",
        slug: `slug-a3-${runId}`,
        status: "ACTIVE",
      },
    });
    const linkA4 = await prisma.smartLink.create({
      data: {
        workspaceId: wsA.id,
        title: "Link 4",
        destinationUrl: "https://example.com/4",
        slug: `slug-a4-${runId}`,
        status: "ACTIVE",
      },
    });

    // Cria 2 links congelados por downgrade no wsA
    const linkFrozen1 = await prisma.smartLink.create({
      data: {
        workspaceId: wsA.id,
        title: "Link Frozen 1",
        destinationUrl: "https://example.com/f1",
        slug: `slug-f1-${runId}`,
        status: "PAUSED",
        pauseReason: "DOWNGRADE",
        previousStatus: "ACTIVE",
      },
    });
    const linkFrozen2 = await prisma.smartLink.create({
      data: {
        workspaceId: wsA.id,
        title: "Link Frozen 2",
        destinationUrl: "https://example.com/f2",
        slug: `slug-f2-${runId}`,
        status: "PAUSED",
        pauseReason: "DOWNGRADE",
        previousStatus: "ACTIVE",
      },
    });

    // Cria 1 link pausado manualmente pelo usuário no wsA
    const linkManualPause = await prisma.smartLink.create({
      data: {
        workspaceId: wsA.id,
        title: "Link Manual Pause",
        destinationUrl: "https://example.com/mp",
        slug: `slug-mp-${runId}`,
        status: "PAUSED",
        pauseReason: "USER",
        previousStatus: "ACTIVE",
      },
    });

    // Ocupação atual do wsA:
    // linkA1, linkA2, linkA3, linkA4 (4) + linkManualPause (1) = 5 vagas ocupadas (Cota Free está 5/5 cheia!).
    // linkFrozen1 e linkFrozen2 têm pauseReason = DOWNGRADE, não contam na cota Free.

    // Teste 1.1: Tentativa de Batch Resume em link congelado por downgrade com cota cheia -> 403 QUOTA_EXCEEDED
    {
      const req = createAuthenticatedRequest(
        "http://localhost:3000/api/links/batch",
        "POST",
        { action: "resume", linkIds: [linkFrozen1.id] },
        tokenA
      );
      const res = await postBatchHandler(req);
      const data = await res.json();

      assert(res.status === 403, "Batch resume de link congelado com cota cheia deve retornar HTTP 403");
      assert(data.code === "QUOTA_EXCEEDED", "Código de erro deve ser 'QUOTA_EXCEEDED'");
      assert(data.currentOccupied === 5, "currentOccupied deve reportar 5");
      assert(data.availableSlots === 0, "availableSlots deve reportar 0");

      const checkLink = await prisma.smartLink.findUnique({ where: { id: linkFrozen1.id } });
      assert(checkLink.status === "PAUSED", "Link congelado deve permanecer PAUSED após rejeição de cota");
      assert(checkLink.pauseReason === "DOWNGRADE", "pauseReason deve permanecer DOWNGRADE");
    }

    // Teste 1.2: Reativação de link pausado manualmente (USER) não consome nova vaga
    // Como ele já ocupa vaga no Free, o resume dele para ACTIVE deve ser permitido com sucesso
    {
      const req = createAuthenticatedRequest(
        "http://localhost:3000/api/links/batch",
        "POST",
        { action: "resume", linkIds: [linkManualPause.id] },
        tokenA
      );
      const res = await postBatchHandler(req);
      const data = await res.json();

      assert(res.status === 200, "Batch resume de link pausado manualmente deve retornar HTTP 200 mesmo em 5/5");
      assert(data.affectedCount === 1, "affectedCount deve ser 1");

      const checkLink = await prisma.smartLink.findUnique({ where: { id: linkManualPause.id } });
      assert(checkLink.status === "ACTIVE", "Link deve ser atualizado para ACTIVE");
      assert(checkLink.pauseReason === null, "pauseReason deve ser limpo para null");
      assert(checkLink.previousStatus === null, "previousStatus deve ser limpo para null");
    }

    // Teste 1.3: Batch Pause marca pauseReason = "USER" e previousStatus = "ACTIVE"
    {
      const req = createAuthenticatedRequest(
        "http://localhost:3000/api/links/batch",
        "POST",
        { action: "pause", linkIds: [linkA4.id] },
        tokenA
      );
      const res = await postBatchHandler(req);
      const data = await res.json();

      assert(res.status === 200, "Batch pause deve retornar HTTP 200");
      assert(data.affectedCount === 1, "affectedCount deve ser 1");

      const checkLink = await prisma.smartLink.findUnique({ where: { id: linkA4.id } });
      assert(checkLink.status === "PAUSED", "LinkA4 deve estar PAUSED");
      assert(checkLink.pauseReason === "USER", "pauseReason deve ser gravado como 'USER'");
      assert(checkLink.previousStatus === "ACTIVE", "previousStatus deve ser gravado como 'ACTIVE'");
    }

    // Libera 1 vaga de verdade excluindo fisicamente linkA4
    await prisma.smartLink.delete({ where: { id: linkA4.id } });
    // Agora o wsA tem: linkA1, linkA2, linkA3, linkManualPause = 4 links ocupados (4/5 vagas). Há 1 vaga disponível!

    // Teste 1.4: Atomicidade do lote ("Tudo ou Nada")
    // O usuário solicita reativar linkFrozen1 e linkFrozen2 (2 links congelados).
    // Há apenas 1 vaga disponível. O lote deve falhar INTEIRO, sem deixar estado parcial!
    {
      const req = createAuthenticatedRequest(
        "http://localhost:3000/api/links/batch",
        "POST",
        { action: "resume", linkIds: [linkFrozen1.id, linkFrozen2.id] },
        tokenA
      );
      const res = await postBatchHandler(req);
      const data = await res.json();

      assert(res.status === 403, "Batch resume solicitando mais vagas do que as disponíveis deve retornar HTTP 403");
      assert(data.code === "QUOTA_EXCEEDED", "Código deve ser 'QUOTA_EXCEEDED'");
      assert(data.requiredSlots === 2, "requiredSlots deve ser 2");
      assert(data.availableSlots === 1, "availableSlots deve ser 1");

      const checkF1 = await prisma.smartLink.findUnique({ where: { id: linkFrozen1.id } });
      const checkF2 = await prisma.smartLink.findUnique({ where: { id: linkFrozen2.id } });
      assert(checkF1.status === "PAUSED" && checkF2.status === "PAUSED", "NENHUM dos links do lote deve ser reativado (Atomicidade garantida)");
    }

    // Teste 1.5: Batch Resume de 1 link congelado quando há 1 vaga -> Sucesso
    {
      const req = createAuthenticatedRequest(
        "http://localhost:3000/api/links/batch",
        "POST",
        { action: "resume", linkIds: [linkFrozen1.id] },
        tokenA
      );
      const res = await postBatchHandler(req);
      const data = await res.json();

      assert(res.status === 200, "Batch resume de 1 link dentro da vaga disponível deve retornar HTTP 200");
      assert(data.affectedCount === 1, "affectedCount deve ser 1");

      const checkF1 = await prisma.smartLink.findUnique({ where: { id: linkFrozen1.id } });
      assert(checkF1.status === "ACTIVE", "Link reativado deve ter status ACTIVE");
      assert(checkF1.pauseReason === null, "pauseReason deve ser limpo");
      assert(checkF1.previousStatus === null, "previousStatus deve ser limpo");
    }

    // Teste 1.6: Links expirados são convertidos para EXPIRED e não são reativados
    {
      const linkExpired = await prisma.smartLink.create({
        data: {
          workspaceId: wsA.id,
          title: "Link Expirado",
          destinationUrl: "https://example.com/exp",
          slug: `slug-exp-${runId}`,
          status: "PAUSED",
          expiresAt: new Date(Date.now() - 3600000), // Expirou há 1 hora
        },
      });

      const req = createAuthenticatedRequest(
        "http://localhost:3000/api/links/batch",
        "POST",
        { action: "resume", linkIds: [linkExpired.id] },
        tokenA
      );
      const res = await postBatchHandler(req);
      const data = await res.json();

      assert(res.status === 200, "Batch resume com link expirado retorna 200 informando conversão");
      assert(data.affectedCount === 0, "affectedCount para active deve ser 0");

      const checkExp = await prisma.smartLink.findUnique({ where: { id: linkExpired.id } });
      assert(checkExp.status === "EXPIRED", "Link deve ser marcado como EXPIRED no banco");
    }

    // Teste 1.7: IDOR — Tentativa de reativar links pertencentes a outro workspace -> 403 FORBIDDEN
    {
      const linkOfB = await prisma.smartLink.create({
        data: {
          workspaceId: wsB.id,
          title: "Link do WS B",
          destinationUrl: "https://example.com/b",
          slug: `slug-b-${runId}`,
          status: "PAUSED",
        },
      });

      const req = createAuthenticatedRequest(
        "http://localhost:3000/api/links/batch",
        "POST",
        { action: "resume", linkIds: [linkOfB.id] },
        tokenA // Token do Usuário A tentando agir no link do WS B
      );
      const res = await postBatchHandler(req);
      const data = await res.json();

      assert(res.status === 403, "Tentativa de batch resume em links de outro workspace deve retornar HTTP 403");
      assert(data.code === "FORBIDDEN", "Código deve ser 'FORBIDDEN'");
    }

    // Teste 1.8: Concorrência Real — 2 requisições concorrentes de resume disputando a última vaga
    // Ocupação do wsA no momento: linkA1, linkA2, linkA3, linkManualPause, linkFrozen1 = 5 links.
    // Vamos deletar linkManualPause para abrir EXATAMENTE 1 vaga (4/5 ocupados).
    await prisma.smartLink.delete({ where: { id: linkManualPause.id } });

    // Criamos mais um link congelado para disputar com linkFrozen2
    const linkFrozen3 = await prisma.smartLink.create({
      data: {
        workspaceId: wsA.id,
        title: "Link Frozen 3",
        destinationUrl: "https://example.com/f3",
        slug: `slug-f3-${runId}`,
        status: "PAUSED",
        pauseReason: "DOWNGRADE",
      },
    });

    {
      const req1 = createAuthenticatedRequest(
        "http://localhost:3000/api/links/batch",
        "POST",
        { action: "resume", linkIds: [linkFrozen2.id] },
        tokenA
      );
      const req2 = createAuthenticatedRequest(
        "http://localhost:3000/api/links/batch",
        "POST",
        { action: "resume", linkIds: [linkFrozen3.id] },
        tokenA
      );

      // Dispara simultaneamente via Promise.all
      const [res1, res2] = await Promise.all([
        postBatchHandler(req1),
        postBatchHandler(req2),
      ]);

      const statuses = [res1.status, res2.status];
      const has200 = statuses.includes(200);
      const has403 = statuses.includes(403);

      assert(has200 && has403, "Concorrência: exatamente 1 requisição deve vencer (200) e a outra deve ser rejeitada (403)");

      // Checa contagem no banco usando a função central de cotas countOccupiedSlots
      const occupiedFinal = await countOccupiedSlots(wsA.id, prisma);
      assert(occupiedFinal === 5, `Total ocupado após disputa concorrente deve ser exatamente 5 (foi ${occupiedFinal})`);
    }

    // ==========================================================================
    // SEÇÃO 2: TESTES DA ROTA DE PLANOS (POST /api/workspaces/plan)
    // ==========================================================================
    console.log("\n--- SEÇÃO 2: Bloqueio de Upgrade Gratuito e Proteção de Planos (POST /api/workspaces/plan) ---");

    // Teste 2.1: Tentativa direta de upgrade de FREE para CREATOR -> 403 UPGRADE_PAYMENT_REQUIRED
    {
      const req = createAuthenticatedRequest(
        "http://localhost:3000/api/workspaces/plan",
        "POST",
        { workspaceId: wsA.id, targetPlan: "CREATOR" },
        tokenA
      );
      const res = await postPlanHandler(req);
      const data = await res.json();

      assert(res.status === 403, "Upgrade direto de cliente para CREATOR deve ser bloqueado com HTTP 403");
      assert(data.code === "UPGRADE_PAYMENT_REQUIRED", "Código deve ser 'UPGRADE_PAYMENT_REQUIRED'");

      const checkWs = await prisma.workspace.findUnique({ where: { id: wsA.id } });
      assert(checkWs.plan === "FREE", "Plano do workspace deve permanecer inalterado como FREE");
    }

    // Teste 2.2: Payload adulterado com campos extras de pagamento ou assinatura simulada
    {
      const req = createAuthenticatedRequest(
        "http://localhost:3000/api/workspaces/plan",
        "POST",
        {
          workspaceId: wsA.id,
          targetPlan: "CREATOR",
          isPaid: true,
          subscriptionId: "sub_fake_12345",
          amount: 49.0,
          role: "ADMIN",
        },
        tokenA
      );
      const res = await postPlanHandler(req);
      const data = await res.json();

      assert(res.status === 403, "Payload adulterado com dados de pagamento simulados deve ser bloqueado com HTTP 403");
      assert(data.code === "UPGRADE_PAYMENT_REQUIRED", "Código de bloqueio deve ser 'UPGRADE_PAYMENT_REQUIRED'");

      const checkWs = await prisma.workspace.findUnique({ where: { id: wsA.id } });
      assert(checkWs.plan === "FREE", "Plano do workspace não pode ser adulterado");
    }

    // Teste 2.3: Tentativa de upgrade para PRO ou AGENCY -> 400 FEATURE_NOT_IMPLEMENTED
    {
      const reqPro = createAuthenticatedRequest(
        "http://localhost:3000/api/workspaces/plan",
        "POST",
        { workspaceId: wsA.id, targetPlan: "PRO" },
        tokenA
      );
      const resPro = await postPlanHandler(reqPro);
      const dataPro = await resPro.json();

      assert(resPro.status === 400, "Tentativa de upgrade para PRO deve retornar HTTP 400");
      assert(dataPro.code === "FEATURE_NOT_IMPLEMENTED", "Código para PRO deve ser 'FEATURE_NOT_IMPLEMENTED'");

      const reqAgency = createAuthenticatedRequest(
        "http://localhost:3000/api/workspaces/plan",
        "POST",
        { workspaceId: wsA.id, targetPlan: "AGENCY" },
        tokenA
      );
      const resAgency = await postPlanHandler(reqAgency);
      const dataAgency = await resAgency.json();

      assert(resAgency.status === 400, "Tentativa de upgrade para AGENCY deve retornar HTTP 400");
      assert(dataAgency.code === "FEATURE_NOT_IMPLEMENTED", "Código para AGENCY deve ser 'FEATURE_NOT_IMPLEMENTED'");
    }

    // Teste 2.4: Plano inválido -> 400 INVALID_PLAN
    {
      const req = createAuthenticatedRequest(
        "http://localhost:3000/api/workspaces/plan",
        "POST",
        { workspaceId: wsA.id, targetPlan: "SUPER_VIP_UNLIMITED" },
        tokenA
      );
      const res = await postPlanHandler(req);
      const data = await res.json();

      assert(res.status === 400, "Plano desconhecido deve retornar HTTP 400");
      assert(data.code === "INVALID_PLAN", "Código deve ser 'INVALID_PLAN'");
    }

    // Teste 2.5: IDOR — Tentativa de alterar plano do workspace de terceiro -> 403 FORBIDDEN
    {
      const req = createAuthenticatedRequest(
        "http://localhost:3000/api/workspaces/plan",
        "POST",
        { workspaceId: wsB.id, targetPlan: "FREE" },
        tokenA // Usuário A tentando rebaixar Workspace B
      );
      const res = await postPlanHandler(req);
      const data = await res.json();

      assert(res.status === 403, "Tentativa de alterar plano de outro workspace deve retornar HTTP 403");
      assert(data.code === "FORBIDDEN", "Código de IDOR deve ser 'FORBIDDEN'");
    }

    // Teste 2.6: Downgrade voluntário para FREE permitido e funcional
    {
      const req = createAuthenticatedRequest(
        "http://localhost:3000/api/workspaces/plan",
        "POST",
        { workspaceId: wsB.id, targetPlan: "FREE" },
        tokenB // Usuário B rebaixando seu próprio workspace
      );
      const res = await postPlanHandler(req);
      const data = await res.json();

      assert(res.status === 200, "Downgrade voluntário para FREE deve retornar HTTP 200");
      assert(data.success === true, "success deve ser true");
      assert(data.newPlan === "FREE", "Plano resultante deve ser 'FREE'");

      const checkWsB = await prisma.workspace.findUnique({ where: { id: wsB.id } });
      assert(checkWsB.plan === "FREE", "Workspace no banco deve ter sido rebaixado para FREE");
    }

    // ==========================================================================
    // SEÇÃO 3: VALIDAÇÃO DO FALLBACK DO BADGE DA SIDEBAR
    // ==========================================================================
    console.log("\n--- SEÇÃO 3: Verificação de Segurança do Fallback da Sidebar ---");

    assert(resolveSidebarPlan("FREE") === "FREE", "Plano 'FREE' deve exibir badge 'FREE'");
    assert(resolveSidebarPlan("CREATOR") === "CREATOR", "Plano 'CREATOR' deve exibir badge 'CREATOR'");
    assert(resolveSidebarPlan("PRO") === "PRO", "Plano 'PRO' deve exibir badge 'PRO'");
    assert(resolveSidebarPlan("AGENCY") === "AGENCY", "Plano 'AGENCY' deve exibir badge 'AGENCY'");

    // Casos de Fallback Seguro
    assert(resolveSidebarPlan(null) === "FREE", "Plano null deve ter fallback seguro para 'FREE' (não PRO)");
    assert(resolveSidebarPlan(undefined) === "FREE", "Plano undefined deve ter fallback seguro para 'FREE' (não PRO)");
    assert(resolveSidebarPlan("") === "FREE", "Plano string vazia deve ter fallback seguro para 'FREE'");
    assert(resolveSidebarPlan("UNKNOWN_PLAN") === "FREE", "Plano desconhecido deve ter fallback seguro para 'FREE'");
    assert(resolveSidebarPlan("ADMIN") === "FREE", "Plano arbitrário deve ter fallback seguro para 'FREE'");

    console.log("\n====================================================================");
    console.log(`SUCESSO TOTAL! ${passedTests}/${totalTests} asserções passaram sem falhas.`);
    console.log("====================================================================\n");
  } catch (error) {
    console.error("\n❌ ERRO NA EXECUÇÃO DA SUÍTE F1:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();

/**
 * LINKZIVO — Suíte de Testes Automatizados da Fase A (Cotas, Limites e Concorrência Real)
 * 
 * Escopo de Validação:
 * 1. Safety Gate estático: bloqueio rigoroso contra execução fora de localhost/linkzivo_test_isolated.
 * 2. Limites centralizados: PLAN_LIMITS (FREE = 5, CREATOR = 1000).
 * 3. Provisionamento padrão: getOrCreateDefaultWorkspace cria workspaces com plan = "FREE".
 * 4. countOccupiedSlots:
 *    - Links ACTIVE e PAUSED ocupam vaga.
 *    - Links ARCHIVED não ocupam vaga.
 *    - Links com expiresAt <= now() não ocupam vaga (expiração desacoplada em tempo de execução).
 *    - Links com pauseReason = 'DOWNGRADE' não ocupam vaga na cota Free.
 * 5. checkAndLockWorkspaceQuota:
 *    - Retorno tipado em caso de sucesso (allowed: true, remainingSlots).
 *    - Rejeição tipada para workspace inexistente (WORKSPACE_NOT_FOUND).
 *    - Rejeição tipada quando limite for atingido (QUOTA_EXCEEDED).
 * 6. Teste de Serialização de Lock (PostgreSQL FOR UPDATE):
 *    - Comprovação de que duas transações concorrentes sobre o mesmo workspace são serializadas.
 * 7. Teste de Concorrência Real (10 operações simultâneas disputando 5 vagas):
 *    - 10 requisições paralelas via Promise.all.
 *    - Exatamente 5 sucessos e 5 rejeições por cota.
 *    - Total de links persistidos no banco = exatamente 5.
 */

const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");

// ============================================================================
// 1. SAFETY GATE ESTÁTICO (Pré-inicialização)
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
    throw new Error(`[SAFETY GATE BLOQUEIO]: Host '${parsed.hostname}' não autorizado. Permitido: localhost.`);
  }

  if (parsed.port !== "5432") {
    throw new Error(`[SAFETY GATE BLOQUEIO]: Porta '${parsed.port}' não autorizada. Esperada: 5432.`);
  }

  const dbName = parsed.pathname.replace(/^\//, "");
  if (dbName !== "linkzivo_test_isolated") {
    throw new Error(`[SAFETY GATE BLOQUEIO]: Banco '${dbName}' não autorizado! Permitido: 'linkzivo_test_isolated'.`);
  }
}

// Executa Safety Gate antes de qualquer inicialização
const TEST_DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/linkzivo_test_isolated?schema=public";
validateSafetyGateStatic(TEST_DATABASE_URL);
process.env.DATABASE_URL = TEST_DATABASE_URL;

// ============================================================================
// INICIALIZAÇÃO DO PRISMA E MÓDULOS DA APLICAÇÃO
// ============================================================================
const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DATABASE_URL } },
});

// Importação dinâmica / compatível de plans.ts e auth.ts
const {
  PLAN_LIMITS,
  countOccupiedSlots,
  checkAndLockWorkspaceQuota,
} = require("../src/lib/plans");

const { getOrCreateDefaultWorkspace } = require("../src/lib/auth");

// Helpers de assertions
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

async function runTests() {
  console.log("\n=======================================================");
  console.log("LINKZIVO — Bateria de Testes Automatizados da Fase A");
  console.log(`Banco Alvo: ${TEST_DATABASE_URL}`);
  console.log("=======================================================\n");

  const testRunId = `fase_a_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

  try {
    // --------------------------------------------------------------------------
    // Teste 1: Limites Centralizados em PLAN_LIMITS
    // --------------------------------------------------------------------------
    console.log("[Teste 1] Validação das constantes em PLAN_LIMITS...");
    assert(PLAN_LIMITS.FREE.maxSlots === 5, "Plano FREE deve possuir exatamente 5 maxSlots.");
    assert(PLAN_LIMITS.FREE.analyticsDays === 30, "Plano FREE deve possuir 30 dias de analytics.");
    assert(PLAN_LIMITS.CREATOR.maxSlots === 1000, "Plano CREATOR deve possuir exatamente 1000 maxSlots.");
    assert(PLAN_LIMITS.CREATOR.analyticsDays === 365, "Plano CREATOR deve possuir 365 dias de analytics.");
    assert(PLAN_LIMITS.CREATOR.canExpire === true, "Plano CREATOR permite expiração.");
    assert(PLAN_LIMITS.FREE.canExpire === false, "Plano FREE não permite expiração.");

    // --------------------------------------------------------------------------
    // Teste 2: Provisionamento Padrão de Novos Workspaces (FREE)
    // --------------------------------------------------------------------------
    console.log("\n[Teste 2] Provisionamento padrão de novos workspaces em auth.ts...");
    const testUser = await prisma.user.create({
      data: {
        email: `user_${testRunId}@test.local`,
        name: "Test Provisioning User",
      },
    });

    const createdWs = await getOrCreateDefaultWorkspace(testUser.id, prisma);
    assert(createdWs.plan === "FREE", `Novo workspace deve ser provisionado com plan 'FREE', recebido: '${createdWs.plan}'.`);
    assert(createdWs.userId === testUser.id, "Workspace deve ser vinculado ao userId 1:1.");

    // --------------------------------------------------------------------------
    // Teste 3: countOccupiedSlots (Regras de Vagas Ocupadas)
    // --------------------------------------------------------------------------
    console.log("\n[Teste 3] Contagem de vagas ocupadas (countOccupiedSlots)...");
    const ws1 = await prisma.workspace.create({
      data: {
        userId: (await prisma.user.create({ data: { email: `u1_${testRunId}@test.local` } })).id,
        name: "Workspace Contagem",
        slug: `ws-contagem-${testRunId}`,
        plan: "FREE",
      },
    });

    // Inicialmente vazio
    const countInitial = await countOccupiedSlots(ws1.id, prisma);
    assert(countInitial === 0, "Workspace recém-criado deve ter 0 vagas ocupadas.");

    // Cria link ACTIVE (deve ocupar vaga)
    const l1 = await prisma.smartLink.create({
      data: {
        workspaceId: ws1.id,
        slug: `l1-${testRunId}`,
        destinationUrl: "https://example.com/1",
        status: "ACTIVE",
      },
    });
    assert((await countOccupiedSlots(ws1.id, prisma)) === 1, "Link ACTIVE deve ocupar 1 vaga.");

    // Cria link PAUSED manual por USER (deve ocupar vaga)
    const l2 = await prisma.smartLink.create({
      data: {
        workspaceId: ws1.id,
        slug: `l2-${testRunId}`,
        destinationUrl: "https://example.com/2",
        status: "PAUSED",
        pauseReason: "USER",
      },
    });
    assert((await countOccupiedSlots(ws1.id, prisma)) === 2, "Link PAUSED por USER deve ocupar vaga.");

    // Cria link ARCHIVED (NÃO deve ocupar vaga)
    const l3 = await prisma.smartLink.create({
      data: {
        workspaceId: ws1.id,
        slug: `l3-${testRunId}`,
        destinationUrl: "https://example.com/3",
        status: "ARCHIVED",
      },
    });
    assert((await countOccupiedSlots(ws1.id, prisma)) === 2, "Link ARCHIVED NÃO deve ocupar vaga.");

    // Cria link com expiresAt no passado (NÃO deve ocupar vaga)
    const pastDate = new Date(Date.now() - 3600 * 1000); // 1 hora atrás
    const l4 = await prisma.smartLink.create({
      data: {
        workspaceId: ws1.id,
        slug: `l4-${testRunId}`,
        destinationUrl: "https://example.com/4",
        status: "ACTIVE",
        expiresAt: pastDate,
      },
    });
    assert((await countOccupiedSlots(ws1.id, prisma)) === 2, "Link com expiresAt no passado NÃO deve ocupar vaga.");

    // Cria link congelado por DOWNGRADE (NÃO deve ocupar vaga no Free)
    const l5 = await prisma.smartLink.create({
      data: {
        workspaceId: ws1.id,
        slug: `l5-${testRunId}`,
        destinationUrl: "https://example.com/5",
        status: "PAUSED",
        pauseReason: "DOWNGRADE",
        previousStatus: "ACTIVE",
      },
    });
    assert((await countOccupiedSlots(ws1.id, prisma)) === 2, "Link com pauseReason='DOWNGRADE' NÃO ocupa vaga no Free.");

    // Cria link ACTIVE com expiresAt no futuro (DEVE ocupar vaga)
    const futureDate = new Date(Date.now() + 86400 * 1000); // amanhã
    const l6 = await prisma.smartLink.create({
      data: {
        workspaceId: ws1.id,
        slug: `l6-${testRunId}`,
        destinationUrl: "https://example.com/6",
        status: "ACTIVE",
        expiresAt: futureDate,
      },
    });
    assert((await countOccupiedSlots(ws1.id, prisma)) === 3, "Link com expiresAt futuro DEVE ocupar vaga.");

    // --------------------------------------------------------------------------
    // Teste 4: checkAndLockWorkspaceQuota e Tipagem de Erros
    // --------------------------------------------------------------------------
    console.log("\n[Teste 4] Validação de cotas e erros tipados...");
    
    // 4.1 Workspace inexistente
    await prisma.$transaction(async (tx) => {
      const nonExistent = await checkAndLockWorkspaceQuota("id_inexistente_123", tx);
      assert(nonExistent.allowed === false, "Workspace inexistente deve retornar allowed=false.");
      assert(nonExistent.code === "WORKSPACE_NOT_FOUND", "Código de erro deve ser WORKSPACE_NOT_FOUND.");
    });

    // 4.2 Workspace com vagas livres
    await prisma.$transaction(async (tx) => {
      const checkFree = await checkAndLockWorkspaceQuota(ws1.id, tx);
      assert(checkFree.allowed === true, "Workspace com 3/5 vagas deve permitir nova criação.");
      assert(checkFree.currentCount === 3, "Contagem atual deve ser 3.");
      assert(checkFree.remainingSlots === 2, "Vagas restantes devem ser 2.");
    });

    // Preenche as 2 vagas restantes de ws1 para atingir 5
    await prisma.smartLink.createMany({
      data: [
        { workspaceId: ws1.id, slug: `fill1-${testRunId}`, destinationUrl: "https://example.com/f1", status: "ACTIVE" },
        { workspaceId: ws1.id, slug: `fill2-${testRunId}`, destinationUrl: "https://example.com/f2", status: "ACTIVE" },
      ],
    });

    // 4.3 Workspace com cota cheia (5/5)
    await prisma.$transaction(async (tx) => {
      const checkFull = await checkAndLockWorkspaceQuota(ws1.id, tx);
      assert(checkFull.allowed === false, "Workspace com 5/5 vagas deve rejeitar nova criação.");
      assert(checkFull.code === "QUOTA_EXCEEDED", "Código de erro deve ser QUOTA_EXCEEDED.");
      assert(checkFull.currentCount === 5, "currentCount deve ser 5.");
      assert(checkFull.maxSlots === 5, "maxSlots deve ser 5.");
    });

    // --------------------------------------------------------------------------
    // Teste 5: Serialização de Lock (PostgreSQL FOR UPDATE)
    // --------------------------------------------------------------------------
    console.log("\n[Teste 5] Verificação de serialização transacional (FOR UPDATE)...");
    const wsLock = await prisma.workspace.create({
      data: {
        userId: (await prisma.user.create({ data: { email: `lock_${testRunId}@test.local` } })).id,
        name: "Workspace Lock Test",
        slug: `ws-lock-${testRunId}`,
        plan: "FREE",
      },
    });

    let t1Acquired = false;
    let t1Released = false;
    let t2AcquiredAfterT1 = false;

    const promiseT1 = prisma.$transaction(async (tx) => {
      // T1 adquire o lock
      await tx.$queryRaw`SELECT id, plan FROM "Workspace" WHERE id = ${wsLock.id} FOR UPDATE`;
      t1Acquired = true;
      // Segura o lock por 350ms
      await new Promise((resolve) => setTimeout(resolve, 350));
      t1Released = true;
    });

    // Espera 50ms para garantir que T1 adquiriu o lock antes de T2 iniciar
    await new Promise((resolve) => setTimeout(resolve, 50));

    const promiseT2 = prisma.$transaction(async (tx) => {
      // T2 tenta adquirir o lock no mesmo workspace
      await tx.$queryRaw`SELECT id, plan FROM "Workspace" WHERE id = ${wsLock.id} FOR UPDATE`;
      if (t1Released) {
        t2AcquiredAfterT1 = true;
      }
    });

    await Promise.all([promiseT1, promiseT2]);
    assert(t1Acquired, "Transação T1 adquiriu o lock com sucesso.");
    assert(t2AcquiredAfterT1, "Transação T2 aguardou a liberação de T1 (serialização comprovada).");

    // --------------------------------------------------------------------------
    // Teste 6: Teste de Concorrência Real (10 requisições disputando 5 vagas)
    // --------------------------------------------------------------------------
    console.log("\n[Teste 6] Teste de Concorrência Real: 10 requisições simultâneas disputando 5 vagas...");
    const wsConcurrent = await prisma.workspace.create({
      data: {
        userId: (await prisma.user.create({ data: { email: `conc_${testRunId}@test.local` } })).id,
        name: "Workspace Concorrência",
        slug: `ws-conc-${testRunId}`,
        plan: "FREE",
      },
    });

    // Função transacional canônica simulando o handler de criação
    async function attemptCreateLink(index) {
      try {
        return await prisma.$transaction(async (tx) => {
          // 1. Adquire lock e valida cota atomicamente
          const quotaCheck = await checkAndLockWorkspaceQuota(wsConcurrent.id, tx);
          if (!quotaCheck.allowed) {
            return { success: false, reason: quotaCheck.code, index };
          }

          // 2. Insere link sob a proteção do lock
          const created = await tx.smartLink.create({
            data: {
              workspaceId: wsConcurrent.id,
              slug: `conc-${index}-${testRunId}`,
              destinationUrl: `https://example.com/conc/${index}`,
              status: "ACTIVE",
            },
          });

          return { success: true, linkId: created.id, index };
        });
      } catch (err) {
        return { success: false, error: err.message, index };
      }
    }

    // Dispara 10 tentativas exatamente no mesmo instante
    const attempts = Array.from({ length: 10 }, (_, i) => attemptCreateLink(i));
    const results = await Promise.all(attempts);

    const successes = results.filter((r) => r.success);
    const rejections = results.filter((r) => !r.success && r.reason === "QUOTA_EXCEEDED");
    const otherErrors = results.filter((r) => !r.success && r.reason !== "QUOTA_EXCEEDED");

    console.log(`  -> Sucessos: ${successes.length}`);
    console.log(`  -> Rejeições por cota cheia: ${rejections.length}`);
    console.log(`  -> Outros erros: ${otherErrors.length}`);

    assert(successes.length === 5, "Exatamente 5 requisições devem ter sucesso.");
    assert(rejections.length === 5, "Exatamente 5 requisições devem ser rejeitadas por QUOTA_EXCEEDED.");
    assert(otherErrors.length === 0, "Nenhum erro inesperado de infraestrutura deve ocorrer.");

    const finalCount = await prisma.smartLink.count({
      where: { workspaceId: wsConcurrent.id },
    });
    assert(finalCount === 5, `Total de links no banco deve ser rigorosamente 5. Encontrado: ${finalCount}`);

    console.log("\n=======================================================");
    console.log(`✅ FASE A: TODOS OS ${passedTests}/${totalTests} TESTES FORAM APROVADOS COM SUCESSO!`);
    console.log("=======================================================\n");
  } catch (err) {
    console.error("\n❌ ERRO NA EXECUÇÃO DA BATERIA DE TESTES:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();

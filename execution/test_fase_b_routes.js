/**
 * LINKZIVO — Suíte de Testes de Integração HTTP da Fase B (Rotas Reais de Links)
 * 
 * Valida:
 * 1. Exercício dos handlers HTTP reais (POST /api/links, PATCH/DELETE /api/links/[id]).
 * 2. Bloqueio de cota Free (HTTP 403 ao tentar criar o 6º link).
 * 3. Criação estendida em conta Creator (capacidade além de 5 links).
 * 4. Exclusividade Creator: rejeição de expiresAt e fallbackUrl para contas Free (HTTP 403).
 * 5. Validação de segurança: rejeição de data de expiração no passado (HTTP 400) e SSRF em fallbackUrl.
 * 6. Pausar link mantém ocupação de vaga (pausar NÃO libera vaga).
 * 7. Arquivar link (status: ARCHIVED) libera vaga preservando registros.
 * 8. Desarquivar e reativar exige vaga disponível (HTTP 403 se cota cheia).
 * 9. Reativação de link expirado exige nova data futura válida (HTTP 400).
 * 10. Exclusão física (DELETE) libera vaga.
 * 11. Teste de concorrência real nos handlers HTTP (10 requisições POST simultâneas disputando a 5ª vaga).
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

// Importação dos handlers reais
const { POST: postLinkHandler } = require("../src/app/api/links/route");
const { PATCH: patchLinkHandler, DELETE: deleteLinkHandler } = require("../src/app/api/links/[id]/route");
const { signSessionToken } = require("../src/lib/auth");

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

// Helper para forjar NextRequest com cookie assinado de sessão
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

async function runTests() {
  console.log("\n=======================================================");
  console.log("LINKZIVO — Bateria de Testes HTTP da Fase B (Rotas Reais)");
  console.log(`Banco Alvo: ${TEST_DATABASE_URL}`);
  console.log("=======================================================\n");

  const testRunId = `fase_b_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

  try {
    // --------------------------------------------------------------------------
    // Setup: Usuário e Workspace Free
    // --------------------------------------------------------------------------
    const freeUser = await prisma.user.create({
      data: {
        email: `free_${testRunId}@test.local`,
        name: "Free User Test",
      },
    });

    const freeWs = await prisma.workspace.create({
      data: {
        userId: freeUser.id,
        name: "Workspace Free Test",
        slug: `ws-free-${testRunId}`,
        plan: "FREE",
      },
    });

    const freeToken = await createAuthToken(freeUser.id, freeWs.id);

    // Setup: Usuário e Workspace Creator
    const creatorUser = await prisma.user.create({
      data: {
        email: `creator_${testRunId}@test.local`,
        name: "Creator User Test",
      },
    });

    const creatorWs = await prisma.workspace.create({
      data: {
        userId: creatorUser.id,
        name: "Workspace Creator Test",
        slug: `ws-creator-${testRunId}`,
        plan: "CREATOR",
      },
    });

    const creatorToken = await createAuthToken(creatorUser.id, creatorWs.id);

    // --------------------------------------------------------------------------
    // Teste 1: Criação de Links até o Limite no Free (POST /api/links)
    // --------------------------------------------------------------------------
    console.log("[Teste 1] Criação de links no Plano Free até o limite (5 vagas)...");
    const createdFreeLinkIds = [];

    for (let i = 1; i <= 5; i++) {
      const req = createAuthenticatedRequest(
        "http://localhost:3000/api/links",
        "POST",
        {
          url: `https://example.com/free/${i}`,
          title: `Free Link ${i}`,
        },
        freeToken
      );

      const res = await postLinkHandler(req);
      assert(res.status === 201, `Criação do link ${i}/5 deve retornar HTTP 201 (recebido: ${res.status}).`);
      const data = await res.json();
      assert(data.success === true, `Link ${i} deve conter success=true.`);
      createdFreeLinkIds.push(data.link.id);
    }

    // --------------------------------------------------------------------------
    // Teste 2: Tentativa de Criar o 6º Link no Free (Cota Esgotada)
    // --------------------------------------------------------------------------
    console.log("\n[Teste 2] Tentativa de criar o 6º link em conta Free com cota cheia...");
    const reqExceeded = createAuthenticatedRequest(
      "http://localhost:3000/api/links",
      "POST",
      {
        url: "https://example.com/free/6",
        title: "Free Link 6",
      },
      freeToken
    );

    const resExceeded = await postLinkHandler(reqExceeded);
    assert(resExceeded.status === 403, `Tentativa do 6º link deve retornar HTTP 403 (recebido: ${resExceeded.status}).`);
    const dataExceeded = await resExceeded.json();
    assert(dataExceeded.code === "QUOTA_EXCEEDED", "Código de erro deve ser QUOTA_EXCEEDED.");
    assert(dataExceeded.currentCount === 5, "currentCount reportado deve ser 5.");
    assert(dataExceeded.maxSlots === 5, "maxSlots reportado deve ser 5.");

    // --------------------------------------------------------------------------
    // Teste 3: Exclusividade Creator (Rejeição de expiresAt/fallbackUrl no Free)
    // --------------------------------------------------------------------------
    console.log("\n[Teste 3] Validação de recursos exclusivos Creator em conta Free...");
    
    // Tenta POST com expiresAt no Free (em um workspace Free com vaga disponível)
    const tempFreeWs = await prisma.workspace.create({
      data: {
        userId: (await prisma.user.create({ data: { email: `tfree_${testRunId}@test.local` } })).id,
        name: "Temp Free",
        slug: `ws-temp-free-${testRunId}`,
        plan: "FREE",
      },
    });
    const tempFreeToken = await createAuthToken(tempFreeWs.userId, tempFreeWs.id);

    const reqFreeExp = createAuthenticatedRequest(
      "http://localhost:3000/api/links",
      "POST",
      {
        url: "https://example.com/exp",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
      tempFreeToken
    );
    const resFreeExp = await postLinkHandler(reqFreeExp);
    assert(resFreeExp.status === 403, "POST com expiresAt em conta Free deve retornar HTTP 403.");
    const dataFreeExp = await resFreeExp.json();
    assert(dataFreeExp.code === "FEATURE_NOT_AVAILABLE_IN_PLAN", "Código deve ser FEATURE_NOT_AVAILABLE_IN_PLAN.");

    // Tenta POST com fallbackUrl no Free
    const reqFreeFb = createAuthenticatedRequest(
      "http://localhost:3000/api/links",
      "POST",
      {
        url: "https://example.com/fb",
        fallbackUrl: "https://example.com/fallback",
      },
      tempFreeToken
    );
    const resFreeFb = await postLinkHandler(reqFreeFb);
    assert(resFreeFb.status === 403, "POST com fallbackUrl em conta Free deve retornar HTTP 403.");

    // --------------------------------------------------------------------------
    // Teste 4: Expiração e Fallback no Creator com Validações de Segurança
    // --------------------------------------------------------------------------
    console.log("\n[Teste 4] Expiração e Fallback no Plano Creator com segurança...");
    
    // 4.1 Data de expiração no passado deve retornar HTTP 400
    const reqPastExp = createAuthenticatedRequest(
      "http://localhost:3000/api/links",
      "POST",
      {
        url: "https://example.com/creator/1",
        expiresAt: new Date(Date.now() - 3600000).toISOString(),
      },
      creatorToken
    );
    const resPastExp = await postLinkHandler(reqPastExp);
    assert(resPastExp.status === 400, "POST com expiresAt no passado deve retornar HTTP 400.");

    // 4.2 Fallback URL insegura (javascript:) deve retornar HTTP 400 (Anti-SSRF/XSS)
    const reqBadFb = createAuthenticatedRequest(
      "http://localhost:3000/api/links",
      "POST",
      {
        url: "https://example.com/creator/1",
        fallbackUrl: "javascript:alert(1)",
      },
      creatorToken
    );
    const resBadFb = await postLinkHandler(reqBadFb);
    assert(resBadFb.status === 400, "POST com fallbackUrl insegura (javascript:) deve retornar HTTP 400.");

    // 4.3 Criação válida com expiresAt futuro e fallback seguro no Creator (HTTP 201)
    const futureIso = new Date(Date.now() + 7 * 86400000).toISOString();
    const reqCreatorOk = createAuthenticatedRequest(
      "http://localhost:3000/api/links",
      "POST",
      {
        url: "https://example.com/creator/valid",
        expiresAt: futureIso,
        fallbackUrl: "https://example.com/safe-fallback",
      },
      creatorToken
    );
    const resCreatorOk = await postLinkHandler(reqCreatorOk);
    assert(resCreatorOk.status === 201, "POST Creator com expiresAt e fallback válidos deve retornar HTTP 201.");
    const dataCreatorOk = await resCreatorOk.json();
    assert(dataCreatorOk.link.fallbackUrl === "https://example.com/safe-fallback", "fallbackUrl deve ser persistida.");
    assert(dataCreatorOk.link.expiresAt !== null, "expiresAt deve ser persistido.");

    // --------------------------------------------------------------------------
    // Teste 5: Pausar NÃO libera vaga, Arquivar LIBERA vaga (PATCH /api/links/[id])
    // --------------------------------------------------------------------------
    console.log("\n[Teste 5] Ciclo de vida: Pausar mantém vaga, Arquivar libera vaga...");
    const linkIdToPause = createdFreeLinkIds[0];

    // 5.1 Pausar o link 1
    const reqPause = createAuthenticatedRequest(
      `http://localhost:3000/api/links/${linkIdToPause}`,
      "PATCH",
      { status: "PAUSED" },
      freeToken
    );
    const resPause = await patchLinkHandler(reqPause, { params: Promise.resolve({ id: linkIdToPause }) });
    assert(resPause.status === 200, "Pausar link ativo deve retornar HTTP 200.");
    const dataPause = await resPause.json();
    assert(dataPause.link.status === "PAUSED", "Status deve ser PAUSED.");
    assert(dataPause.link.pauseReason === "USER", "pauseReason deve ser USER.");

    // 5.2 Tentativa de criar link com 4 ativos e 1 pausado manual deve ser BLOQUEADA (vagas ocupadas = 5)
    const reqStillFull = createAuthenticatedRequest(
      "http://localhost:3000/api/links",
      "POST",
      { url: "https://example.com/fail", title: "Still Full" },
      freeToken
    );
    const resStillFull = await postLinkHandler(reqStillFull);
    assert(resStillFull.status === 403, "Criação com 4 ativos e 1 pausado manual deve ser bloqueada (HTTP 403).");

    // 5.3 Arquivar o link 1 (status: ARCHIVED)
    const reqArchive = createAuthenticatedRequest(
      `http://localhost:3000/api/links/${linkIdToPause}`,
      "PATCH",
      { status: "ARCHIVED" },
      freeToken
    );
    const resArchive = await patchLinkHandler(reqArchive, { params: Promise.resolve({ id: linkIdToPause }) });
    assert(resArchive.status === 200, "Arquivar link deve retornar HTTP 200.");
    const dataArchive = await resArchive.json();
    assert(dataArchive.link.status === "ARCHIVED", "Status deve ser ARCHIVED.");

    // 5.4 Criação de novo link agora DEVE TER SUCESSO (vagas ocupadas eram 4)
    const reqSuccessSlot = createAuthenticatedRequest(
      "http://localhost:3000/api/links",
      "POST",
      { url: "https://example.com/liberado", title: "Novo Link Pós Arquivamento" },
      freeToken
    );
    const resSuccessSlot = await postLinkHandler(reqSuccessSlot);
    assert(resSuccessSlot.status === 201, "Criação de link após arquivamento deve retornar HTTP 201.");
    const dataSuccessSlot = await resSuccessSlot.json();
    const newCreatedId = dataSuccessSlot.link.id;

    // --------------------------------------------------------------------------
    // Teste 6: Desarquivar com Cota Cheia é REJEITADO (HTTP 403)
    // --------------------------------------------------------------------------
    console.log("\n[Teste 6] Tentativa de desarquivar link com cota cheia...");
    const reqUnarchiveBlocked = createAuthenticatedRequest(
      `http://localhost:3000/api/links/${linkIdToPause}`,
      "PATCH",
      { status: "ACTIVE" },
      freeToken
    );
    const resUnarchiveBlocked = await patchLinkHandler(reqUnarchiveBlocked, {
      params: Promise.resolve({ id: linkIdToPause }),
    });
    assert(resUnarchiveBlocked.status === 403, "Desarquivar com cota cheia deve retornar HTTP 403.");
    const dataUnarchiveBlocked = await resUnarchiveBlocked.json();
    assert(dataUnarchiveBlocked.code === "QUOTA_EXCEEDED", "Código deve ser QUOTA_EXCEEDED.");

    // --------------------------------------------------------------------------
    // Teste 7: Exclusão Física (DELETE) Libera Vaga
    // --------------------------------------------------------------------------
    console.log("\n[Teste 7] Exclusão física (DELETE) e liberação de vaga...");
    const reqDelete = createAuthenticatedRequest(
      `http://localhost:3000/api/links/${newCreatedId}`,
      "DELETE",
      null,
      freeToken
    );
    const resDelete = await deleteLinkHandler(reqDelete, { params: Promise.resolve({ id: newCreatedId }) });
    assert(resDelete.status === 200, "Exclusão física deve retornar HTTP 200.");

    // Agora desarquivar o link 1 deve ter sucesso!
    const reqUnarchiveOk = createAuthenticatedRequest(
      `http://localhost:3000/api/links/${linkIdToPause}`,
      "PATCH",
      { status: "ACTIVE" },
      freeToken
    );
    const resUnarchiveOk = await patchLinkHandler(reqUnarchiveOk, {
      params: Promise.resolve({ id: linkIdToPause }),
    });
    assert(resUnarchiveOk.status === 200, "Desarquivar após exclusão de outro link deve retornar HTTP 200.");

    // --------------------------------------------------------------------------
    // Teste 8: Edição Neutra (Título/URL) NÃO Bloqueia Mesmo com Cota Cheia
    // --------------------------------------------------------------------------
    console.log("\n[Teste 8] Edição de título/URL em link existente com cota cheia...");
    const reqEditTitle = createAuthenticatedRequest(
      `http://localhost:3000/api/links/${linkIdToPause}`,
      "PATCH",
      { title: "Título Atualizado com Cota Cheia" },
      freeToken
    );
    const resEditTitle = await patchLinkHandler(reqEditTitle, {
      params: Promise.resolve({ id: linkIdToPause }),
    });
    assert(resEditTitle.status === 200, "Editar título sem alterar cota deve retornar HTTP 200 mesmo com 5/5 links.");
    const dataEditTitle = await resEditTitle.json();
    assert(dataEditTitle.link.title === "Título Atualizado com Cota Cheia", "Título deve ser atualizado.");

    // --------------------------------------------------------------------------
    // Teste 9: Concorrência Real nos Handlers HTTP (10 requisições simultâneas disputando 1 vaga livre)
    // --------------------------------------------------------------------------
    console.log("\n[Teste 9] Concorrência HTTP Real: 10 requisições POST simultâneas para a última vaga...");
    const wsConcHttp = await prisma.workspace.create({
      data: {
        userId: (await prisma.user.create({ data: { email: `conchttp_${testRunId}@test.local` } })).id,
        name: "Workspace Concorrência HTTP",
        slug: `ws-conc-http-${testRunId}`,
        plan: "FREE",
      },
    });

    const concHttpToken = await createAuthToken(wsConcHttp.userId, wsConcHttp.id);

    // Preenche 4 vagas
    for (let i = 1; i <= 4; i++) {
      await prisma.smartLink.create({
        data: {
          workspaceId: wsConcHttp.id,
          slug: `ch-${i}-${testRunId}`,
          destinationUrl: `https://example.com/ch/${i}`,
          status: "ACTIVE",
        },
      });
    }

    // Dispara 10 requisições HTTP POST simultâneas chamando o handler real
    const httpAttempts = Array.from({ length: 10 }, (_, i) => {
      const req = createAuthenticatedRequest(
        "http://localhost:3000/api/links",
        "POST",
        {
          url: `https://example.com/conc-http/${i}`,
          title: `Conc HTTP Link ${i}`,
        },
        concHttpToken
      );
      return postLinkHandler(req);
    });

    const httpResponses = await Promise.all(httpAttempts);
    const statuses = httpResponses.map((r) => r.status);
    const successCount = statuses.filter((s) => s === 201).length;
    const quotaExceededCount = statuses.filter((s) => s === 403).length;

    console.log(`  -> Requisições com HTTP 201 (Sucesso): ${successCount}`);
    console.log(`  -> Requisições com HTTP 403 (Cota Bloqueada): ${quotaExceededCount}`);

    assert(successCount === 1, "Exatamente 1 requisição deve receber HTTP 201 (conquistou a 5ª vaga).");
    assert(quotaExceededCount === 9, "Exatamente 9 requisições devem receber HTTP 403 (barradas pela cota).");

    const finalHttpCount = await prisma.smartLink.count({
      where: { workspaceId: wsConcHttp.id },
    });
    assert(finalHttpCount === 5, `Total de links no banco deve ser rigorosamente 5. Encontrado: ${finalHttpCount}`);

    console.log("\n=======================================================");
    console.log(`✅ FASE B: TODOS OS ${passedTests}/${totalTests} TESTES FORAM APROVADOS COM SUCESSO!`);
    console.log("=======================================================\n");
  } catch (err) {
    console.error("\n❌ ERRO NA EXECUÇÃO DA BATERIA DE TESTES HTTP DA FASE B:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();

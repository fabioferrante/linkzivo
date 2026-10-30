/**
 * execution/test_oidc_http_routes.js
 * LINKZIVO — Testes dos Handlers HTTP de Rotas OIDC (/api/auth/google e callback)
 */

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/linkzivo_test_isolated?schema=public";
process.env.DATABASE_URL = TEST_DATABASE_URL;

const { PrismaClient } = require("@prisma/client");
const { NextRequest } = require("next/server");
const crypto = require("crypto");

const { GET: googleStartHandler } = require("../src/app/api/auth/google/route.ts");
const { GET: googleCallbackHandler } = require("../src/app/api/auth/google/callback/route.ts");
const { signSessionToken } = require("../src/lib/auth.ts");

const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DATABASE_URL } },
});

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log("\n================================================================================");
  console.log("   LINKZIVO — ETAPA 5: TESTES DE HANDLERS HTTP DE GOOGLE OIDC");
  console.log("================================================================================\n");

  const stamp = Date.now();
  process.env.GOOGLE_CLIENT_ID = "mock-client-id-test.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "mock-secret-test";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

  // 1. Preparar usuário para testes de intent=connect
  const testUser = await prisma.user.create({
    data: {
      name: "Connect Tester",
      email: `connect_${stamp}@linkzivo.internal`,
      status: "ACTIVE",
    },
  });

  const testWs = await prisma.workspace.create({
    data: {
      userId: testUser.id,
      name: "Connect WS",
      slug: `ws-connect-${stamp}`,
      plan: "FREE",
    },
  });

  const sessionRecord = await prisma.session.create({
    data: {
      userId: testUser.id,
      workspaceId: testWs.id,
      expiresAt: new Date(Date.now() + 3600 * 1000),
    },
  });

  const rawPayload = `${sessionRecord.id}:${testUser.id}:${testWs.id}`;
  const signedToken = signSessionToken(rawPayload);
  let savedChallenge = null;

  try {
    // --- 1. Rota de Início: /api/auth/google sem autenticação ---
    console.log("--- 1. Rota de Início: /api/auth/google ---");
    const reqStart = new NextRequest("http://localhost:3000/api/auth/google");
    const resStart = await googleStartHandler(reqStart);

    assert(resStart.status === 302, "Início do fluxo Google retorna redirecionamento HTTP 302");
    const location = resStart.headers.get("location");
    assert(location && location.startsWith("https://accounts.google.com/o/oauth2/v2/auth"), "Redireciona para o endpoint oficial do Google");

    const authUrl = new URL(location);
    assert(authUrl.searchParams.get("client_id") === process.env.GOOGLE_CLIENT_ID, "client_id correto enviado");
    assert(authUrl.searchParams.get("redirect_uri") === "http://localhost:3000/api/auth/google/callback", "redirect_uri correta enviada");
    assert(authUrl.searchParams.get("response_type") === "code", "response_type=code");
    assert(authUrl.searchParams.get("scope") === "openid email profile", "escopo openid email profile solicitado");
    assert(authUrl.searchParams.get("code_challenge_method") === "S256", "PKCE S256 configurado");
    assert(authUrl.searchParams.get("prompt") === "select_account", "prompt select_account presente");
    assert(authUrl.searchParams.get("state")?.length === 64, "state com 256 bits de entropia (64 hex)");
    assert(authUrl.searchParams.get("nonce")?.length === 64, "nonce com 256 bits de entropia (64 hex)");

    // Cookie de fluxo
    const flowCookie = resStart.cookies.get("linkzivo_oidc_flow");
    assert(flowCookie && flowCookie.value.length === 64, "Cookie linkzivo_oidc_flow emitido com challengeId opaco de 64 hex");
    assert(flowCookie.httpOnly === true, "Cookie de fluxo é HttpOnly");

    // Desafio gravado no banco
    savedChallenge = await prisma.oidcChallenge.findUnique({
      where: { id: flowCookie.value },
    });
    assert(savedChallenge !== null, "OidcChallenge persistido no PostgreSQL");
    assert(savedChallenge.state === authUrl.searchParams.get("state"), "State no banco coincide com URL enviada");
    assert(savedChallenge.nonce === authUrl.searchParams.get("nonce"), "Nonce no banco coincide com URL enviada");
    assert(savedChallenge.targetUserId === null, "targetUserId é nulo em fluxo padrão");

    // --- 2. Rota de Início com intent=connect ---
    console.log("\n--- 2. Rota de Início com intent=connect ---");
    // Sem estar autenticado: deve retornar 401
    const reqConnectUnauth = new NextRequest("http://localhost:3000/api/auth/google?intent=connect");
    const resConnectUnauth = await googleStartHandler(reqConnectUnauth);
    assert(resConnectUnauth.status === 401, "intent=connect sem sessão retorna HTTP 401");

    // Autenticado: deve gravar targetUserId
    const reqConnectAuth = new NextRequest("http://localhost:3000/api/auth/google?intent=connect", {
      headers: { Cookie: `linkzivo_session=${signedToken}` },
    });
    const resConnectAuth = await googleStartHandler(reqConnectAuth);
    assert(resConnectAuth.status === 302, "intent=connect autenticado retorna HTTP 302");
    const connectFlowCookie = resConnectAuth.cookies.get("linkzivo_oidc_flow");
    const connectChallenge = await prisma.oidcChallenge.findUnique({
      where: { id: connectFlowCookie.value },
    });
    assert(connectChallenge && connectChallenge.targetUserId === testUser.id, "targetUserId gravado com o ID do usuário autenticado");

    // --- 3. Rota de Callback: /api/auth/google/callback Tratamento de Erros e Defesas ---
    console.log("\n--- 3. Rota de Callback: Casos de Erro e Segurança ---");

    // Cancelamento do Google (?error=access_denied)
    const reqGoogleDenied = new NextRequest("http://localhost:3000/api/auth/google/callback?error=access_denied");
    const resGoogleDenied = await googleCallbackHandler(reqGoogleDenied);
    assert(resGoogleDenied.status === 302, "Erro do Google redireciona (302)");
    assert(resGoogleDenied.headers.get("location")?.includes("auth_error=google_access_denied"), "Redireciona com auth_error=google_access_denied");

    // Parâmetros ausentes (code ou state faltando)
    const reqMissingParams = new NextRequest("http://localhost:3000/api/auth/google/callback?code=some_code");
    const resMissingParams = await googleCallbackHandler(reqMissingParams);
    assert(resMissingParams.headers.get("location")?.includes("auth_error=invalid_callback_params"), "Parâmetros incompletos redireciona com invalid_callback_params");

    // Cookie de fluxo ausente
    const reqMissingCookie = new NextRequest("http://localhost:3000/api/auth/google/callback?code=some_code&state=some_state");
    const resMissingCookie = await googleCallbackHandler(reqMissingCookie);
    assert(resMissingCookie.headers.get("location")?.includes("auth_error=invalid_callback_params"), "Sem cookie de fluxo redireciona com invalid_callback_params");

    // State adulterado/forjado com cookie presente
    const reqBadState = new NextRequest("http://localhost:3000/api/auth/google/callback?code=some_code&state=tampered_state", {
      headers: { Cookie: `linkzivo_oidc_flow=${savedChallenge.id}` },
    });
    const resBadState = await googleCallbackHandler(reqBadState);
    assert(resBadState.headers.get("location")?.includes("auth_error=invalid_or_expired_state"), "State adulterado rejeitado com invalid_or_expired_state");

    // Verificar se o desafio legítimo NÃO foi deletado na tentativa de state incorreto (prevenção contra DoS)
    const checkSurvived = await prisma.oidcChallenge.findUnique({ where: { id: savedChallenge.id } });
    assert(checkSurvived !== null, "Desafio legítimo preservado contra DoS de state forjado");

    // Desafio expirado
    const expiredChallengeId = crypto.randomBytes(32).toString("hex");
    await prisma.oidcChallenge.create({
      data: {
        id: expiredChallengeId,
        state: "expired_state",
        nonce: "expired_nonce",
        codeVerifier: "expired_verifier",
        expiresAt: new Date(Date.now() - 1000), // Expirado há 1 segundo
      },
    });

    const reqExpired = new NextRequest("http://localhost:3000/api/auth/google/callback?code=some_code&state=expired_state", {
      headers: { Cookie: `linkzivo_oidc_flow=${expiredChallengeId}` },
    });
    const resExpired = await googleCallbackHandler(reqExpired);
    assert(resExpired.headers.get("location")?.includes("auth_error=invalid_or_expired_state"), "Desafio expirado rejeitado com invalid_or_expired_state");

    // Confirmar que desafio expirado foi limpo do banco
    const checkDeletedExpired = await prisma.oidcChallenge.findUnique({ where: { id: expiredChallengeId } });
    assert(checkDeletedExpired === null, "Desafio expirado consumido/limpo do banco");

  } finally {
    // Limpeza
    await prisma.oidcChallenge.deleteMany({
      where: {
        OR: [
          { targetUserId: testUser.id },
          { id: { in: [savedChallenge?.id].filter(Boolean) } },
        ],
      },
    }).catch(() => {});
    await prisma.session.deleteMany({ where: { userId: testUser.id } }).catch(() => {});
    await prisma.workspace.deleteMany({ where: { userId: testUser.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log("\n================================================================================");
  console.log(`TOTAL DE ASSERÇÕES APROVADAS: ${passed}`);
  console.log(`TOTAL DE FALHAS:              ${failed}`);
  console.log("================================================================================\n");

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Erro fatal nos testes de rotas OIDC:", err);
  process.exit(1);
});

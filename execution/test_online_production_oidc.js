/**
 * execution/test_online_production_oidc.js
 * Homologação Online em Produção — Etapa 5: Google OIDC
 * Linkzivo Production URL: https://linkzivo-production.up.railway.app
 */

const BASE_URL = process.env.BASE_URL || "https://linkzivo-production.up.railway.app";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [OK] ${message}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${message}`);
  }
}

async function run() {
  console.log(`\n======================================================`);
  console.log(` INICIANDO HOMOLOGAÇÃO ONLINE EM PRODUÇÃO - ETAPA 5`);
  console.log(` Alvo: ${BASE_URL}`);
  console.log(`======================================================\n`);

  // 1. Início do Fluxo Google OIDC na Nuvem
  console.log(`--- 1. Início do Fluxo Google OIDC (/api/auth/google) ---`);
  const startRes = await fetch(`${BASE_URL}/api/auth/google`, { redirect: "manual" });
  assert(startRes.status === 302, `GET /api/auth/google retorna HTTP 302 Redirecionamento (Recebido: ${startRes.status})`);

  const setCookieHeader = startRes.headers.get("set-cookie");
  assert(setCookieHeader && setCookieHeader.includes("linkzivo_oidc_flow="), `Cookie transitório linkzivo_oidc_flow emitido`);
  assert(setCookieHeader && setCookieHeader.includes("HttpOnly"), `Cookie de fluxo possui flag HttpOnly`);
  assert(setCookieHeader && setCookieHeader.includes("Path=/api/auth/google/callback"), `Cookie de fluxo restrito ao path do callback`);

  const location = startRes.headers.get("location");
  assert(location && location.startsWith("https://accounts.google.com/o/oauth2/v2/auth"), `Redirecionamento aponta para os servidores do Google`);

  const googleUrl = new URL(location);
  const clientId = googleUrl.searchParams.get("client_id");
  const redirectUri = googleUrl.searchParams.get("redirect_uri");
  const state = googleUrl.searchParams.get("state");
  const nonce = googleUrl.searchParams.get("nonce");
  const codeChallenge = googleUrl.searchParams.get("code_challenge");

  assert(clientId && clientId.includes(".apps.googleusercontent.com"), `Client ID presente e formatado: ${clientId.slice(0, 15)}...`);
  assert(redirectUri === `${BASE_URL}/api/auth/google/callback`, `Redirect URI exata para produção: ${redirectUri}`);
  assert(googleUrl.searchParams.get("response_type") === "code", `response_type configurado como 'code'`);
  assert(googleUrl.searchParams.get("scope") === "openid email profile", `Escopos solicitados: 'openid email profile'`);
  assert(googleUrl.searchParams.get("code_challenge_method") === "S256", `PKCE habilitado com método 'S256'`);
  assert(codeChallenge && codeChallenge.length > 20, `code_challenge PKCE gerado com entropia`);
  assert(state && state.length === 64, `state gerado com 256 bits de entropia (64 hex)`);
  assert(nonce && nonce.length === 64, `nonce gerado com 256 bits de entropia (64 hex)`);
  assert(googleUrl.searchParams.get("prompt") === "select_account", `prompt configurado como 'select_account'`);

  // 2. Validação Real junto aos Servidores do Google
  console.log(`\n--- 2. Comunicação e Validação Real com o Google Identity ---`);
  const googleCheckRes = await fetch(location);
  assert(googleCheckRes.status === 200, `Servidores do Google retornam HTTP 200 OK para a URL de autorização`);

  const googleHtml = await googleCheckRes.text();
  const hasMismatch = googleHtml.includes("redirect_uri_mismatch");
  assert(!hasMismatch, `Google ACEITOU a redirect_uri (SEM erro de redirect_uri_mismatch)`);

  const isGoogleSignInPage =
    googleHtml.includes("Fazer login") ||
    googleHtml.includes("Sign in") ||
    googleHtml.includes("Escolha uma conta") ||
    googleHtml.includes("Choose an account") ||
    googleHtml.includes("accounts.google.com");
  assert(isGoogleSignInPage, `Página oficial de consentimento/login do Google carregada com sucesso`);

  // 3. Validação de intent=connect
  console.log(`\n--- 3. Validação de Vinculação In-App (intent=connect) ---`);
  const unauthConnectRes = await fetch(`${BASE_URL}/api/auth/google?intent=connect`, { redirect: "manual" });
  assert(unauthConnectRes.status === 401, `intent=connect sem autenticação retorna HTTP 401 (Recebido: ${unauthConnectRes.status})`);

  // Criar usuário em produção e testar connect autenticado
  const stamp = Date.now();
  const regUser = await fetch(`${BASE_URL}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "register",
      name: "OIDC Prod Tester",
      email: `oidc_prod_${stamp}@linkzivo-test.local`,
      password: `Pass#Prod_${stamp}!`,
    }),
  });
  const cookieUser = regUser.headers.get("set-cookie");
  assert(regUser.status === 200 && cookieUser, `Usuário registrado em produção com cookie de sessão ativo`);

  const authConnectRes = await fetch(`${BASE_URL}/api/auth/google?intent=connect`, {
    headers: { Cookie: cookieUser },
    redirect: "manual",
  });
  assert(authConnectRes.status === 302, `intent=connect com usuário autenticado autoriza e redireciona (HTTP 302)`);

  // 4. Defesas no Callback contra Invasão e Replay (/api/auth/google/callback)
  console.log(`\n--- 4. Defesas de Segurança no Callback (/api/auth/google/callback) ---`);

  // Cancelamento do Google
  const deniedRes = await fetch(`${BASE_URL}/api/auth/google/callback?error=access_denied`, { redirect: "manual" });
  assert(deniedRes.status === 302, `Acesso cancelado no Google redireciona (HTTP 302)`);
  assert(deniedRes.headers.get("location")?.includes("auth_error=google_access_denied"), `Redireciona com auth_error=google_access_denied`);

  // Parâmetros incompletos
  const missingParamsRes = await fetch(`${BASE_URL}/api/auth/google/callback?code=fake_code`, { redirect: "manual" });
  assert(missingParamsRes.headers.get("location")?.includes("auth_error=invalid_callback_params"), `Parâmetros incompletos redireciona com invalid_callback_params`);

  // Sem cookie de fluxo (ataque CSRF sem desafio)
  const noCookieRes = await fetch(`${BASE_URL}/api/auth/google/callback?code=fake_code&state=fake_state`, { redirect: "manual" });
  assert(noCookieRes.headers.get("location")?.includes("auth_error=invalid_callback_params"), `Requisição sem cookie de fluxo rejeitada com invalid_callback_params`);

  // State adulterado com cookie de fluxo presente
  const extractCookie = setCookieHeader ? setCookieHeader.split(";")[0] : "";
  const tamperedStateRes = await fetch(`${BASE_URL}/api/auth/google/callback?code=fake_code&state=adulterated_state_123456`, {
    headers: { Cookie: extractCookie },
    redirect: "manual",
  });
  assert(tamperedStateRes.headers.get("location")?.includes("auth_error=invalid_or_expired_state"), `State forjado ou divergente rejeitado com invalid_or_expired_state`);

  console.log(`\n======================================================`);
  console.log(` RESULTADO FINAL DA HOMOLOGAÇÃO EM PRODUÇÃO:`);
  console.log(` Total de Asserções: ${totalTests}`);
  console.log(` Aprovados:          ${passedTests}`);
  console.log(` Falhas:             ${failedTests}`);
  console.log(`======================================================\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Erro fatal na execução da homologação OIDC:", err);
  process.exit(1);
});

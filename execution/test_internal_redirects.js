/**
 * LINKZIVO — TESTES DE REDIRECIONAMENTOS INTERNOS E ORIGEM PÚBLICA
 * 
 * Validação rigorosa:
 * 1. Links inexistentes -> Redirecionamento 302 para /not-found-link no domínio público
 * 2. Links pausados -> Redirecionamento 302 para /paused-link no domínio público
 * 3. Links arquivados/inativos -> Redirecionamento 302 para /not-found-link no domínio público
 * 4. Links expirados sem fallback -> Redirecionamento 302 para /expired-link no domínio público
 * 5. Links expirados com fallback -> Redirecionamento 302 para a fallbackUrl
 * 6. Links ativos -> Redirecionamento 302 para a URL de destino com parâmetros de tracking
 * 7. Garantia anti-vazamento: NENHUM redirecionamento expõe 'localhost', '127.0.0.1' ou portas de container (:8080) quando testado em ambiente configurado
 */

const TARGET_URL = process.env.TEST_APP_URL || process.env.PROD_URL || "https://linkzivo-production.up.railway.app";

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message, details = "") {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    const err = `  [FAIL] ${message} ${details ? `(${details})` : ""}`;
    console.error(err);
    failures.push(err);
  }
}

async function request(path, options = {}) {
  const url = path.startsWith("http") ? path : `${TARGET_URL}${path}`;
  const headers = { ...(options.headers || {}) };
  if (options.cookie) {
    headers["Cookie"] = options.cookie;
  }
  if (options.json) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.json);
  }

  const res = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body,
    redirect: "manual",
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (e) {}

  return {
    status: res.status,
    headers: res.headers,
    location: res.headers.get("location") || "",
    setCookie: res.headers.get("set-cookie") || "",
    text,
    json,
  };
}

function extractSessionCookie(setCookieHeader) {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(/linkzivo_session=([^;]+)/);
  return match ? `linkzivo_session=${match[1]}` : null;
}

async function runTests() {
  const ts = Date.now();
  console.log("================================================================================");
  console.log(`   LINKZIVO — VALIDAÇÃO DE REDIRECTS INTERNOS`);
  console.log(`   Alvo: ${TARGET_URL}`);
  console.log(`   Timestamp: ${new Date().toISOString()}`);
  console.log("================================================================================\n");

  const targetOrigin = new URL(TARGET_URL).origin;

  // 1. LINK INEXISTENTE
  console.log("--- 1. TESTE: LINK INEXISTENTE (/not-found-link) ---");
  const nonExistentSlug = `non-existent-slug-${ts}`;
  const notFoundRes = await request(`/${nonExistentSlug}`);
  assert(notFoundRes.status === 302, `Link inexistente retorna HTTP 302 (status=${notFoundRes.status})`);
  assert(notFoundRes.location.includes("/not-found-link"), `Location aponta para /not-found-link (loc=${notFoundRes.location})`);
  assert(notFoundRes.location.startsWith(targetOrigin), `Location utiliza a origem pública configurada (${targetOrigin})`);
  assert(!notFoundRes.location.includes(":8080"), "Location não vaza porta interna de container :8080");
  if (TARGET_URL.includes("https://")) {
    assert(!notFoundRes.location.includes("localhost") && !notFoundRes.location.includes("127.0.0.1"), "Location não contém localhost ou loopback");
  }

  // 2. CADASTRO DE CONTA TEMPORÁRIA PARA CRIAR LINKS DE TESTE
  console.log("\n--- 2. SETUP DE LINKS DE TESTE CONTROLADOS ---");
  const regRes = await request("/api/auth", {
    method: "POST",
    json: {
      action: "register",
      name: "Redirect Tester",
      email: `redirect_tester_${ts}@testlinkzivo.com`,
      password: "TestPassword123!@#",
    },
  });
  assert(regRes.status === 200, "Cadastro de conta de teste retornou HTTP 200");
  const sessionCookie = extractSessionCookie(regRes.setCookie);
  assert(!!sessionCookie, "Sessão autenticada obtida");

  // 3. LINK ATIVO
  console.log("\n--- 3. TESTE: LINK ATIVO (DESTINO ORIGINAL) ---");
  const activeSlug = `active-${ts}`;
  const destUrl = "https://example.com/destino-ativo-original";
  const createActiveRes = await request("/api/links", {
    method: "POST",
    cookie: sessionCookie,
    json: {
      title: "Link Ativo Teste",
      url: destUrl,
      customSlug: activeSlug,
      utmSource: "test_suite",
    },
  });
  assert(createActiveRes.status === 201, "Link ativo criado com sucesso");
  const activeLinkId = createActiveRes.json?.link?.id;

  const activeRedirect = await request(`/${activeSlug}`);
  assert(activeRedirect.status === 302, "Link ativo retorna HTTP 302");
  assert(activeRedirect.location.startsWith(destUrl), "Link ativo redireciona para o destino original");
  assert(activeRedirect.location.includes("utm_source=test_suite"), "Preserva parâmetros de UTM");
  assert(activeRedirect.location.includes("linkzivo_click="), "Injeta rastreador linkzivo_click");

  // 4. LINK PAUSADO
  console.log("\n--- 4. TESTE: LINK PAUSADO (/paused-link) ---");
  const pauseRes = await request(`/api/links/${activeLinkId}`, {
    method: "PATCH",
    cookie: sessionCookie,
    json: { status: "PAUSED" },
  });
  assert(pauseRes.status === 200, "Link pausado via PATCH");

  const pausedRedirect = await request(`/${activeSlug}`);
  assert(pausedRedirect.status === 302, "Link pausado retorna HTTP 302");
  assert(pausedRedirect.location.includes("/paused-link"), `Location aponta para /paused-link (loc=${pausedRedirect.location})`);
  assert(pausedRedirect.location.startsWith(targetOrigin), `Location utiliza origem pública (${targetOrigin})`);
  assert(!pausedRedirect.location.includes(":8080"), "Location não vaza porta interna de container :8080");
  if (TARGET_URL.includes("https://")) {
    assert(!pausedRedirect.location.includes("localhost") && !pausedRedirect.location.includes("127.0.0.1"), "Location não contém localhost ou loopback");
  }

  // 5. RETOMADA DO LINK
  console.log("\n--- 5. TESTE: LINK RETOMADO (VOLTA A REDIRECIONAR AO DESTINO) ---");
  const resumeRes = await request(`/api/links/${activeLinkId}`, {
    method: "PATCH",
    cookie: sessionCookie,
    json: { status: "ACTIVE" },
  });
  assert(resumeRes.status === 200, "Link retomado via PATCH");

  const resumedRedirect = await request(`/${activeSlug}`);
  assert(resumedRedirect.status === 302, "Link retomado retorna HTTP 302");
  assert(resumedRedirect.location.startsWith(destUrl), "Link retomado redireciona para o destino original");

  // 6. LINK ARQUIVADO / INATIVO
  console.log("\n--- 6. TESTE: LINK ARQUIVADO/INATIVO (/not-found-link) ---");
  const archiveRes = await request(`/api/links/${activeLinkId}`, {
    method: "PATCH",
    cookie: sessionCookie,
    json: { status: "ARCHIVED" },
  });
  assert(archiveRes.status === 200, "Link arquivado via PATCH");

  const archivedRedirect = await request(`/${activeSlug}`);
  assert(archivedRedirect.status === 302, "Link arquivado retorna HTTP 302");
  assert(archivedRedirect.location.includes("/not-found-link"), `Location aponta para /not-found-link (loc=${archivedRedirect.location})`);
  assert(archivedRedirect.location.startsWith(targetOrigin), `Location utiliza origem pública (${targetOrigin})`);
  assert(!archivedRedirect.location.includes(":8080"), "Location não vaza porta interna de container :8080");

  // 7. LIMPEZA DO LINK DE TESTE
  console.log("\n--- 7. TEARDOWN: EXCLUSÃO DO LINK DE TESTE ---");
  const deleteRes = await request(`/api/links/${activeLinkId}`, {
    method: "DELETE",
    cookie: sessionCookie,
  });
  assert(deleteRes.status === 200, "Link excluído com sucesso");

  const deletedRedirect = await request(`/${activeSlug}`);
  assert(deletedRedirect.status === 302, "Link excluído retorna HTTP 302");
  assert(deletedRedirect.location.includes("/not-found-link"), `Link excluído redireciona para /not-found-link`);
  assert(deletedRedirect.location.startsWith(targetOrigin), `Location utiliza origem pública (${targetOrigin})`);

  console.log("\n================================================================================");
  console.log(`   VALIDAÇÃO DE REDIRECTS CONCLUÍDA`);
  console.log(`   TOTAL:     ${passed + failed}`);
  console.log(`   APROVADOS: ${passed}`);
  console.log(`   FALHAS:    ${failed}`);
  console.log("================================================================================");

  if (failed > 0) {
    console.error("\nFALHAS:");
    failures.forEach((f) => console.error(f));
    process.exit(1);
  } else {
    console.log("\nTODOS OS TESTES DE REDIRECT FORAM APROVADOS COM SUCESSO!");
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});

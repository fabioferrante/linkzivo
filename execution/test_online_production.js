/**
 * LINKZIVO — HOMOLOGAÇÃO ONLINE EM PRODUÇÃO (ETAPA 1)
 * Testa a instância publicada em: https://linkzivo-production.up.railway.app
 * 
 * Verificações:
 * 1. Health & Status das páginas públicas (Site / e Dashboard /dashboard)
 * 2. Cadastro de conta nova com e-mail identificável de teste
 * 3. Login, emissão de cookie de sessão HttpOnly e consulta /api/auth
 * 4. Logout e invalidação de sessão
 * 5. Re-login para operações de Smart Link
 * 6. Rejeição de URLs inválidas (vazias, sem protocolo, javascript, credenciais embutidas, SSRF)
 * 7. Criação de Smart Link válido e verificação no banco via API
 * 8. Redirecionamento público HTTP 302 com preservação de UTMs e injeção de parâmetros
 * 9. Edição de URL de destino e metadados
 * 10. Pausa do link e redirecionamento para /paused-link
 * 11. Retomada do link e redirecionamento para destino
 * 12. Cadastro de uma segunda conta (Usuário B) e teste de isolamento multitenant (anti-IDOR)
 * 13. Exclusão do link e verificação de 404 / redirecionamento para /not-found-link
 */

const PROD_URL = process.env.PROD_URL || "https://linkzivo-production.up.railway.app";

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
  const url = path.startsWith("http") ? path : `${PROD_URL}${path}`;
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
  } catch (e) {
    // text body
  }

  const setCookie = res.headers.get("set-cookie") || "";

  return {
    status: res.status,
    headers: res.headers,
    setCookie,
    text,
    json,
  };
}

function extractSessionCookie(setCookieHeader) {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(/linkzivo_session=([^;]+)/);
  return match ? `linkzivo_session=${match[1]}` : null;
}

async function main() {
  const ts = Date.now();
  const userA = {
    name: "Homolog Etapa1 User A",
    email: `homolog.etapa1.userA.${ts}@teste-linkzivo.com`,
    password: "Password123!@#",
  };
  const userB = {
    name: "Homolog Etapa1 User B",
    email: `homolog.etapa1.userB.${ts}@teste-linkzivo.com`,
    password: "Password123!@#",
  };

  console.log("================================================================================");
  console.log(`   LINKZIVO — HOMOLOGAÇÃO ONLINE EM PRODUÇÃO`);
  console.log(`   Destino: ${PROD_URL}`);
  console.log(`   Timestamp: ${new Date().toISOString()}`);
  console.log("================================================================================\n");

  // 1. SITE E DASHBOARD
  console.log("--- 1. VERIFICAÇÃO DE ROTAS PÚBLICAS E INTERFACES ---");
  const homeRes = await request("/");
  assert(homeRes.status === 200, "Landing page (/) retorna HTTP 200");
  assert(homeRes.text.includes("Linkzivo"), "Landing page contém marca Linkzivo");

  const dashRes = await request("/dashboard");
  assert(dashRes.status === 200 || dashRes.status === 307 || dashRes.status === 302, "Rota /dashboard responde HTTP válido");

  // 2. CADASTRO DE CONTA NOVA (USUÁRIO A)
  console.log("\n--- 2. CADASTRO DE CONTA NOVA (USUÁRIO A) ---");
  const regRes = await request("/api/auth", {
    method: "POST",
    json: {
      action: "register",
      name: userA.name,
      email: userA.email,
      password: userA.password,
    },
  });
  assert(regRes.status === 200, "Cadastro de conta nova retorna HTTP 200", `status=${regRes.status}`);
  assert(regRes.json?.success === true, "Cadastro retorna success=true");
  assert(!!regRes.json?.user?.id, "Usuário cadastrado possui ID gerado");
  assert(!!(regRes.json?.user?.workspaceId || regRes.json?.user?.workspaces?.[0]?.workspaceId), "Workspace provisionado para a conta nova");
  let sessionA = extractSessionCookie(regRes.setCookie);
  assert(!!sessionA, "Cookie linkzivo_session emitido no cadastro");
  assert(regRes.setCookie.toLowerCase().includes("httponly"), "Cookie possui flag HttpOnly");

  // 3. CONSULTA DE SESSÃO (/api/auth)
  console.log("\n--- 3. PERSISTÊNCIA E VALIDAÇÃO DE SESSÃO ---");
  const authRes = await request("/api/auth", { cookie: sessionA });
  assert(authRes.status === 200, "GET /api/auth com cookie retorna HTTP 200");
  assert(authRes.json?.authenticated === true, "Sessão está autenticada");
  assert(authRes.json?.user?.email === userA.email.toLowerCase(), "Sessão identifica o e-mail cadastrado");

  // 4. LOGOUT
  console.log("\n--- 4. LOGOUT E INVALIDAÇÃO ---");
  const logoutRes = await request("/api/auth", {
    method: "POST",
    cookie: sessionA,
    json: { action: "logout" },
  });
  assert(logoutRes.status === 200, "Logout retorna HTTP 200");
  assert(logoutRes.setCookie.includes("Max-Age=0") || logoutRes.setCookie.includes("1970"), "Cookie expirado emitido no logout");

  // 5. LOGIN
  console.log("\n--- 5. LOGIN E RE-AUTENTICAÇÃO ---");
  const loginRes = await request("/api/auth", {
    method: "POST",
    json: {
      action: "login",
      email: userA.email,
      password: userA.password,
    },
  });
  assert(loginRes.status === 200, "Login do Usuário A retorna HTTP 200");
  sessionA = extractSessionCookie(loginRes.setCookie);
  assert(!!sessionA, "Novo cookie de sessão emitido no login");

  // 6. VALIDAÇÃO E REJEIÇÃO DE URLs INVÁLIDAS
  console.log("\n--- 6. REJEIÇÃO DE URLs INVÁLIDAS (ROBUSTEZ SECURITY) ---");
  const invalidUrls = [
    { url: "", label: "URL vazia" },
    { url: "site-sem-ponto", label: "Hostname sem extensão/ponto" },
    { url: "javascript:alert(1)", label: "Protocolo javascript:" },
    { url: "ftp://files.example.com", label: "Protocolo ftp://" },
    { url: "http://127.0.0.1/admin", label: "IP de loopback (SSRF)" },
    { url: "http://169.254.169.254/latest", label: "Cloud metadata AWS/GCP (SSRF)" },
    { url: "http://[::1]/internal", label: "IPv6 loopback (SSRF)" },
    { url: "https://user:pass@legit-domain.com", label: "Credenciais embutidas user:pass@" },
    { url: "https://example.com.", label: "Hostname terminado em ponto" },
  ];

  for (const item of invalidUrls) {
    const badRes = await request("/api/links", {
      method: "POST",
      cookie: sessionA,
      json: {
        title: `Teste Inválido ${item.label}`,
        url: item.url,
        customSlug: `bad-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      },
    });
    assert(badRes.status === 400, `Rejeição de ${item.label} com HTTP 400`, `status=${badRes.status}`);
  }

  // 7. CRIAÇÃO DE SMART LINK VÁLIDO
  console.log("\n--- 7. CRIAÇÃO DE SMART LINK ---");
  const testSlug = `homolog-${ts}`;
  const targetUrl = "https://example.com/promocao-online";
  const createLinkRes = await request("/api/links", {
    method: "POST",
    cookie: sessionA,
    json: {
      title: "Link de Homologação Produção",
      url: targetUrl,
      customSlug: testSlug,
      utmSource: "google_ads",
      utmMedium: "cpc",
      utmCampaign: "homologacao_etapa1",
    },
  });
  assert(createLinkRes.status === 201, "Criação de Smart Link retorna HTTP 201", `status=${createLinkRes.status}`);
  const createdLink = createLinkRes.json?.link;
  assert(!!createdLink?.id, "Link criado possui ID no banco");
  assert(createdLink?.slug === testSlug, "Slug persistido exatamente como solicitado");
  assert(createdLink?.status === "ACTIVE", "Status inicial do link é ACTIVE");
  const linkId = createdLink?.id;

  // 8. REDIRECIONAMENTO E ATRIBUIÇÃO
  console.log("\n--- 8. REDIRECIONAMENTO PÚBLICO E ATRIBUIÇÃO ---");
  const redirRes = await request(`/${testSlug}`);
  assert(redirRes.status === 302, "Acesso ao slug ativo redireciona com HTTP 302", `status=${redirRes.status}`);
  const location = redirRes.headers.get("location") || "";
  assert(location.startsWith("https://example.com/promocao-online"), "Location aponta para URL de destino configurada");
  assert(location.includes("utm_source=google_ads"), "Preserva parâmetro utm_source");
  assert(location.includes("utm_medium=cpc"), "Preserva parâmetro utm_medium");
  assert(location.includes("utm_campaign=homologacao_etapa1"), "Preserva parâmetro utm_campaign");
  assert(location.includes("linkzivo_click="), "Injeta rastreador linkzivo_click");

  // 9. EDIÇÃO DO LINK
  console.log("\n--- 9. EDIÇÃO DO SMART LINK ---");
  const updatedUrl = "https://example.com/promocao-atualizada";
  const editRes = await request(`/api/links/${linkId}`, {
    method: "PATCH",
    cookie: sessionA,
    json: {
      title: "Link Atualizado na Homologação",
      destinationUrl: updatedUrl,
    },
  });
  assert(editRes.status === 200, "Edição do Smart Link retorna HTTP 200");
  assert(
    editRes.json?.link?.destinationUrl === updatedUrl || editRes.json?.link?.originalUrl === updatedUrl,
    "URL de destino atualizada"
  );

  // 10. PAUSA E RETOMADA
  console.log("\n--- 10. PAUSA E RETOMADA DO SMART LINK ---");
  const pauseRes = await request(`/api/links/${linkId}`, {
    method: "PATCH",
    cookie: sessionA,
    json: { status: "PAUSED" },
  });
  assert(pauseRes.status === 200, "Pausa do link via PATCH retorna HTTP 200");
  assert(pauseRes.json?.link?.status === "PAUSED", "Status alterado para PAUSED");

  const redirPausedRes = await request(`/${testSlug}`);
  assert(redirPausedRes.status === 302, "Acesso a link pausado retorna HTTP 302");
  assert((redirPausedRes.headers.get("location") || "").includes("/paused-link"), "Redireciona para /paused-link");

  const resumeRes = await request(`/api/links/${linkId}`, {
    method: "PATCH",
    cookie: sessionA,
    json: { status: "ACTIVE" },
  });
  assert(resumeRes.status === 200, "Retomada do link via PATCH retorna HTTP 200");
  assert(resumeRes.json?.link?.status === "ACTIVE", "Status restaurado para ACTIVE");

  const redirActiveRes = await request(`/${testSlug}`);
  assert(redirActiveRes.status === 302, "Acesso a link retomado retorna HTTP 302");
  assert((redirActiveRes.headers.get("location") || "").startsWith("https://example.com/promocao-atualizada"), "Redireciona para o destino atualizado");

  // 11. ISOLAMENTO MULTI-TENANT (ANTI-IDOR)
  console.log("\n--- 11. ISOLAMENTO MULTI-TENANT ENTRE DUAS CONTAS ---");
  const regUserBRes = await request("/api/auth", {
    method: "POST",
    json: {
      action: "register",
      name: userB.name,
      email: userB.email,
      password: userB.password,
    },
  });
  assert(regUserBRes.status === 200, "Cadastro do Usuário B retorna HTTP 200");
  const sessionB = extractSessionCookie(regUserBRes.setCookie);
  assert(!!sessionB, "Sessão do Usuário B criada");

  // Usuário B tenta acessar o link do Usuário A
  const getOtherRes = await request(`/api/links/${linkId}`, { cookie: sessionB });
  assert(getOtherRes.status === 403, "Usuário B tentando ler link do Usuário A recebe HTTP 403 (Forbidden)");

  const editOtherRes = await request(`/api/links/${linkId}`, {
    method: "PATCH",
    cookie: sessionB,
    json: { title: "Invasão Tentada" },
  });
  assert(editOtherRes.status === 403, "Usuário B tentando editar link do Usuário A recebe HTTP 403");

  const deleteOtherRes = await request(`/api/links/${linkId}`, {
    method: "DELETE",
    cookie: sessionB,
  });
  assert(deleteOtherRes.status === 403, "Usuário B tentando excluir link do Usuário A recebe HTTP 403");

  // 12. EXCLUSÃO DO LINK PELO PROPRIETÁRIO
  console.log("\n--- 12. EXCLUSÃO AUTORIZADA DO SMART LINK ---");
  const deleteRes = await request(`/api/links/${linkId}`, {
    method: "DELETE",
    cookie: sessionA,
  });
  assert(deleteRes.status === 200, "Exclusão autorizada do link retorna HTTP 200");

  const getDeletedRes = await request(`/api/links/${linkId}`, { cookie: sessionA });
  assert(getDeletedRes.status === 404, "Consulta ao link deletado retorna HTTP 404");

  const redirDeletedRes = await request(`/${testSlug}`);
  assert(redirDeletedRes.status === 302, "Acesso ao slug deletado retorna HTTP 302");
  assert((redirDeletedRes.headers.get("location") || "").includes("/not-found-link"), "Redireciona para /not-found-link");

  console.log("\n================================================================================");
  console.log(`   HOMOLOGAÇÃO ONLINE EM PRODUÇÃO FINALIZADA`);
  console.log(`   TOTAL DE ASSERÇÕES: ${passed + failed}`);
  console.log(`   APROVADAS:          ${passed}`);
  console.log(`   FALHAS:             ${failed}`);
  console.log("================================================================================");

  if (failed > 0) {
    console.error("\nFALHAS REGISTRADAS:");
    failures.forEach((f) => console.error(f));
    process.exit(1);
  } else {
    console.log("\nTODOS OS FLUXOS ONLINE FORAM HOMOLOGADOS COM SUCESSO EM PRODUÇÃO!");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Erro fatal na execução da homologação online:", err);
  process.exit(1);
});

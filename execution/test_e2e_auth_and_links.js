/**
 * LINKZIVO — SUÍTE DE VALIDAÇÃO FUNCIONAL E2E (ETAPA 1)
 * Testa integralmente as Fases B (Autenticação) e C (Smart Links)
 * no ambiente de teste isolado (http://localhost:3005 -> linkzivo_test_isolated).
 */

const http = require("http");

const BASE_URL = process.env.TEST_APP_URL || "http://localhost:3005";
let passed = 0;
let failed = 0;
const failures = [];

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.pathname + parsed.search,
      method: options.method || "GET",
      headers: options.headers || {},
    };

    const req = http.request(reqOptions, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body,
        });
      });
    });

    req.on("error", reject);

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

function extractCookie(headers, cookieName = "linkzivo_session") {
  const raw = headers["set-cookie"];
  if (!raw) return "";
  const list = Array.isArray(raw) ? raw : [raw];
  for (const c of list) {
    if (c.startsWith(`${cookieName}=`)) {
      return c.split(";")[0];
    }
  }
  return "";
}

function getCookieFullString(headers, cookieName = "linkzivo_session") {
  const raw = headers["set-cookie"];
  if (!raw) return "";
  const list = Array.isArray(raw) ? raw : [raw];
  for (const c of list) {
    if (c.startsWith(`${cookieName}=`)) {
      return c;
    }
  }
  return "";
}

function assert(condition, message, details = "") {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message} ${details ? `(${details})` : ""}`);
    failed++;
    failures.push({ message, details });
  }
}

async function runTestSuite() {
  console.log("================================================================================");
  console.log("   LINKZIVO — VALIDAÇÃO FUNCIONAL E2E (FASE B & C)");
  console.log(`   Ambiente Alvo: ${BASE_URL}`);
  console.log("================================================================================\n");

  const timestamp = Date.now();
  const userAEmail = `e2e_usera_${timestamp}@test.linkzivo.internal`;
  const userAPassword = `SenhaForte_A_${timestamp}`;
  const userAName = "Usuário Teste A";

  const userBEmail = `e2e_userb_${timestamp}@test.linkzivo.internal`;
  const userBPassword = `SenhaForte_B_${timestamp}`;
  const userBName = "Usuário Teste B";

  let cookieA = "";
  let cookieB = "";
  let workspaceIdA = "";
  let workspaceIdB = "";
  let userAId = "";

  // ===========================================================================
  // FASE B — AUTENTICAÇÃO
  // ===========================================================================
  console.log("--------------------------------------------------------------------------------");
  console.log("FASE B.1 — CADASTRO DE USUÁRIO E TRATAMENTO DE ENTRADAS");
  console.log("--------------------------------------------------------------------------------");

  // 1. Cadastro com campos vazios
  const emptyReg = await request(`${BASE_URL}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "register", name: "", email: "", password: "" }),
  });
  assert(emptyReg.status === 400, "Cadastro com campos vazios retorna HTTP 400", `status=${emptyReg.status}`);

  // 2. Cadastro com senha curta (< 6 caracteres)
  const shortPassReg = await request(`${BASE_URL}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "register", name: "Short", email: `short_${timestamp}@test.com`, password: "123" }),
  });
  assert(shortPassReg.status === 400, "Cadastro com senha < 6 caracteres retorna HTTP 400", `status=${shortPassReg.status}`);

  // 3. Cadastro legítimo do Usuário A
  const regARes = await request(`${BASE_URL}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "register", name: userAName, email: userAEmail, password: userAPassword }),
  });
  assert(regARes.status === 200, "Cadastro válido do Usuário A retorna HTTP 200", `status=${regARes.status}`);
  const regAData = JSON.parse(regARes.body || "{}");
  assert(regAData.success === true, "Resposta do cadastro indica success: true");
  assert(Boolean(regAData.user?.id), "Usuário criado possui ID gerado");
  assert(Boolean(regAData.user?.workspaceId), "Workspace 1:1 criado e vinculado ao usuário");
  assert(regAData.user?.workspacePlan === "FREE", "Plano padrão do workspace é FREE");
  userAId = regAData.user?.id;
  workspaceIdA = regAData.user?.workspaceId;

  // 4. Verificação de cookie emitido no cadastro
  cookieA = extractCookie(regARes.headers);
  const cookieAFull = getCookieFullString(regARes.headers);
  assert(Boolean(cookieA), "Cookie linkzivo_session emitido no cadastro");
  assert(cookieAFull.toLowerCase().includes("httponly"), "Cookie possui flag HttpOnly");
  assert(cookieAFull.toLowerCase().includes("samesite=lax"), "Cookie possui flag SameSite=Lax");

  // 5. Tentativa de cadastro duplicado (exato)
  const dupReg1 = await request(`${BASE_URL}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "register", name: "Duplicado", email: userAEmail, password: userAPassword }),
  });
  assert(dupReg1.status === 400, "Tentativa de cadastro com mesmo e-mail retorna HTTP 400", `status=${dupReg1.status}`);

  // 6. Tentativa de cadastro duplicado com normalização de e-mail (maiúsculas e espaços)
  const dupReg2 = await request(`${BASE_URL}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "register",
      name: "Duplicado Case",
      email: `  ${userAEmail.toUpperCase()}  `,
      password: userAPassword,
    }),
  });
  assert(dupReg2.status === 400, "Tentativa com e-mail duplicado em maiúsculas/espaços retorna HTTP 400", `status=${dupReg2.status}`);

  // 7. Cadastro do Usuário B com e-mail com espaços e maiúsculas para testar normalização no banco
  const rawEmailB = `   ${userBEmail.toUpperCase()}   `;
  const regBRes = await request(`${BASE_URL}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "register", name: userBName, email: rawEmailB, password: userBPassword }),
  });
  assert(regBRes.status === 200, "Cadastro de Usuário B com e-mail com espaços e maiúsculas retorna HTTP 200");
  const regBData = JSON.parse(regBRes.body || "{}");
  assert(regBData.user?.email === userBEmail.toLowerCase(), "E-mail foi normalizado e persistido em minúsculas sem espaços");
  cookieB = extractCookie(regBRes.headers);
  workspaceIdB = regBData.user?.workspaceId;
  assert(workspaceIdA !== workspaceIdB, "Workspace A e Workspace B são estritamente isolados e distintos");

  console.log("\n--------------------------------------------------------------------------------");
  console.log("FASE B.2 — LOGIN, PERSISTÊNCIA DE SESSÃO E VERIFICAÇÃO");
  console.log("--------------------------------------------------------------------------------");

  // 1. Login com senha errada
  const wrongPassRes = await request(`${BASE_URL}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: userAEmail, password: "SenhaTotalmenteIncorreta" }),
  });
  assert(wrongPassRes.status === 401, "Login com senha incorreta retorna HTTP 401", `status=${wrongPassRes.status}`);

  // 2. Login com e-mail inexistente
  const nonExistentRes = await request(`${BASE_URL}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `inexistente_${timestamp}@test.com`, password: "QualquerSenha123" }),
  });
  assert(nonExistentRes.status === 401, "Login com e-mail inexistente retorna HTTP 401", `status=${nonExistentRes.status}`);

  // 3. Login com dados válidos e com e-mail em maiúsculas
  const loginARes = await request(`${BASE_URL}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: userAEmail.toUpperCase(), password: userAPassword }),
  });
  assert(loginARes.status === 200, "Login do Usuário A com e-mail em maiúsculas retorna HTTP 200");
  const freshCookieA = extractCookie(loginARes.headers);
  assert(Boolean(freshCookieA), "Novo cookie de sessão emitido no login");
  cookieA = freshCookieA;

  // 4. Verificação de sessão autenticada GET /api/auth
  const sessionCheckRes = await request(`${BASE_URL}/api/auth`, {
    headers: { Cookie: cookieA },
  });
  assert(sessionCheckRes.status === 200, "GET /api/auth com cookie válido retorna HTTP 200");
  const sessionCheckData = JSON.parse(sessionCheckRes.body || "{}");
  assert(sessionCheckData.authenticated === true, "Retorna authenticated: true");
  assert(sessionCheckData.user?.id === userAId, "Sessão identifica exatamente o Usuário A");
  assert(sessionCheckData.user?.workspaceId === workspaceIdA, "Sessão identifica o workspace exclusivo do Usuário A");

  console.log("\n--------------------------------------------------------------------------------");
  console.log("FASE B.3 — LOGOUT, EXPIRAÇÃO E INVALIDAÇÃO DE SESSÃO");
  console.log("--------------------------------------------------------------------------------");

  // 1. Executa Logout do Usuário A
  const logoutRes = await request(`${BASE_URL}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ action: "logout" }),
  });
  assert(logoutRes.status === 200, "Logout via POST /api/auth retorna HTTP 200");
  const logoutCookieFull = getCookieFullString(logoutRes.headers);
  assert(
    logoutCookieFull.includes("Max-Age=0") || logoutCookieFull.includes("expires=Thu, 01 Jan 1970"),
    "Cookie de expiração imediata emitido (Max-Age=0 / expires=1970)"
  );

  // 2. Tentativa de reuso da sessão antiga revogada no banco
  const revokedSessionCheck = await request(`${BASE_URL}/api/auth`, {
    headers: { Cookie: cookieA },
  });
  assert(revokedSessionCheck.status === 200, "GET /api/auth com token revogado responde HTTP 200");
  const revokedData = JSON.parse(revokedSessionCheck.body || "{}");
  assert(revokedData.authenticated === false, "Sessão revogada server-side retorna authenticated: false");

  // 3. Tentativa de forjar token com assinatura adulterada
  const forgedToken = "linkzivo_session=fakeSessionId:fakeUserId:fakeWsId.assina_totalmente_invalida";
  const forgedRes = await request(`${BASE_URL}/api/auth`, {
    headers: { Cookie: forgedToken },
  });
  const forgedData = JSON.parse(forgedRes.body || "{}");
  assert(forgedData.authenticated === false, "Token forjado com HMAC inválido é sumariamente rejeitado");

  // 4. Reconecta o Usuário A para os testes de links
  const reLoginA = await request(`${BASE_URL}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: userAEmail, password: userAPassword }),
  });
  cookieA = extractCookie(reLoginA.headers);
  assert(Boolean(cookieA), "Re-login do Usuário A bem sucedido para Fase C");

  console.log("\n--------------------------------------------------------------------------------");
  console.log("FASE B.4 — GOOGLE OIDC ENDPOINTS");
  console.log("--------------------------------------------------------------------------------");

  // 1. Endpoint /api/auth/google
  const googleStartRes = await request(`${BASE_URL}/api/auth/google`);
  // Pode ser 503 (sem GOOGLE_CLIENT_ID configurado) ou 302 (com GOOGLE_CLIENT_ID configurado)
  assert([302, 503].includes(googleStartRes.status), `GET /api/auth/google responde status esperado 302 ou 503 (Obtido: ${googleStartRes.status})`);

  // 2. Endpoint /api/auth/google/callback sem parâmetros
  const callbackNoParams = await request(`${BASE_URL}/api/auth/google/callback`);
  assert(callbackNoParams.status === 302, "Callback sem parâmetros redireciona HTTP 302");
  const callbackNoParamsLoc = callbackNoParams.headers["location"] || "";
  assert(callbackNoParamsLoc.includes("auth_error=invalid_callback_params"), "Redireciona com auth_error=invalid_callback_params");

  // 3. Callback com erro retornado pelo Google
  const callbackGoogleErr = await request(`${BASE_URL}/api/auth/google/callback?error=access_denied`);
  assert(callbackGoogleErr.status === 302, "Callback com erro do Google redireciona HTTP 302");
  const callbackGoogleErrLoc = callbackGoogleErr.headers["location"] || "";
  assert(callbackGoogleErrLoc.includes("auth_error=google_access_denied"), "Redireciona com auth_error=google_access_denied");

  // ===========================================================================
  // FASE C — GERENCIAMENTO DE SMART LINKS
  // ===========================================================================
  console.log("\n--------------------------------------------------------------------------------");
  console.log("FASE C.1 — VALIDAÇÃO DE ENTRADAS NA CRIAÇÃO DE LINKS");
  console.log("--------------------------------------------------------------------------------");

  // 1. Criar link com URL vazia
  const emptyUrlRes = await request(`${BASE_URL}/api/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ url: "" }),
  });
  assert(emptyUrlRes.status === 400, "Criação de link com URL vazia retorna HTTP 400", `status=${emptyUrlRes.status}`);

  // 2. Criar link com URL inválida (sem protocolo)
  const invalidUrlRes = await request(`${BASE_URL}/api/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ url: "not-a-valid-url" }),
  });
  assert(invalidUrlRes.status === 400, "Criação de link com URL sem protocolo retorna HTTP 400", `status=${invalidUrlRes.status}`);

  // 3. Criar link com esquema inseguro javascript:...
  const jsUrlRes = await request(`${BASE_URL}/api/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ url: "javascript:alert(1)" }),
  });
  assert(jsUrlRes.status === 400, "Criação de link com javascript: retorna HTTP 400", `status=${jsUrlRes.status}`);

  // 4. Criar link com slug reservado (ex: api, dashboard)
  const reservedSlugRes = await request(`${BASE_URL}/api/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ url: "https://example.com/dest", customSlug: "dashboard" }),
  });
  assert(reservedSlugRes.status === 400, "Criação com slug reservado 'dashboard' retorna HTTP 400", `status=${reservedSlugRes.status}`);

  console.log("\n--------------------------------------------------------------------------------");
  console.log("FASE C.2 — CRIAÇÃO E LEITURA DE SMART LINK (USUÁRIO A)");
  console.log("--------------------------------------------------------------------------------");

  const originalTargetUrl = "https://example.com/produto-original";
  const customSlugCandidate = `promo-${timestamp}`;

  // 1. Criar link legítimo
  const createLinkRes = await request(`${BASE_URL}/api/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({
      url: originalTargetUrl,
      title: "Meu Primeiro Smart Link E2E",
      customSlug: customSlugCandidate,
      utmSource: "instagram",
      utmMedium: "stories",
      utmCampaign: "blackfriday",
    }),
  });
  assert(createLinkRes.status === 201, "Criação do Smart Link retorna HTTP 201", `status=${createLinkRes.status}`);
  const createLinkData = JSON.parse(createLinkRes.body || "{}");
  const linkId = createLinkData.link?.id;
  const linkSlug = createLinkData.link?.slug;
  assert(Boolean(linkId), "Link criado possui ID no banco");
  assert(linkSlug === customSlugCandidate, `Slug customizado persistido corretamente (${linkSlug})`);
  assert(createLinkData.link?.workspaceId === workspaceIdA, "Link pertence exclusivamente ao Workspace A");
  assert(createLinkData.link?.status === "ACTIVE", "Status inicial do link é ACTIVE");
  assert(Boolean(createLinkData.qrDataUrl?.startsWith("data:image/png;base64,")), "QR Code base64 gerado com sucesso");

  // 2. Tentativa de cadastrar outro link com o mesmo slug (conflito de unicidade)
  const dupSlugRes = await request(`${BASE_URL}/api/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({
      url: "https://example.com/outro",
      customSlug: customSlugCandidate,
    }),
  });
  assert(dupSlugRes.status === 409, "Tentativa de criar link com slug repetido retorna HTTP 409 (Conflict)", `status=${dupSlugRes.status}`);

  // 3. Consultar o link criado via GET /api/links/[id] com Usuário A
  const getLinkRes = await request(`${BASE_URL}/api/links/${linkId}`, {
    headers: { Cookie: cookieA },
  });
  assert(getLinkRes.status === 200, "Usuário A consulta seu link via GET /api/links/[id] com HTTP 200");
  const getLinkData = JSON.parse(getLinkRes.body || "{}");
  assert(getLinkData.link?.id === linkId, "Dados retornados correspondem ao link criado");
  assert(getLinkData.link?.destinationUrl === originalTargetUrl, "URL de destino confere com o configurado");

  // 4. Listar links do Usuário A via GET /api/links
  const listLinksARes = await request(`${BASE_URL}/api/links`, {
    headers: { Cookie: cookieA },
  });
  assert(listLinksARes.status === 200, "Usuário A lista seus links via GET /api/links com HTTP 200");
  const listLinksAData = JSON.parse(listLinksARes.body || "{}");
  const foundInList = listLinksAData.links?.some((l) => l.id === linkId);
  assert(foundInList === true, "Link criado está presente na listagem do Workspace A");

  console.log("\n--------------------------------------------------------------------------------");
  console.log("FASE C.3 — REDIRECIONAMENTO E ATRIBUIÇÃO PÚBLICA DE LINK ATIVO");
  console.log("--------------------------------------------------------------------------------");

  const redirActiveRes = await request(`${BASE_URL}/${linkSlug}`, {
    headers: { "User-Agent": "Mozilla/5.0 E2E-Tester" },
  });
  assert(redirActiveRes.status === 302, "Acesso ao slug ativo retorna HTTP 302", `status=${redirActiveRes.status}`);
  const activeLocation = redirActiveRes.headers["location"] || "";
  assert(activeLocation.startsWith(originalTargetUrl), "Location aponta para URL de destino configurada");
  assert(activeLocation.includes("utm_source=instagram"), "Preserva parâmetro utm_source");
  assert(activeLocation.includes("utm_medium=stories"), "Preserva parâmetro utm_medium");
  assert(activeLocation.includes("utm_campaign=blackfriday"), "Preserva parâmetro utm_campaign");
  assert(activeLocation.includes("sck=") && activeLocation.includes("linkzivo_click="), "Injeta parâmetros de rastreamento sck e linkzivo_click");

  console.log("\n--------------------------------------------------------------------------------");
  console.log("FASE C.4 — EDIÇÃO DE URL DE DESTINO E INFORMAÇÕES");
  console.log("--------------------------------------------------------------------------------");

  const newTargetUrl = "https://example.com/produto-atualizado-v2";
  const newTitle = "Smart Link E2E - Título Atualizado";

  const editRes = await request(`${BASE_URL}/api/links/${linkId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({
      destinationUrl: newTargetUrl,
      title: newTitle,
    }),
  });
  assert(editRes.status === 200, "Edição de URL de destino e título retorna HTTP 200", `status=${editRes.status}`);
  const editData = JSON.parse(editRes.body || "{}");
  assert(editData.link?.destinationUrl === newTargetUrl, "URL de destino foi atualizada no retorno");
  assert(editData.link?.title === newTitle, "Título foi atualizado no retorno");

  // Conferir persistência da edição no GET
  const verifyEditRes = await request(`${BASE_URL}/api/links/${linkId}`, {
    headers: { Cookie: cookieA },
  });
  const verifyEditData = JSON.parse(verifyEditRes.body || "{}");
  assert(verifyEditData.link?.destinationUrl === newTargetUrl, "Nova URL de destino persistida no banco");
  assert(verifyEditData.link?.history?.length >= 1, "Histórico de alteração de URL gravado em LinkHistory");
  assert(verifyEditData.link?.history[0]?.previousUrl === originalTargetUrl, "Histórico registra previousUrl original");
  assert(verifyEditData.link?.history[0]?.newUrl === newTargetUrl, "Histórico registra newUrl atualizada");

  console.log("\n--------------------------------------------------------------------------------");
  console.log("FASE C.5 — PAUSA E RETOMADA DO LINK");
  console.log("--------------------------------------------------------------------------------");

  // 1. Pausar o link
  const pauseRes = await request(`${BASE_URL}/api/links/${linkId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ status: "PAUSED" }),
  });
  assert(pauseRes.status === 200, "Pausar link via PATCH retorna HTTP 200");
  const pauseData = JSON.parse(pauseRes.body || "{}");
  assert(pauseData.link?.status === "PAUSED", "Status do link alterado para PAUSED");
  assert(pauseData.link?.pauseReason === "USER", "pauseReason registrado como USER");

  // 2. Acesso ao link pausado -> deve redirecionar para /paused-link
  const redirPausedRes = await request(`${BASE_URL}/${linkSlug}`);
  assert(redirPausedRes.status === 302, "Acesso ao link pausado retorna HTTP 302");
  const pausedLocation = redirPausedRes.headers["location"] || "";
  assert(pausedLocation.includes("/paused-link"), "Redirecionamento aponta para /paused-link");

  // 3. Retomar o link (reativação)
  const resumeRes = await request(`${BASE_URL}/api/links/${linkId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ status: "ACTIVE" }),
  });
  assert(resumeRes.status === 200, "Retomar link via PATCH retorna HTTP 200");
  const resumeData = JSON.parse(resumeRes.body || "{}");
  assert(resumeData.link?.status === "ACTIVE", "Status do link alterado para ACTIVE");
  assert(resumeData.link?.pauseReason === null, "pauseReason limpo (null)");

  // 4. Acesso ao link reativado -> deve redirecionar para newTargetUrl
  const redirResumedRes = await request(`${BASE_URL}/${linkSlug}`);
  assert(redirResumedRes.status === 302, "Acesso ao link retomado retorna HTTP 302");
  const resumedLocation = redirResumedRes.headers["location"] || "";
  assert(resumedLocation.startsWith(newTargetUrl), "Redirecionamento aponta para a nova URL de destino");

  console.log("\n--------------------------------------------------------------------------------");
  console.log("FASE C.6 — ISOLAMENTO MULTI-TENANT E PROTEÇÃO ANTI-IDOR");
  console.log("--------------------------------------------------------------------------------");

  // 1. Usuário B tenta ler o link do Usuário A
  const idorGet = await request(`${BASE_URL}/api/links/${linkId}`, {
    headers: { Cookie: cookieB },
  });
  assert(idorGet.status === 403, "Usuário B tentando ler link do Usuário A recebe HTTP 403 (Forbidden)", `status=${idorGet.status}`);

  // 2. Usuário B tenta editar o link do Usuário A
  const idorPatch = await request(`${BASE_URL}/api/links/${linkId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookieB },
    body: JSON.stringify({ title: "Invasão de Título" }),
  });
  assert(idorPatch.status === 403, "Usuário B tentando editar link do Usuário A recebe HTTP 403", `status=${idorPatch.status}`);

  // 3. Usuário B tenta excluir o link do Usuário A
  const idorDelete = await request(`${BASE_URL}/api/links/${linkId}`, {
    method: "DELETE",
    headers: { Cookie: cookieB },
  });
  assert(idorDelete.status === 403, "Usuário B tentando excluir link do Usuário A recebe HTTP 403", `status=${idorDelete.status}`);

  // 4. Usuário não autenticado tentando acessar endpoints de gerenciamento
  const unauthGet = await request(`${BASE_URL}/api/links/${linkId}`);
  assert(unauthGet.status === 401, "Acesso a GET /api/links/[id] sem autenticação recebe HTTP 401", `status=${unauthGet.status}`);

  const unauthPatch = await request(`${BASE_URL}/api/links/${linkId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Não autorizado" }),
  });
  assert(unauthPatch.status === 401, "Acesso a PATCH /api/links/[id] sem autenticação recebe HTTP 401", `status=${unauthPatch.status}`);

  const unauthDelete = await request(`${BASE_URL}/api/links/${linkId}`, {
    method: "DELETE",
  });
  assert(unauthDelete.status === 401, "Acesso a DELETE /api/links/[id] sem autenticação recebe HTTP 401", `status=${unauthDelete.status}`);

  console.log("\n--------------------------------------------------------------------------------");
  console.log("FASE C.7 — EXCLUSÃO DO LINK E ACESSO PÓS-EXCLUSÃO");
  console.log("--------------------------------------------------------------------------------");

  // 1. Usuário A exclui o link
  const deleteRes = await request(`${BASE_URL}/api/links/${linkId}`, {
    method: "DELETE",
    headers: { Cookie: cookieA },
  });
  assert(deleteRes.status === 200, "Exclusão autorizada do link retorna HTTP 200", `status=${deleteRes.status}`);

  // 2. Tentar consultar link excluído na API
  const getDeletedRes = await request(`${BASE_URL}/api/links/${linkId}`, {
    headers: { Cookie: cookieA },
  });
  assert(getDeletedRes.status === 404, "Consulta ao link excluído retorna HTTP 404", `status=${getDeletedRes.status}`);

  // 3. Tentar acessar slug excluído publicamente
  const redirDeletedRes = await request(`${BASE_URL}/${linkSlug}`);
  assert(redirDeletedRes.status === 302, "Acesso público ao slug de link excluído retorna HTTP 302");
  const deletedLocation = redirDeletedRes.headers["location"] || "";
  assert(deletedLocation.includes("/not-found-link"), "Redirecionamento aponta para /not-found-link");

  console.log("\n================================================================================");
  console.log("   RESULTADO FINAL DA SUÍTE DE TESTES E2E");
  console.log(`   TOTAL DE ASSERÇÕES APROVADAS: ${passed}`);
  console.log(`   TOTAL DE FALHAS:              ${failed}`);
  console.log("================================================================================\n");

  if (failed > 0) {
    console.error("FALHAS DETECTADAS:");
    failures.forEach((f, idx) => {
      console.error(`  ${idx + 1}. ${f.message} ${f.details ? `-> ${f.details}` : ""}`);
    });
    process.exit(1);
  } else {
    console.log("SUCESSO TOTAL! Todas as regras de autenticação e ciclo de vida dos Smart Links foram validadas.");
    process.exit(0);
  }
}

runTestSuite().catch((err) => {
  console.error("Erro fatal na execução da suíte:", err);
  process.exit(1);
});

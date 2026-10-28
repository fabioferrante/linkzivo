const https = require("https");

const BASE_URL = "https://linkzivo-production.up.railway.app";

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: options.method || "GET",
      headers: options.headers || {},
    };

    const req = https.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function extractCookie(headers) {
  const raw = headers["set-cookie"];
  if (!raw) return "";
  if (Array.isArray(raw)) {
    return raw.map((c) => c.split(";")[0]).join("; ");
  }
  return raw.split(";")[0];
}

async function runSmokeTests() {
  console.log("=================================================================");
  console.log("   LINKZIVO — BATERIA DE SMOKE TESTS EM PRODUÇÃO REAL (1:1)");
  console.log(`   URL Alvo: ${BASE_URL}`);
  console.log("=================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(cond, msg) {
    if (cond) {
      console.log(`[PASS] ${msg}`);
      passed++;
    } else {
      console.error(`[FAIL] ${msg}`);
      failed++;
    }
  }

  try {
    // 1. Serviço online e inicialização
    console.log("--- 1. VERIFICAÇÃO DE SAÚDE E DISPONIBILIDADE PÚBLICA ---");
    const homeRes = await request(`${BASE_URL}/`);
    assert(homeRes.status === 200, `Home pública respondendo HTTP 200 (Status: ${homeRes.status})`);
    assert(homeRes.body.includes("Linkzivo"), "Conteúdo HTML contém o título Linkzivo");

    // 2. Criação Anônima de Links (usuário público de sistema 1:1)
    console.log("\n--- 2. CRIAÇÃO ANÔNIMA DE LINKS (1:1 SYSTEM USER) ---");
    const anonRes = await request(`${BASE_URL}/api/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/anon-prod-target",
      }),
    });
    assert(anonRes.status === 201, `Criação anônima retornou HTTP 201 (Status: ${anonRes.status})`);
    const anonData = JSON.parse(anonRes.body || "{}");
    const anonSlug = anonData.link?.slug;
    assert(Boolean(anonSlug), `Link anônimo criado com slug: ${anonSlug}`);
    assert(Boolean(anonData.link?.workspaceId), `Link anônimo associado a workspace válido: ${anonData.link?.workspaceId}`);
    assert(anonData.link?.creatorId === null, "creatorId é nulo (anônimo legítimo sem órfão)");
    assert(Boolean(anonData.qrDataUrl?.startsWith("data:image/png;base64,")), "QR Code base64 gerado com sucesso para link anônimo");

    // 3. Redirecionamento 302 do Link Anônimo
    console.log("\n--- 3. REDIRECIONAMENTO E ATRIBUIÇÃO DE AFILIADOS ---");
    const redirRes = await request(`${BASE_URL}/${anonSlug}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    assert(redirRes.status === 302, `Redirecionamento do link retornou HTTP 302 (Status: ${redirRes.status})`);
    const loc = redirRes.headers["location"] || "";
    assert(loc.startsWith("https://example.com/anon-prod-target"), "Location aponta para URL de destino configurada");
    assert(loc.includes("sck=") && loc.includes("linkzivo_click="), "Parâmetros de rastreamento sck e linkzivo_click injetados");

    // 4. Registro e Sessão do Usuário A (Conta de Teste Controlada)
    console.log("\n--- 4. AUTENTICAÇÃO, REGISTRO E SESSÃO 1:1 (USUÁRIO A) ---");
    const userAEmail = `smoke_usera_${Date.now()}@linkzivoprod.test`;
    const userAPass = `PassA!_${Date.now()}`;
    const regARes = await request(`${BASE_URL}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "register",
        name: "Usuário Smoke Test A",
        email: userAEmail,
        password: userAPass,
      }),
    });
    assert(regARes.status === 200, `Registro do Usuário A retornou HTTP 200 (Status: ${regARes.status})`);
    const cookieA = extractCookie(regARes.headers);
    assert(Boolean(cookieA), "Cookie de sessão recebido para o Usuário A");

    const sessionARes = await request(`${BASE_URL}/api/auth`, {
      headers: { Cookie: cookieA },
    });
    assert(sessionARes.status === 200, `Checagem de sessão do Usuário A retornou HTTP 200`);
    const sessionAData = JSON.parse(sessionARes.body || "{}");
    assert(sessionAData.authenticated === true, "Usuário A está autenticado com sucesso");
    assert(sessionAData.user?.email === userAEmail, `E-mail da sessão coincide: ${sessionAData.user?.email}`);
    assert(Boolean(sessionAData.user?.workspaceId), `Workspace exclusivo 1:1 atribuído: ${sessionAData.user?.workspaceId}`);
    const wsAId = sessionAData.user?.workspaceId;

    // 5. Criação, Leitura, Edição e Exclusão pelo Usuário A
    console.log("\n--- 5. FLUXO AUTORIZADO DE CRUD DE LINKS (USUÁRIO A) ---");
    const linkSlugA = `link-a-${Date.now()}`;
    const createLinkARes = await request(`${BASE_URL}/api/links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieA,
      },
      body: JSON.stringify({
        title: "Link Oficial Usuário A",
        url: "https://example.com/target-a",
        customSlug: linkSlugA,
      }),
    });
    assert(createLinkARes.status === 201, `Criação do link do Usuário A retornou HTTP 201`);
    const linkAData = JSON.parse(createLinkARes.body || "{}");
    const linkAId = linkAData.link?.id || linkAData.id;
    assert(Boolean(linkAId), `Link do Usuário A criado com ID: ${linkAId}`);
    assert(linkAData.link?.workspaceId === wsAId, "Link pertence exclusivamente ao workspace 1:1 do Usuário A");

    // Edição pelo Usuário A
    const updateLinkARes = await request(`${BASE_URL}/api/links/${linkAId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieA,
      },
      body: JSON.stringify({
        title: "Link Oficial Usuário A (Atualizado)",
      }),
    });
    assert(updateLinkARes.status === 200, `Edição autorizada pelo Usuário A retornou HTTP 200`);

    // Leitura pelo Usuário A
    const getLinkARes = await request(`${BASE_URL}/api/links/${linkAId}`, {
      headers: { Cookie: cookieA },
    });
    assert(getLinkARes.status === 200, `Leitura autorizada pelo Usuário A retornou HTTP 200`);
    const readAData = JSON.parse(getLinkARes.body || "{}");
    assert(readAData.link?.title === "Link Oficial Usuário A (Atualizado)", "Título atualizado persistido no PostgreSQL");

    // 6. Registro de Usuário B e Validação de Isolamento Cross-Account
    console.log("\n--- 6. VALIDAÇÃO DE ISOLAMENTO ENTRE CONTAS (USUÁRIO B x LINK A) ---");
    const userBEmail = `smoke_userb_${Date.now()}@linkzivoprod.test`;
    const userBPass = `PassB!_${Date.now()}`;
    const regBRes = await request(`${BASE_URL}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "register",
        name: "Usuário Smoke Test B",
        email: userBEmail,
        password: userBPass,
      }),
    });
    assert(regBRes.status === 200, `Registro do Usuário B retornou HTTP 200`);
    const cookieB = extractCookie(regBRes.headers);
    assert(Boolean(cookieB), "Cookie de sessão recebido para o Usuário B");

    // Usuário B tenta ler o link do Usuário A (deve retornar 404/403)
    const crossReadRes = await request(`${BASE_URL}/api/links/${linkAId}`, {
      headers: { Cookie: cookieB },
    });
    assert(
      crossReadRes.status === 404 || crossReadRes.status === 403,
      `Usuário B NÃO consegue ler link do Usuário A (Status esperado 404/403: obtido ${crossReadRes.status})`
    );

    // Usuário B tenta editar o link do Usuário A
    const crossEditRes = await request(`${BASE_URL}/api/links/${linkAId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieB,
      },
      body: JSON.stringify({
        title: "Invasão Maliciosa Usuário B",
      }),
    });
    assert(
      crossEditRes.status === 404 || crossEditRes.status === 403,
      `Usuário B NÃO consegue editar link do Usuário A (Status esperado 404/403: obtido ${crossEditRes.status})`
    );

    // Usuário B tenta excluir o link do Usuário A
    const crossDeleteRes = await request(`${BASE_URL}/api/links/${linkAId}`, {
      method: "DELETE",
      headers: { Cookie: cookieB },
    });
    assert(
      crossDeleteRes.status === 404 || crossDeleteRes.status === 403,
      `Usuário B NÃO consegue excluir link do Usuário A (Status esperado 404/403: obtido ${crossDeleteRes.status})`
    );

    // 7. Teste de Deduplicação Atômica de QR Code sob Concorrência
    console.log("\n--- 7. DEDUPLICAÇÃO ATÔMICA DE QR CODE EM CONCORRÊNCIA ---");
    const parallelRequests = Array.from({ length: 5 }).map(() =>
      request(`${BASE_URL}/${linkSlugA}?src=qr`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Mobile/15E148",
          "X-Forwarded-For": "198.51.100.99",
        },
      })
    );
    const parallelResponses = await Promise.all(parallelRequests);
    const all302 = parallelResponses.every((r) => r.status === 302);
    assert(all302, "Todas as 5 requisições simultâneas de QR Code receberam HTTP 302");

    // Aguarda 1.5s para consistência no banco
    await new Promise((r) => setTimeout(r, 1500));

    const verifyCountersRes = await request(`${BASE_URL}/api/links/${linkAId}`, {
      headers: { Cookie: cookieA },
    });
    const finalCounters = JSON.parse(verifyCountersRes.body || "{}").link;
    console.log(`Contadores pós-concorrência QR: clickCount=${finalCounters?.clickCount}, qrScanCount=${finalCounters?.qrScanCount}`);
    assert(finalCounters?.qrScanCount === 1, `Deduplicação de QR confirmada: qrScanCount exatamente 1 (obtido: ${finalCounters?.qrScanCount})`);
    assert(finalCounters?.clickCount === 1, `Total de cliques deduplicado: clickCount exatamente 1 (obtido: ${finalCounters?.clickCount})`);

    // 8. Exclusão e Limpeza pelo Usuário A
    console.log("\n--- 8. EXCLUSÃO AUTORIZADA E TEARDOWN LIMPO ---");
    const deleteLinkARes = await request(`${BASE_URL}/api/links/${linkAId}`, {
      method: "DELETE",
      headers: { Cookie: cookieA },
    });
    assert(deleteLinkARes.status === 200, `Exclusão autorizada pelo Usuário A retornou HTTP 200`);

    // 9. Rota Google OIDC
    console.log("\n--- 9. ROTA DE AUTENTICAÇÃO GOOGLE OIDC ---");
    const oidcRes = await request(`${BASE_URL}/api/auth/google`);
    assert(
      oidcRes.status === 503 || oidcRes.status === 302,
      `Rota /api/auth/google ativa no servidor (Status: ${oidcRes.status} - ${oidcRes.body.substring(0, 80)})`
    );

  } catch (err) {
    console.error("ERRO CRÍTICO NA EXECUÇÃO DOS SMOKE TESTS:", err);
    failed++;
  }

  console.log("\n=================================================================");
  console.log("   RESULTADO FINAL DOS SMOKE TESTS DE PRODUÇÃO");
  console.log(`   TOTAL APROVADOS: ${passed}`);
  console.log(`   TOTAL FALHAS:    ${failed}`);
  console.log("=================================================================");

  if (failed > 0) process.exit(1);
}

runSmokeTests();

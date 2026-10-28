/**
 * VALIDAÇÃO CONTROLADA PÓS-DEPLOY EM PRODUÇÃO - LINKZIVO
 * Valida a integridade do redirecionamento e a deduplicação atômica de QR Code
 * em ambiente de produção (https://linkzivo-production.up.railway.app).
 * NÃO acessa links de clientes nem altera dados reais de usuários.
 */

const https = require("https");

const PROD_URL = "https://linkzivo-production.up.railway.app";

function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
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
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function validateProduction() {
  console.log("=== INICIANDO VALIDAÇÃO CONTROLADA PÓS-DEPLOY EM PRODUÇÃO ===");
  console.log(`Ambiente alvo: ${PROD_URL}`);

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 1. Teste de Saúde da Home Pública
    console.log("\n1. Verificando disponibilidade da aplicação pública...");
    const homeRes = await httpsRequest(`${PROD_URL}/`);
    assert(homeRes.status === 200, `Home pública retornou HTTP 200 (obtido: ${homeRes.status})`);

    // 2. Criação de Usuário e Workspace de Teste Controlado
    console.log("\n2. Criando conta de teste controlada para validação...");
    const testEmail = `prod_val_${Date.now()}@testlinkzivo.com`;
    const testPassword = `ValidaSec123!${Date.now()}`;

    const regRes = await httpsRequest(`${PROD_URL}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "register",
        email: testEmail,
        password: testPassword,
        name: "Tester Produção QR",
      }),
    });

    assert(regRes.status === 200, `Registro do usuário de teste retornou HTTP 200 (obtido: ${regRes.status})`);

    // Captura o cookie de sessão autenticada
    const rawCookies = regRes.headers["set-cookie"];
    const authCookie = Array.isArray(rawCookies)
      ? rawCookies.map((c) => c.split(";")[0]).join("; ")
      : rawCookies?.split(";")[0] || "";

    assert(Boolean(authCookie), "Cookie de autenticação recebido com sucesso");

    // 3. Criação de Smart Link de Teste Controlado
    console.log("\n3. Criando Smart Link de teste exclusivo...");
    const testSlug = `val-qr-${Date.now()}`;
    const targetUrl = "https://example.com/destino-validacao-linkzivo";

    const createLinkRes = await httpsRequest(`${PROD_URL}/api/links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
      },
      body: JSON.stringify({
        title: "Link Teste Produção QR",
        url: targetUrl,
        customSlug: testSlug,
      }),
    });

    assert(createLinkRes.status === 201, `Criação do link de teste retornou HTTP 201 (obtido: ${createLinkRes.status})`);
    const createdLinkData = JSON.parse(createLinkRes.body);
    const linkId = createdLinkData.link?.id || createdLinkData.id;
    assert(Boolean(linkId), `Smart Link criado com ID: ${linkId}`);

    // 4. Teste de Redirecionamento 302 com Parâmetros de Rastreio
    console.log("\n4. Testando redirecionamento 302 em produção...");
    const redirectRes = await httpsRequest(`${PROD_URL}/${testSlug}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });

    assert(redirectRes.status === 302, `Acesso direto ao slug retornou HTTP 302 (obtido: ${redirectRes.status})`);
    const locationHeader = redirectRes.headers["location"] || "";
    assert(locationHeader.startsWith(targetUrl), `Redirecionamento aponta para a URL de destino configurada`);
    assert(locationHeader.includes("sck=") && locationHeader.includes("linkzivo_click="), "Parâmetros de rastreamento de afiliados (sck/linkzivo_click) injetados com sucesso");

    // 5. Teste de Concorrência Real e Deduplicação Atômica de QR Code
    console.log("\n5. Disparando 5 requisições SIMULTÂNEAS de escaneamento de QR Code (?src=qr)...");
    const testUa = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
    const testIpHeader = "198.51.100.77";

    const parallelRequests = Array.from({ length: 5 }).map(() =>
      httpsRequest(`${PROD_URL}/${testSlug}?src=qr`, {
        headers: {
          "User-Agent": testUa,
          "X-Forwarded-For": testIpHeader,
        },
      })
    );

    const parallelResponses = await Promise.all(parallelRequests);

    const all302 = parallelResponses.every((r) => r.status === 302);
    assert(all302, "Todas as 5 requisições simultâneas de QR Code receberam HTTP 302 sem erro");

    // 6. Verificação dos Contadores Consolidados no Banco de Produção
    console.log("\n6. Verificando contadores consolidados na API autenticada...");
    // Aguarda 1.5 segundo para persistência transacional
    await new Promise((r) => setTimeout(r, 1500));

    const checkLinkRes = await httpsRequest(`${PROD_URL}/api/links/${linkId}`, {
      headers: { Cookie: authCookie },
    });

    assert(checkLinkRes.status === 200, "Consulta aos dados do link retornou HTTP 200");
    const checkBody = JSON.parse(checkLinkRes.body);
    const linkState = checkBody.link || checkBody;

    console.log(`Estado do link no banco de produção:`);
    console.log(`- clickCount: ${linkState.clickCount}`);
    console.log(`- qrScanCount: ${linkState.qrScanCount}`);

    // Como fizemos 1 clique direto no passo 4 e 5 acessos simultâneos de QR no passo 5:
    // O clique direto deve ser computado como 1.
    // As 5 requisições concorrentes de QR devem ser DEDUPLICADAS para exatamente 1 scan.
    // Total esperado: clickCount = 2 (1 direto + 1 QR), qrScanCount = 1.
    assert(
      linkState.qrScanCount === 1,
      `Deduplicação de QR Code confirmada: qrScanCount é exatamente 1 (obtido: ${linkState.qrScanCount})`
    );
    assert(
      linkState.clickCount === 2,
      `Total de cliques consistente: exatamente 2 (1 direto + 1 QR deduplicado) (obtido: ${linkState.clickCount})`
    );

    // 7. Limpeza do ambiente de teste controlado
    console.log("\n7. Excluindo dados do teste controlado...");
    const deleteLinkRes = await httpsRequest(`${PROD_URL}/api/links/${linkId}`, {
      method: "DELETE",
      headers: { Cookie: authCookie },
    });
    assert(deleteLinkRes.status === 200, "Link de teste controlado excluído com sucesso");

  } catch (err) {
    console.error("ERRO DURANTE A VALIDAÇÃO EM PRODUÇÃO:", err);
    failed++;
  }

  console.log("\n=== RESULTADO FINAL DA VALIDAÇÃO EM PRODUÇÃO ===");
  console.log(`Total aprovados: ${passed}`);
  console.log(`Total falhas: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

validateProduction();

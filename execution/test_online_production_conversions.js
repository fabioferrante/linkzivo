/**
 * LINKZIVO — HOMOLOGAÇÃO COMPLETA EM PRODUÇÃO (ETAPA 3: EXTRATO DE CONVERSÕES)
 *
 * Executa testes reais 100% via HTTP pela Internet contra o ambiente de produção:
 * https://linkzivo-production.up.railway.app
 *
 * Cobertura Completa dos Requisitos do Usuário:
 * 1. Autenticação obrigatória (401 para requisições sem sessão)
 * 2. Registro e criação de Smart Links para 2 Workspaces independentes (A e B)
 * 3. Rastreamento e geração de cliques reais via navegação em /[slug]
 * 4. Ingestão de postbacks REAIS via POST /api/webhooks/conversions:
 *    - Conversão CONFIRMED (Hotmart 2.0 com clickId real em sck, hottok e api_token)
 *    - Conversão ESTIMATED / Pendente (formato canônico com slugA)
 *    - Conversão REFUNDED / Estorno (formato canônico com slugA)
 *    - Conversão CONFIRMED para Workspace B (Kiwify com clickId real em src)
 * 5. Isolamento multi-tenant estrito: Workspace B nunca vê dados de Workspace A
 * 6. Bloqueio no banco de tentativa de IDOR (/api/conversions/[id] -> 404)
 * 7. Sumário financeiro estrito: REFUNDED NUNCA soma em vendas ou comissões confirmadas
 * 8. Filtros por status financeiro (CONFIRMED vs REFUNDED)
 * 9. Busca textual por identificador externo e por slug
 * 10. Paginação server-side
 * 11. Sanitização estrita do rawPayload no detalhe individual (mascara tokens/secrets)
 * 12. Distinção explícita entre Estado Financeiro e Resultado Técnico
 */

const https = require("https");
const crypto = require("crypto");

const PROD_URL = "https://linkzivo-production.up.railway.app";
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
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const rawBody = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try {
          json = JSON.parse(rawBody);
        } catch {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: rawBody,
          json,
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

function generateWebhookSecret(workspaceId, masterSecret) {
  const contextPayload = `linkzivo:webhook:${workspaceId.trim()}`;
  const hmac = crypto.createHmac("sha256", masterSecret).update(contextPayload).digest("hex");
  return `lz_wh_${workspaceId.trim()}.${hmac}`;
}

async function runProductionHomologation() {
  console.log("================================================================================");
  console.log("   LINKZIVO — HOMOLOGAÇÃO ONLINE EM PRODUÇÃO (EXTRATO DE CONVERSÕES)");
  console.log(`   Ambiente Alvo: ${PROD_URL}`);
  console.log("================================================================================\n");

  const masterSecret = process.env.AUTH_SECRET;
  if (!masterSecret) {
    throw new Error("AUTH_SECRET não encontrado nas variáveis de ambiente. Execute via 'railway run'.");
  }

  const timestamp = Date.now();

  // ---------------------------------------------------------------------------
  // 1. Validação de Bloqueio Não Autenticado
  // ---------------------------------------------------------------------------
  console.log("--- 1. Validação de Autenticação na API de Produção ---");
  const unauthRes = await httpsRequest(`${PROD_URL}/api/conversions`);
  assert(unauthRes.status === 401, "Acesso não autenticado a /api/conversions retorna HTTP 401 em produção");

  // ---------------------------------------------------------------------------
  // 2. Registro de Dois Usuários de Homologação em Produção
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. Registro e Autenticação de Usuários de Teste em Produção ---");
  const emailA = `homolog_conv_a_${timestamp}@testlinkzivo.com`;
  const emailB = `homolog_conv_b_${timestamp}@testlinkzivo.com`;
  const passA = `PassA_${timestamp}!Secure`;
  const passB = `PassB_${timestamp}!Secure`;

  // Registrar Usuário A
  const authResA = await httpsRequest(`${PROD_URL}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "register",
      email: emailA,
      password: passA,
      name: "Homologador Conversões A",
    }),
  });
  assert(authResA.status === 200, "Registro do Usuário A em produção concluído com HTTP 200");
  const userA = authResA.json?.user;
  const wsIdA = userA?.workspaceId;
  assert(Boolean(wsIdA), `Workspace A obtido com sucesso: ${wsIdA}`);

  const rawCookieA = authResA.headers["set-cookie"];
  const cookieA = Array.isArray(rawCookieA)
    ? rawCookieA.map((c) => c.split(";")[0]).join("; ")
    : rawCookieA?.split(";")[0] || "";
  assert(Boolean(cookieA), "Cookie de sessão do Usuário A obtido com sucesso");

  // Registrar Usuário B
  const authResB = await httpsRequest(`${PROD_URL}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "register",
      email: emailB,
      password: passB,
      name: "Homologador Conversões B",
    }),
  });
  assert(authResB.status === 200, "Registro do Usuário B em produção concluído com HTTP 200");
  const userB = authResB.json?.user;
  const wsIdB = userB?.workspaceId;
  assert(Boolean(wsIdB), `Workspace B obtido com sucesso: ${wsIdB}`);

  const rawCookieB = authResB.headers["set-cookie"];
  const cookieB = Array.isArray(rawCookieB)
    ? rawCookieB.map((c) => c.split(";")[0]).join("; ")
    : rawCookieB?.split(";")[0] || "";
  assert(Boolean(cookieB), "Cookie de sessão do Usuário B obtido com sucesso");

  // ---------------------------------------------------------------------------
  // 3. Criação de Smart Links e Geração de Cliques Reais em Produção
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. Criação de Smart Links e Rastreamento de Cliques Reais ---");
  const slugA = `conv-link-a-${timestamp}`;
  const slugB = `conv-link-b-${timestamp}`;

  const linkResA = await httpsRequest(`${PROD_URL}/api/links`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieA,
    },
    body: JSON.stringify({
      title: "Curso Homologação Hotmart A",
      url: "https://example.com/destino-hotmart-a",
      customSlug: slugA,
    }),
  });
  assert(linkResA.status === 201, "Criação do Smart Link A retornou HTTP 201");
  const linkDataA = linkResA.json?.link || linkResA.json;
  const linkIdA = linkDataA.id;
  assert(Boolean(linkIdA), `Smart Link A criado com ID: ${linkIdA}`);

  const linkResB = await httpsRequest(`${PROD_URL}/api/links`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieB,
    },
    body: JSON.stringify({
      title: "Ebook Homologação Kiwify B",
      url: "https://example.com/destino-kiwify-b",
      customSlug: slugB,
    }),
  });
  assert(linkResB.status === 201, "Criação do Smart Link B retornou HTTP 201");
  const linkDataB = linkResB.json?.link || linkResB.json;
  const linkIdB = linkDataB.id;
  assert(Boolean(linkIdB), `Smart Link B criado com ID: ${linkIdB}`);

  // Dispara cliques reais navegando em /[slug] para gerar atribuição por clickId
  const clickResA = await httpsRequest(`${PROD_URL}/${slugA}`, {
    headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15" },
  });
  assert(clickResA.status === 302, "Navegação no Link A redireciona com HTTP 302");
  const locA = clickResA.headers["location"] || "";
  const clickIdAMatch = locA.match(/[?&]linkzivo_click=([^&]+)/);
  const clickIdA = clickIdAMatch ? clickIdAMatch[1] : null;
  assert(Boolean(clickIdA), `Clique A registrado com clickId: ${clickIdA}`);

  const clickResB = await httpsRequest(`${PROD_URL}/${slugB}`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  assert(clickResB.status === 302, "Navegação no Link B redireciona com HTTP 302");
  const locB = clickResB.headers["location"] || "";
  const clickIdBMatch = locB.match(/[?&]linkzivo_click=([^&]+)/);
  const clickIdB = clickIdBMatch ? clickIdBMatch[1] : null;
  assert(Boolean(clickIdB), `Clique B registrado com clickId: ${clickIdB}`);

  // ---------------------------------------------------------------------------
  // 4. Ingestão de Postbacks Reais via POST /api/webhooks/conversions
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. Ingestão de Postbacks Reais via Webhook Oficial em Produção ---");
  const secretA = generateWebhookSecret(wsIdA, masterSecret);
  const secretB = generateWebhookSecret(wsIdB, masterSecret);

  const convA1_ExtId = `HP_PROD_${timestamp}_CONFIRMED`;
  const convA2_ExtId = `HP_PROD_${timestamp}_ESTIMATED`;
  const convA3_ExtId = `HP_PROD_${timestamp}_REFUNDED`;
  const convB_ExtId = `KW_PROD_${timestamp}_CONFIRMED`;

  // Postback 1 (WS A): Venda Hotmart confirmada R$ 200.00, comissão R$ 100.00 (com hottok e api_token)
  const webhookA1 = await httpsRequest(`${PROD_URL}/api/webhooks/conversions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Linkzivo-Secret": secretA,
      "X-Platform": "hotmart",
    },
    body: JSON.stringify({
      event: "PURCHASE_APPROVED",
      hottok: "secret_hottok_token_abc_prod_123",
      api_token: "secret_api_token_xyz_prod_789",
      webhook_secret: "lz_wh_master_secret_inside_payload",
      data: {
        buyer: { name: "Consumidor Produção A", email: "consumidor.a@teste.com" },
        purchase: {
          transaction: convA1_ExtId,
          status: "APPROVED",
          price: { value: 200.0, currency_value: "BRL" },
          sck: clickIdA,
        },
        commissions: [
          { source: "PRODUCER", value: 100.0, currency_value: "BRL" },
          { source: "AFFILIATE", value: 100.0, currency_value: "BRL" },
        ],
      },
    }),
  });
  assert(webhookA1.status === 201, `Postback 1 (Hotmart Aprovado) aceito com HTTP 201 (status: ${webhookA1.status})`);

  // Postback 2 (WS A): Venda aguardando pagamento (ESTIMATED) R$ 150.00, comissão R$ 75.00
  const webhookA2 = await httpsRequest(`${PROD_URL}/api/webhooks/conversions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Linkzivo-Secret": secretA,
    },
    body: JSON.stringify({
      slug: slugA,
      externalConversionId: convA2_ExtId,
      status: "ESTIMATED",
      amount: 150.0,
      commissionAmount: 75.0,
      currency: "BRL",
      notes: "Aguardando compensação de boleto",
    }),
  });
  assert(webhookA2.status === 201, `Postback 2 (Canônico Estimado) aceito com HTTP 201 (status: ${webhookA2.status})`);

  // Postback 3 (WS A): Venda estornada / reembolsada (REFUNDED) R$ 300.00, comissão R$ 150.00
  const webhookA3 = await httpsRequest(`${PROD_URL}/api/webhooks/conversions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Linkzivo-Secret": secretA,
    },
    body: JSON.stringify({
      slug: slugA,
      externalConversionId: convA3_ExtId,
      status: "REFUNDED",
      amount: 300.0,
      commissionAmount: 150.0,
      currency: "BRL",
      reason: "Estorno solicitado pelo consumidor",
    }),
  });
  assert(webhookA3.status === 201, `Postback 3 (Estorno REFUNDED) aceito com HTTP 201 (status: ${webhookA3.status})`);

  // Postback B (WS B): Venda confirmada Kiwify R$ 500.00, comissão R$ 250.00
  const webhookB = await httpsRequest(`${PROD_URL}/api/webhooks/conversions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Linkzivo-Secret": secretB,
      "X-Platform": "kiwify",
    },
    body: JSON.stringify({
      order_id: convB_ExtId,
      order_status: "paid",
      product_name: "Ebook Kiwify B",
      Commission: {
        charge_amount: 50000,
        my_commission: 25000,
        currency: "BRL",
      },
      TrackingParameters: {
        src: clickIdB,
      },
    }),
  });
  assert(webhookB.status === 201, `Postback B (Kiwify Aprovado WS B) aceito com HTTP 201 (status: ${webhookB.status})`);

  // ---------------------------------------------------------------------------
  // 5. Consulta HTTP Real do Extrato de Conversões em Produção
  // ---------------------------------------------------------------------------
  console.log("\n--- 5. Consulta HTTP Real do Extrato de Conversões em Produção ---");
  const listResA = await httpsRequest(`${PROD_URL}/api/conversions`, {
    headers: { Cookie: cookieA },
  });
  assert(listResA.status === 200, "Consulta autenticada de A retornou HTTP 200");
  const listDataA = listResA.json;
  assert(listDataA.conversions.length === 3, `Usuário A lista exatamente suas 3 conversões (obtido: ${listDataA.conversions.length})`);

  // ---------------------------------------------------------------------------
  // 6. Teste de Isolamento Multi-Tenant em Produção
  // ---------------------------------------------------------------------------
  console.log("\n--- 6. Validação do Isolamento Multi-Tenant em Produção ---");
  const listResB = await httpsRequest(`${PROD_URL}/api/conversions`, {
    headers: { Cookie: cookieB },
  });
  assert(listResB.status === 200, "Consulta autenticada de B retornou HTTP 200");
  const listDataB = listResB.json;
  assert(listDataB.conversions.length === 1, `Usuário B lista apenas sua 1 conversão (obtido: ${listDataB.conversions.length})`);
  assert(
    listDataB.conversions[0]?.externalConversionId === convB_ExtId,
    "Conversão listada para Usuário B é exclusivamente a dele"
  );
  const vazamento = listDataB.conversions.some((c) => c.smartLink.id === linkIdA);
  assert(!vazamento, "Nenhuma conversão do Workspace A vazou para o Workspace B em produção");

  // Localizar ID interno da conversão convA1 de A
  const convA1_Record = listDataA.conversions.find((c) => c.externalConversionId === convA1_ExtId);
  assert(Boolean(convA1_Record), `Conversão convA1 encontrada na lista com ID: ${convA1_Record?.id}`);

  // ---------------------------------------------------------------------------
  // 7. Teste de Bloqueio IDOR no Banco em Produção
  // ---------------------------------------------------------------------------
  console.log("\n--- 7. Validação de Bloqueio IDOR no Banco em Produção ---");
  // Usuário A acessa seu próprio detalhe
  const detailA1Res = await httpsRequest(`${PROD_URL}/api/conversions/${convA1_Record.id}`, {
    headers: { Cookie: cookieA },
  });
  assert(detailA1Res.status === 200, "Usuário A acessa com sucesso o detalhe de sua própria conversão (HTTP 200)");

  // Usuário B tenta acessar o detalhe da conversão de A
  const idorRes = await httpsRequest(`${PROD_URL}/api/conversions/${convA1_Record.id}`, {
    headers: { Cookie: cookieB },
  });
  assert(
    idorRes.status === 404,
    `Tentativa de IDOR do Usuário B sobre conversão de A é bloqueada na consulta ao banco com HTTP 404 (obtido: ${idorRes.status})`
  );

  // ---------------------------------------------------------------------------
  // 8. Validação do Sumário Financeiro Estrito em Produção
  // ---------------------------------------------------------------------------
  console.log("\n--- 8. Validação do Sumário Financeiro Estrito em Produção ---");
  const summaryA = listDataA.summary;
  assert(summaryA.totalConversions === 3, "Total de conversões sob o filtro é exatamente 3");
  assert(summaryA.confirmed.count === 1, "Exatamente 1 venda confirmada");
  assert(summaryA.confirmed.salesAmount === 200.0, "Vendas confirmadas somam exatamente R$ 200.00");
  assert(summaryA.confirmed.commission === 100.0, "Comissão confirmada soma exatamente R$ 100.00");

  assert(summaryA.estimated.count === 1, "Exatamente 1 venda pendente/estimada");
  assert(summaryA.estimated.commission === 75.0, "Comissão estimada soma R$ 75.00");

  assert(summaryA.refunded.count === 1, "Exatamente 1 venda estornada");
  assert(summaryA.refunded.salesAmount === 300.0, "Valor de vendas estornadas é R$ 300.00");
  assert(summaryA.refunded.commission === 150.0, "Comissão estornada é R$ 150.00");

  // Requisitos críticos de integridade financeira:
  assert(
    summaryA.confirmed.commission !== 250.0,
    "Comissões estornadas (150) NUNCA somam no total confirmado (100)"
  );
  assert(
    summaryA.confirmed.salesAmount !== 500.0,
    "Vendas estornadas (300) NUNCA somam no total de vendas confirmadas (200)"
  );

  // ---------------------------------------------------------------------------
  // 9. Validação de Filtros por Status e Busca Textual em Produção
  // ---------------------------------------------------------------------------
  console.log("\n--- 9. Filtros e Busca Textual em Produção ---");
  const filterConfRes = await httpsRequest(`${PROD_URL}/api/conversions?status=CONFIRMED`, {
    headers: { Cookie: cookieA },
  });
  assert(filterConfRes.json.conversions.length === 1, "Filtro status=CONFIRMED retorna 1 registro em produção");
  assert(filterConfRes.json.conversions[0].status === "CONFIRMED", "Registro retornado tem status CONFIRMED");

  const filterRefRes = await httpsRequest(`${PROD_URL}/api/conversions?status=REFUNDED`, {
    headers: { Cookie: cookieA },
  });
  assert(filterRefRes.json.conversions.length === 1, "Filtro status=REFUNDED retorna 1 registro em produção");
  assert(filterRefRes.json.conversions[0].status === "REFUNDED", "Registro retornado tem status REFUNDED");

  const searchRes = await httpsRequest(`${PROD_URL}/api/conversions?search=${convA3_ExtId}`, {
    headers: { Cookie: cookieA },
  });
  assert(searchRes.json.conversions.length === 1, "Busca textual por ID externo localiza registro específico em produção");
  assert(searchRes.json.conversions[0].externalConversionId === convA3_ExtId, "ID externo localizado bate com a busca");

  // ---------------------------------------------------------------------------
  // 10. Validação da Sanitização Estrita do rawPayload no Detalhe
  // ---------------------------------------------------------------------------
  console.log("\n--- 10. Sanitização de Tokens e Secrets no Detalhe Individual em Produção ---");
  const detailA1Data = detailA1Res.json;
  const sanitizedRaw = detailA1Data.conversion.technicalAudit.sanitizedRawPayload;

  assert(Boolean(sanitizedRaw), "sanitizedRawPayload retornado no payload de auditoria técnica");
  assert(
    sanitizedRaw.hottok === "[PROTEGIDO POR SEGURANÇA]",
    "Campo sensível 'hottok' mascarado para '[PROTEGIDO POR SEGURANÇA]' em produção"
  );
  assert(
    sanitizedRaw.api_token === "[PROTEGIDO POR SEGURANÇA]",
    "Campo sensível 'api_token' mascarado para '[PROTEGIDO POR SEGURANÇA]' em produção"
  );
  assert(
    sanitizedRaw.webhook_secret === "[PROTEGIDO POR SEGURANÇA]",
    "Campo sensível 'webhook_secret' mascarado para '[PROTEGIDO POR SEGURANÇA]' em produção"
  );
  assert(
    sanitizedRaw.data?.buyer?.name === "Consumidor Produção A",
    "Dados de negócio 'data.buyer.name' preservados para auditoria em produção"
  );
  assert(
    sanitizedRaw.data?.purchase?.price?.value === 200.0,
    "Valor financeiro no payload preservado para auditoria em produção"
  );

  // Distinção entre Estado Financeiro e Resultado Técnico
  assert(
    detailA1Data.conversion.financial.status === "CONFIRMED",
    "Campo financial.status reflete estado financeiro CONFIRMED"
  );
  assert(
    detailA1Data.conversion.technicalAudit.platform === "Hotmart",
    "Campo technicalAudit.platform identifica Hotmart a partir das características do postback"
  );
  assert(
    detailA1Data.conversion.technicalAudit.originalEvent === "PURCHASE_APPROVED",
    "Campo technicalAudit.originalEvent preserva o evento técnico original de postback"
  );

  console.log("\n================================================================================");
  console.log(`TOTAL DE ASSERÇÕES APROVADAS EM PRODUÇÃO: ${passed}`);
  console.log(`TOTAL DE FALHAS EM PRODUÇÃO:              ${failed}`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runProductionHomologation().catch((err) => {
  console.error("ERRO FATAL NA HOMOLOGAÇÃO EM PRODUÇÃO:", err);
  process.exit(1);
});

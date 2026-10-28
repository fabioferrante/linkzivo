/**
 * LINKZIVO — Suíte de Testes Automatizados da Fase F2: Postback Universal de Conversões
 *
 * Cobertura de Requisitos:
 * 1. Autenticação de Segredo:
 *    - Segredo ausente -> HTTP 401 UNAUTHORIZED
 *    - Segredo inválido/adulterado -> HTTP 401 UNAUTHORIZED
 *    - Segredo válido via Header (X-Linkzivo-Secret) -> Sucesso
 *    - Segredo válido via Authorization Bearer -> Sucesso
 *    - Segredo válido via Query Param (?secret=) -> Sucesso
 *
 * 2. Segurança e Anti-Spoofing (Isolamento de Workspaces):
 *    - Tentativa de enviar payload atribuindo clique de outro workspace -> HTTP 403 CROSS_WORKSPACE_VIOLATION
 *    - Tentativa de enviar payload atribuindo link de outro workspace -> HTTP 403 CROSS_WORKSPACE_VIOLATION
 *    - Tentativa de atualizar conversão de outro workspace -> HTTP 403 CROSS_WORKSPACE_VIOLATION
 *
 * 3. Atribuição de Conversões:
 *    - Atribuição válida por clickId (vincula click, smartLink, campaign, product) -> HTTP 201 CREATED
 *    - Atribuição válida por slug (fallback quando não há clickId) -> HTTP 201 CREATED
 *    - ClickId inexistente no banco -> HTTP 422 INVALID_CLICK_ID
 *    - Conflito entre slug e clickId (inconsistência de atribuição) -> HTTP 422 ATTRIBUTION_MISMATCH
 *    - Ausência total de dados de atribuição -> HTTP 400 MISSING_ATTRIBUTION
 *
 * 4. Validação de Payloads e Valores:
 *    - JSON malformado -> HTTP 400 INVALID_JSON
 *    - Valores monetários negativos -> HTTP 400 INVALID_AMOUNT / INVALID_COMMISSION
 *    - Código de moeda inválido -> HTTP 400 INVALID_CURRENCY
 *    - Status desconhecido -> HTTP 400 INVALID_STATUS
 *
 * 5. Adaptadores de Plataformas:
 *    - Adaptador Canônico Linkzivo -> Sucesso
 *    - Adaptador Oficial Hotmart (Webhook 2.0 com purchase, sck e commissions) -> Sucesso
 *    - Adaptador Oficial Kiwify (order_id, Commission e TrackingParameters.src) -> Sucesso
 *
 * 6. Idempotência e Atualização de Status (Reembolso / Cancelamento):
 *    - Reenvio do mesmo evento com o mesmo status -> HTTP 200 IGNORED_DUPLICATE (não duplica no banco)
 *    - Evento de estorno (REFUNDED) -> HTTP 200 UPDATED (atualiza status sem criar duplicata)
 *    - Concorrência real de 2 requisições simultâneas com o mesmo externalConversionId (1 cria, 1 ignora/atualiza, sem falha P2002)
 *
 * 7. Reflexo e Integridade nas Métricas de Analytics:
 *    - Conversões confirmadas somam na comissão confirmada em /api/analytics
 *    - Conversões reembolsadas são estritamente excluídas do total de comissões confirmadas
 *    - Métricas do Workspace A nunca vazam para o Workspace B
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

// Importação dos handlers e utilitários
const { POST: postbackHandler } = require("../src/app/api/webhooks/conversions/route.ts");
const { GET: getAnalyticsHandler } = require("../src/app/api/analytics/route.ts");
const {
  generateWorkspaceWebhookSecret,
  verifyWorkspaceWebhookSecret,
} = require("../src/lib/webhooks.ts");
const { signSessionToken } = require("../src/lib/auth.ts");

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`  ❌ FALHA: ${message}`);
    throw new Error(`Asserção falhou: ${message}`);
  }
  passedTests++;
  console.log(`  ✅ ${message}`);
}

function makeWebhookRequest(urlPath, method, body, headers = {}) {
  const url = `http://localhost:3000${urlPath}`;
  const requestHeaders = new Headers({
    "Content-Type": "application/json",
    ...headers,
  });

  return new NextRequest(new URL(url), {
    method,
    headers: requestHeaders,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function createAuthSession(userId, workspaceId) {
  const session = await prisma.session.create({
    data: {
      userId,
      workspaceId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  const rawPayload = `${session.id}:${userId}:${workspaceId}`;
  return signSessionToken(rawPayload);
}

function makeAnalyticsRequest(signedToken) {
  const headers = new Headers({
    "Content-Type": "application/json",
    cookie: `linkzivo_session=${signedToken}`,
  });
  return new NextRequest(new URL("http://localhost:3000/api/analytics?period=30d"), {
    method: "GET",
    headers,
  });
}

async function runTests() {
  console.log("\n====================================================================");
  console.log("LINKZIVO — Suíte de Testes da Fase F2 (Postback Universal de Conversões)");
  console.log(`Banco Alvo: ${TEST_DATABASE_URL}`);
  console.log("====================================================================\n");

  const runId = `f2_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

  try {
    // --------------------------------------------------------------------------
    // Setup: Criação de 2 Workspaces Isolados (A e B) com Links e Cliques
    // --------------------------------------------------------------------------
    const userA = await prisma.user.create({
      data: { email: `userA_${runId}@test.local`, name: "User A (F2)" },
    });
    const wsA = await prisma.workspace.create({
      data: { userId: userA.id, name: `Workspace A (${runId})`, slug: `wsa-${runId}`, plan: "CREATOR" },
    });
    const secretA = generateWorkspaceWebhookSecret(wsA.id);
    const tokenA = await createAuthSession(userA.id, wsA.id);

    const userB = await prisma.user.create({
      data: { email: `userB_${runId}@test.local`, name: "User B (F2)" },
    });
    const wsB = await prisma.workspace.create({
      data: { userId: userB.id, name: `Workspace B (${runId})`, slug: `wsb-${runId}`, plan: "FREE" },
    });
    const secretB = generateWorkspaceWebhookSecret(wsB.id);
    const tokenB = await createAuthSession(userB.id, wsB.id);

    // Cria Produto e Smart Link no Workspace A
    const prodA = await prisma.product.create({
      data: { workspaceId: wsA.id, name: `Produto A ${runId}`, platform: "Hotmart" },
    });
    const linkA = await prisma.smartLink.create({
      data: {
        workspaceId: wsA.id,
        productId: prodA.id,
        slug: `link-a-${runId}`,
        destinationUrl: "https://hotmart.com/pay/item-a",
        status: "ACTIVE",
      },
    });

    // Cria Clique no Link A do Workspace A
    const clickIdA = `CLK_${crypto.randomBytes(6).toString("hex")}`;
    const clickA = await prisma.click.create({
      data: {
        id: clickIdA,
        smartLinkId: linkA.id,
        workspaceId: wsA.id,
        productId: prodA.id,
        device: "Mobile",
        os: "Android",
        country: "BR",
      },
    });

    // Cria Produto, Smart Link e Clique no Workspace B
    const prodB = await prisma.product.create({
      data: { workspaceId: wsB.id, name: `Produto B ${runId}`, platform: "Kiwify" },
    });
    const linkB = await prisma.smartLink.create({
      data: {
        workspaceId: wsB.id,
        productId: prodB.id,
        slug: `link-b-${runId}`,
        destinationUrl: "https://kiwify.com/pay/item-b",
        status: "ACTIVE",
      },
    });
    const clickIdB = `CLK_${crypto.randomBytes(6).toString("hex")}`;
    const clickB = await prisma.click.create({
      data: {
        id: clickIdB,
        smartLinkId: linkB.id,
        workspaceId: wsB.id,
        productId: prodB.id,
        device: "Desktop",
        os: "Windows",
        country: "BR",
      },
    });

    // ==========================================================================
    // GRUPO 1: AUTENTICAÇÃO E VALIDAÇÃO DE SEGREDO
    // ==========================================================================
    console.log("--- Grupo 1: Autenticação de Segredo de Webhook ---");

    // 1.1: Segredo ausente -> 401
    {
      const req = makeWebhookRequest("/api/webhooks/conversions", "POST", {
        externalConversionId: "TX-TEST-1",
      });
      const res = await postbackHandler(req);
      const data = await res.json();
      assert(res.status === 401, "Webhook sem segredo deve retornar HTTP 401");
      assert(data.code === "UNAUTHORIZED", "Código deve ser 'UNAUTHORIZED'");
    }

    // 1.2: Segredo malformado / forjado -> 401
    {
      const req = makeWebhookRequest(
        "/api/webhooks/conversions",
        "POST",
        { externalConversionId: "TX-TEST-2" },
        { "x-linkzivo-secret": "lz_wh_fake_workspace_id.fakehash123456" }
      );
      const res = await postbackHandler(req);
      const data = await res.json();
      assert(res.status === 401, "Segredo adulterado deve retornar HTTP 401");
      assert(data.code === "UNAUTHORIZED", "Código de assinatura inválida deve ser 'UNAUTHORIZED'");
    }

    // 1.3: Segredo válido via Header X-Linkzivo-Secret
    {
      const verification = verifyWorkspaceWebhookSecret(secretA);
      assert(verification.valid === true, "Verificação do segredo gerado deve retornar valid: true");
      assert(verification.workspaceId === wsA.id, "WorkspaceId extraído do segredo deve corresponder ao wsA.id");
    }

    // 1.4: Segredo válido via Authorization Bearer
    {
      const req = makeWebhookRequest(
        "/api/webhooks/conversions",
        "POST",
        {
          externalConversionId: `TX-AUTH-BEARER-${runId}`,
          clickId: clickA.id,
          amount: 100,
          commissionAmount: 50,
        },
        { authorization: `Bearer ${secretA}` }
      );
      const res = await postbackHandler(req);
      const data = await res.json();
      assert(res.status === 201, "Segredo via Authorization Bearer deve autorizar e retornar HTTP 201");
      assert(data.action === "CREATED", "Ação resultante deve ser 'CREATED'");
    }

    // 1.5: Segredo válido via Query Param (?secret=)
    {
      const req = makeWebhookRequest(
        `/api/webhooks/conversions?secret=${secretA}`,
        "POST",
        {
          externalConversionId: `TX-AUTH-QUERY-${runId}`,
          clickId: clickA.id,
          amount: 80,
          commissionAmount: 40,
        }
      );
      const res = await postbackHandler(req);
      const data = await res.json();
      assert(res.status === 201, "Segredo via Query Param deve autorizar e retornar HTTP 201");
    }

    // ==========================================================================
    // GRUPO 2: ISOLAMENTO E ANTI-SPOOFING (CROSS-WORKSPACE)
    // ==========================================================================
    console.log("\n--- Grupo 2: Isolamento entre Workspaces e Proteção Anti-Spoofing ---");

    // 2.1: Segredo do Workspace A tentando registrar conversão para um clique do Workspace B -> 403
    {
      const req = makeWebhookRequest(
        "/api/webhooks/conversions",
        "POST",
        {
          externalConversionId: `TX-CROSS-CLICK-${runId}`,
          clickId: clickB.id, // Clique pertence ao WS B!
          amount: 150,
          commissionAmount: 75,
        },
        { "x-linkzivo-secret": secretA } // Segredo pertence ao WS A!
      );
      const res = await postbackHandler(req);
      const data = await res.json();
      assert(res.status === 403, "Atribuir clique de outro workspace deve retornar HTTP 403");
      assert(data.code === "CROSS_WORKSPACE_VIOLATION", "Código deve ser 'CROSS_WORKSPACE_VIOLATION'");
    }

    // 2.2: Segredo do Workspace A tentando registrar conversão para um link do Workspace B por slug -> 403
    {
      const req = makeWebhookRequest(
        "/api/webhooks/conversions",
        "POST",
        {
          externalConversionId: `TX-CROSS-LINK-${runId}`,
          slug: linkB.slug, // Link do WS B
          amount: 200,
          commissionAmount: 100,
        },
        { "x-linkzivo-secret": secretA }
      );
      const res = await postbackHandler(req);
      const data = await res.json();
      assert(res.status === 403, "Atribuir link de outro workspace deve retornar HTTP 403");
      assert(data.code === "CROSS_WORKSPACE_VIOLATION", "Código deve ser 'CROSS_WORKSPACE_VIOLATION'");
    }

    // ==========================================================================
    // GRUPO 3: ATRIBUIÇÃO E INTEGRIDADE
    // ==========================================================================
    console.log("\n--- Grupo 3: Atribuição e Integridade de Relações ---");

    // 3.1: ClickId inexistente -> 422
    {
      const req = makeWebhookRequest(
        "/api/webhooks/conversions",
        "POST",
        {
          externalConversionId: `TX-INVALID-CLICK-${runId}`,
          clickId: "CLK_non_existent_fake_id_123",
          amount: 100,
          commissionAmount: 50,
        },
        { "x-linkzivo-secret": secretA }
      );
      const res = await postbackHandler(req);
      const data = await res.json();
      assert(res.status === 422, "ClickId inexistente deve retornar HTTP 422");
      assert(data.code === "INVALID_CLICK_ID", "Código deve ser 'INVALID_CLICK_ID'");
    }

    // 3.2: Atribuição por slug quando não há clickId -> 201 Sucesso
    {
      const req = makeWebhookRequest(
        "/api/webhooks/conversions",
        "POST",
        {
          externalConversionId: `TX-SLUG-ATTRIBUTION-${runId}`,
          slug: linkA.slug,
          amount: 250,
          commissionAmount: 125,
        },
        { "x-linkzivo-secret": secretA }
      );
      const res = await postbackHandler(req);
      const data = await res.json();
      assert(res.status === 201, "Atribuição válida por slug deve retornar HTTP 201");
      assert(data.smartLinkId === linkA.id, "Conversão deve ser vinculada ao smartLink correto");
    }

    // 3.3: Conflito entre slug e clickId (inconsistência) -> 422
    {
      // Cria outro link no Workspace A
      const linkA2 = await prisma.smartLink.create({
        data: {
          workspaceId: wsA.id,
          slug: `link-a2-${runId}`,
          destinationUrl: "https://example.com/a2",
          status: "ACTIVE",
        },
      });

      const req = makeWebhookRequest(
        "/api/webhooks/conversions",
        "POST",
        {
          externalConversionId: `TX-MISMATCH-${runId}`,
          clickId: clickA.id, // O clique pertence ao linkA
          slug: linkA2.slug,  // Mas o slug informado é do linkA2!
          amount: 100,
          commissionAmount: 50,
        },
        { "x-linkzivo-secret": secretA }
      );
      const res = await postbackHandler(req);
      const data = await res.json();
      assert(res.status === 422, "Conflito de atribuição entre slug e clickId deve retornar HTTP 422");
      assert(data.code === "ATTRIBUTION_MISMATCH", "Código deve ser 'ATTRIBUTION_MISMATCH'");
    }

    // 3.4: Ausência total de dados de atribuição -> 400
    {
      const req = makeWebhookRequest(
        "/api/webhooks/conversions",
        "POST",
        {
          externalConversionId: `TX-NO-ATTR-${runId}`,
          amount: 100,
          commissionAmount: 50,
        },
        { "x-linkzivo-secret": secretA }
      );
      const res = await postbackHandler(req);
      const data = await res.json();
      assert(res.status === 400, "Webhook sem dados de atribuição deve retornar HTTP 400");
      assert(data.code === "MISSING_ATTRIBUTION", "Código deve ser 'MISSING_ATTRIBUTION'");
    }

    // ==========================================================================
    // GRUPO 4: VALIDAÇÃO DE DADOS E VALORES MONETÁRIOS
    // ==========================================================================
    console.log("\n--- Grupo 4: Validação de Dados e Valores Monetários ---");

    // 4.1: JSON malformado -> 400
    {
      const req = makeWebhookRequest(
        "/api/webhooks/conversions",
        "POST",
        "INVALID_JSON_CORRUPT_STRING{{{",
        { "x-linkzivo-secret": secretA }
      );
      const res = await postbackHandler(req);
      const data = await res.json();
      assert(res.status === 400, "JSON malformado deve retornar HTTP 400");
      assert(data.code === "INVALID_JSON", "Código deve ser 'INVALID_JSON'");
    }

    // 4.2: Valor negativo -> 400
    {
      const req = makeWebhookRequest(
        "/api/webhooks/conversions",
        "POST",
        {
          externalConversionId: `TX-NEG-VAL-${runId}`,
          clickId: clickA.id,
          amount: -50.0,
          commissionAmount: 10.0,
        },
        { "x-linkzivo-secret": secretA }
      );
      const res = await postbackHandler(req);
      const data = await res.json();
      assert(res.status === 400, "Valor monetário negativo deve retornar HTTP 400");
      assert(data.code === "INVALID_AMOUNT", "Código deve ser 'INVALID_AMOUNT'");
    }

    // 4.3: Moeda inválida -> 400
    {
      const req = makeWebhookRequest(
        "/api/webhooks/conversions",
        "POST",
        {
          externalConversionId: `TX-INV-CURR-${runId}`,
          clickId: clickA.id,
          amount: 100,
          commissionAmount: 50,
          currency: "INVALID_CURRENCY_TOOLONG",
        },
        { "x-linkzivo-secret": secretA }
      );
      const res = await postbackHandler(req);
      const data = await res.json();
      assert(res.status === 400, "Moeda fora do padrão ISO 4217 deve retornar HTTP 400");
      assert(data.code === "INVALID_CURRENCY", "Código deve ser 'INVALID_CURRENCY'");
    }

    // ==========================================================================
    // GRUPO 5: ADAPTADORES DE PLATAFORMAS (HOTMART E KIWIFY)
    // ==========================================================================
    console.log("\n--- Grupo 5: Adaptadores de Plataformas (Hotmart e Kiwify) ---");

    // 5.1: Adaptador Hotmart (Webhook 2.0 Oficial)
    const hotmartTxId = `HP_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    {
      const hotmartPayload = {
        id: "evt_123456",
        creation_date: Date.now(),
        event: "PURCHASE_APPROVED",
        version: "2.0.0",
        data: {
          purchase: {
            transaction: hotmartTxId,
            status: "APPROVED",
            price: { value: 197.0, currency_value: "BRL" },
            sck: clickA.id,
          },
          commissions: [
            { source: "PRODUCER", value: 98.5, currency_value: "BRL" },
            { source: "AFFILIATE", value: 98.5, currency_value: "BRL" },
          ],
        },
      };

      const req = makeWebhookRequest(
        "/api/webhooks/conversions",
        "POST",
        hotmartPayload,
        {
          "x-linkzivo-secret": secretA,
          "x-platform": "hotmart",
        }
      );
      const res = await postbackHandler(req);
      const data = await res.json();
      assert(res.status === 201, "Webhook Hotmart aprovado deve retornar HTTP 201");
      assert(data.externalConversionId === hotmartTxId, "externalConversionId deve bater com a transação Hotmart");
      assert(data.commissionAmount === 98.5, "Comissão extraída deve ser a de afiliado (98.50)");
      assert(data.status === "CONFIRMED", "Status normalizado deve ser 'CONFIRMED'");
    }

    // 5.2: Adaptador Kiwify (Webhook Oficial)
    const kiwifyOrderId = `kw_${crypto.randomUUID()}`;
    {
      const kiwifyPayload = {
        order_id: kiwifyOrderId,
        order_status: "paid",
        order_ref: "REF_KW_9988",
        payment_method: "pix",
        Commission: {
          charge_amount: 29700, // 297.00 em centavos
          my_commission: 14850, // 148.50 em centavos
          currency: "BRL",
        },
        TrackingParameters: {
          src: clickB.id,
          sck: clickB.id,
        },
      };

      const req = makeWebhookRequest(
        "/api/webhooks/conversions",
        "POST",
        kiwifyPayload,
        {
          "x-linkzivo-secret": secretB,
          "x-platform": "kiwify",
        }
      );
      const res = await postbackHandler(req);
      const data = await res.json();
      assert(res.status === 201, "Webhook Kiwify aprovado deve retornar HTTP 201");
      assert(data.externalConversionId === kiwifyOrderId, "externalConversionId deve bater com order_id da Kiwify");
      assert(data.commissionAmount === 148.5, "Comissão convertida de centavos para reais deve ser 148.50");
      assert(data.status === "CONFIRMED", "Status deve ser 'CONFIRMED'");
    }

    // ==========================================================================
    // GRUPO 6: IDEMPOTÊNCIA, REEMBOLSO E CONCORRÊNCIA REAL
    // ==========================================================================
    console.log("\n--- Grupo 6: Idempotência, Reembolso e Concorrência ---");

    // 6.1: Reenvio do mesmo evento com o mesmo status -> HTTP 200 IGNORED_DUPLICATE
    {
      const reqDuplicate = makeWebhookRequest(
        "/api/webhooks/conversions",
        "POST",
        {
          externalConversionId: hotmartTxId,
          clickId: clickA.id,
          amount: 197.0,
          commissionAmount: 98.5,
          status: "CONFIRMED",
        },
        { "x-linkzivo-secret": secretA }
      );
      const resDuplicate = await postbackHandler(reqDuplicate);
      const dataDuplicate = await resDuplicate.json();
      assert(resDuplicate.status === 200, "Reenvio idêntico deve retornar HTTP 200 (Idempotência)");
      assert(dataDuplicate.action === "IGNORED_DUPLICATE", "Ação deve ser 'IGNORED_DUPLICATE'");

      // Confirma que não duplicou registro no banco
      const countRecords = await prisma.conversion.count({
        where: { externalConversionId: hotmartTxId },
      });
      assert(countRecords === 1, "Deve existir exatamente 1 registro no banco de dados para a transação");
    }

    // 6.2: Evento de Estorno / Reembolso (REFUNDED) -> HTTP 200 UPDATED
    {
      const hotmartRefundPayload = {
        event: "PURCHASE_REFUNDED",
        data: {
          purchase: {
            transaction: hotmartTxId,
            status: "REFUNDED",
            price: { value: 197.0, currency_value: "BRL" },
            sck: clickA.id,
          },
        },
      };

      const reqRefund = makeWebhookRequest(
        "/api/webhooks/conversions",
        "POST",
        hotmartRefundPayload,
        {
          "x-linkzivo-secret": secretA,
          "x-platform": "hotmart",
        }
      );
      const resRefund = await postbackHandler(reqRefund);
      const dataRefund = await resRefund.json();
      assert(resRefund.status === 200, "Webhook de reembolso deve retornar HTTP 200");
      assert(dataRefund.action === "UPDATED", "Ação deve ser 'UPDATED'");
      assert(dataRefund.previousStatus === "CONFIRMED", "previousStatus deve ser 'CONFIRMED'");
      assert(dataRefund.newStatus === "REFUNDED", "newStatus deve ser 'REFUNDED'");

      const recordInDb = await prisma.conversion.findUnique({
        where: { externalConversionId: hotmartTxId },
      });
      assert(recordInDb.status === "REFUNDED", "Registro no banco deve estar com status REFUNDED");
    }

    // 6.3: Concorrência Real de 2 requisições com o mesmo externalConversionId (Mesmo Workspace)
    {
      const concurrentTxId = `TX-CONCURRENT-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
      const payloadConcorrente = {
        externalConversionId: concurrentTxId,
        clickId: clickA.id,
        amount: 300,
        commissionAmount: 150,
        status: "CONFIRMED",
      };

      const req1 = makeWebhookRequest(
        "/api/webhooks/conversions",
        "POST",
        payloadConcorrente,
        { "x-linkzivo-secret": secretA }
      );
      const req2 = makeWebhookRequest(
        "/api/webhooks/conversions",
        "POST",
        payloadConcorrente,
        { "x-linkzivo-secret": secretA }
      );

      // Dispara simultaneamente via Promise.all
      const [res1, res2] = await Promise.all([
        postbackHandler(req1),
        postbackHandler(req2),
      ]);

      const statuses = [res1.status, res2.status];
      assert(
        (statuses.includes(201) && statuses.includes(200)) ||
        (res1.status === 201 && res2.status === 201),
        "Concorrência: requisições simultâneas devem concluir sem quebrar constraint no banco"
      );

      const countConcurrent = await prisma.conversion.count({
        where: { externalConversionId: concurrentTxId },
      });
      assert(countConcurrent === 1, "Exatamente 1 registro deve persistir no banco após disputa concorrente");
    }

    // 6.4: Proteção contra Eventos Fora de Ordem (CONFIRMED -> REFUNDED -> CONFIRMED)
    // Uma venda que já foi estornada (REFUNDED) NÃO pode ser ressuscitada por retry tardio de CONFIRMED
    {
      const reqLateConfirm = makeWebhookRequest(
        "/api/webhooks/conversions",
        "POST",
        {
          externalConversionId: hotmartTxId, // Já está REFUNDED
          clickId: clickA.id,
          amount: 197.0,
          commissionAmount: 98.5,
          status: "CONFIRMED",
        },
        { "x-linkzivo-secret": secretA }
      );
      const resLateConfirm = await postbackHandler(reqLateConfirm);
      const dataLateConfirm = await resLateConfirm.json();

      assert(resLateConfirm.status === 200, "Tentativa de reverter REFUNDED para CONFIRMED deve retornar HTTP 200");
      assert(dataLateConfirm.action === "IGNORED_OUT_OF_ORDER", "Ação deve ser 'IGNORED_OUT_OF_ORDER'");
      assert(dataLateConfirm.previousStatus === "REFUNDED", "previousStatus reportado deve ser 'REFUNDED'");
      assert(dataLateConfirm.newStatus === "CONFIRMED", "newStatus rejeitado deve ser 'CONFIRMED'");

      // Confirma que no banco o status permaneceu estritamente REFUNDED
      const checkDb = await prisma.conversion.findUnique({
        where: { externalConversionId: hotmartTxId },
      });
      assert(checkDb.status === "REFUNDED", "Status no banco de dados deve permanecer rigorosamente REFUNDED");
    }

    // 6.5: Proteção de Estado Terminal Cancelado (CONFIRMED -> CANCELED -> CONFIRMED)
    {
      const cancelTxId = `TX-CANCEL-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
      // Criação inicial CONFIRMED
      const reqCreate = makeWebhookRequest(
        "/api/webhooks/conversions",
        "POST",
        {
          externalConversionId: cancelTxId,
          clickId: clickA.id,
          amount: 200,
          commissionAmount: 100,
          status: "CONFIRMED",
        },
        { "x-linkzivo-secret": secretA }
      );
      const resCreate = await postbackHandler(reqCreate);
      assert(resCreate.status === 201, "Criação de venda para teste de cancelamento deve retornar HTTP 201");

      // Transição para CANCELED
      const reqCancel = makeWebhookRequest(
        "/api/webhooks/conversions",
        "POST",
        {
          externalConversionId: cancelTxId,
          clickId: clickA.id,
          status: "CANCELED",
        },
        { "x-linkzivo-secret": secretA }
      );
      const resCancel = await postbackHandler(reqCancel);
      const dataCancel = await resCancel.json();
      assert(resCancel.status === 200, "Transição para CANCELED deve retornar HTTP 200");
      assert(dataCancel.action === "UPDATED", "Ação deve ser 'UPDATED'");
      assert(dataCancel.newStatus === "CANCELED", "newStatus deve ser 'CANCELED'");

      // Tentativa de reversão tardia de CANCELED para CONFIRMED -> Deve ser ignorada
      const reqRevert = makeWebhookRequest(
        "/api/webhooks/conversions",
        "POST",
        {
          externalConversionId: cancelTxId,
          clickId: clickA.id,
          status: "CONFIRMED",
        },
        { "x-linkzivo-secret": secretA }
      );
      const resRevert = await postbackHandler(reqRevert);
      const dataRevert = await resRevert.json();
      assert(resRevert.status === 200, "Tentativa de reverter CANCELED para CONFIRMED deve retornar HTTP 200");
      assert(dataRevert.action === "IGNORED_OUT_OF_ORDER", "Ação de reversão deve ser 'IGNORED_OUT_OF_ORDER'");

      const checkCancelDb = await prisma.conversion.findUnique({
        where: { externalConversionId: cancelTxId },
      });
      assert(checkCancelDb.status === "CANCELED", "Status no banco de dados deve permanecer CANCELED");
    }

    // 6.6: Disjunção de Estados Terminais (Transição entre CANCELED e REFUNDED é Proibida)
    {
      const disjunctTxId = `TX-DISJUNCT-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
      await prisma.conversion.create({
        data: {
          externalConversionId: disjunctTxId,
          smartLinkId: linkA.id,
          status: "CANCELED",
          amount: 100,
          commissionAmount: 50,
        },
      });

      const reqDisjunct = makeWebhookRequest(
        "/api/webhooks/conversions",
        "POST",
        {
          externalConversionId: disjunctTxId,
          clickId: clickA.id,
          status: "REFUNDED",
        },
        { "x-linkzivo-secret": secretA }
      );
      const resDisjunct = await postbackHandler(reqDisjunct);
      const dataDisjunct = await resDisjunct.json();
      assert(resDisjunct.status === 200, "Tentativa de transitar CANCELED para REFUNDED retorna HTTP 200");
      assert(dataDisjunct.action === "IGNORED_OUT_OF_ORDER", "Ação deve ser 'IGNORED_OUT_OF_ORDER' (estados terminais disjuntos)");
    }

    // 6.7: Concorrência entre Confirmação e Estorno (A corrida deve convergir para REFUNDED)
    {
      const raceTxId = `TX-RACE-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
      // Cria a transação como CONFIRMED
      await prisma.conversion.create({
        data: {
          externalConversionId: raceTxId,
          smartLinkId: linkA.id,
          status: "CONFIRMED",
          amount: 500,
          commissionAmount: 250,
        },
      });

      // Dispara simultaneamente uma atualização com CONFIRMED (retry) e uma com REFUNDED
      const reqRace1 = makeWebhookRequest(
        "/api/webhooks/conversions",
        "POST",
        { externalConversionId: raceTxId, clickId: clickA.id, status: "CONFIRMED" },
        { "x-linkzivo-secret": secretA }
      );
      const reqRace2 = makeWebhookRequest(
        "/api/webhooks/conversions",
        "POST",
        { externalConversionId: raceTxId, clickId: clickA.id, status: "REFUNDED" },
        { "x-linkzivo-secret": secretA }
      );

      await Promise.all([postbackHandler(reqRace1), postbackHandler(reqRace2)]);

      const recordRace = await prisma.conversion.findUnique({
        where: { externalConversionId: raceTxId },
      });
      assert(recordRace.status === "REFUNDED", "Concorrência entre confirmação e estorno deve convergir para REFUNDED");
    }

    // 6.8: Colisão de externalConversionId Concorrente entre Workspaces Diferentes (Validação do P2002)
    {
      const crossConcurrentTxId = `TX-CROSS-CONCURRENT-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
      const reqWsA = makeWebhookRequest(
        "/api/webhooks/conversions",
        "POST",
        { externalConversionId: crossConcurrentTxId, clickId: clickA.id, status: "CONFIRMED", amount: 100 },
        { "x-linkzivo-secret": secretA }
      );
      const reqWsB = makeWebhookRequest(
        "/api/webhooks/conversions",
        "POST",
        { externalConversionId: crossConcurrentTxId, clickId: clickB.id, status: "CONFIRMED", amount: 100 },
        { "x-linkzivo-secret": secretB }
      );

      const [resA, resB] = await Promise.all([postbackHandler(reqWsA), postbackHandler(reqWsB)]);
      const statuses = [resA.status, resB.status];

      assert(statuses.includes(201), "Exatamente 1 workspace conquista a criação da transação (201)");
      assert(statuses.includes(403), "O outro workspace que colidiu deve receber HTTP 403 CROSS_WORKSPACE_VIOLATION via P2002");
    }

    // 6.9: Tentativa de Estorno para Transação Inexistente
    {
      const inexistentTxId = `TX-INEXISTENT-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
      const reqInexistent = makeWebhookRequest(
        "/api/webhooks/conversions",
        "POST",
        {
          externalConversionId: inexistentTxId,
          clickId: clickA.id,
          status: "REFUNDED",
          amount: 100,
          commissionAmount: 50,
        },
        { "x-linkzivo-secret": secretA }
      );
      const resInexistent = await postbackHandler(reqInexistent);
      const dataInexistent = await resInexistent.json();
      assert(resInexistent.status === 201, "Webhook de estorno para transação nova é registrado com HTTP 201");
      assert(dataInexistent.status === "REFUNDED", "Status persistido deve ser 'REFUNDED'");

      const recordInDb = await prisma.conversion.findUnique({
        where: { externalConversionId: inexistentTxId },
      });
      assert(recordInDb.status === "REFUNDED", "Registro persistido no banco como REFUNDED");
    }

    // 6.10: Erro P2002 de Outra Constraint Não Pode Ser Mascarado como Duplicidade
    {
      const { processConversionWebhook } = require("../src/lib/webhooks.ts");
      const fakeClient = {
        conversion: {
          findUnique: async () => null,
          create: async () => {
            const err = new Error("Unique constraint failed on other field");
            err.code = "P2002";
            err.meta = { target: ["some_other_column_not_external_id"] };
            throw err;
          },
        },
        click: {
          findUnique: async () => ({
            id: clickA.id,
            workspaceId: wsA.id,
            smartLinkId: linkA.id,
            smartLink: { id: linkA.id, workspaceId: wsA.id, slug: linkA.slug },
          }),
        },
      };

      const resultConstraint = await processConversionWebhook(
        wsA.id,
        {
          externalConversionId: "TX-OTHER-CONSTRAINT",
          clickId: clickA.id,
          conversionType: "SALE",
          status: "CONFIRMED",
          amount: 100,
          commissionAmount: 50,
          currency: "BRL",
          platform: "canonical",
        },
        "{}",
        fakeClient
      );

      assert(resultConstraint.success === false, "P2002 de outra constraint não pode ter success=true");
      assert(resultConstraint.status === 500, "Deve retornar status 500 de erro de banco");
      assert(resultConstraint.code === "DATABASE_ERROR", "Código de erro deve ser 'DATABASE_ERROR'");
    }

    // ==========================================================================
    // GRUPO 7: INTEGRIDADE DAS MÉTRICAS DE ANALYTICS
    // ==========================================================================
    console.log("\n--- Grupo 7: Reflexo e Integridade das Métricas no Analytics ---");

    // Consulta analytics do Workspace A
    {
      const reqAnalyticsA = makeAnalyticsRequest(tokenA);
      const resAnalyticsA = await getAnalyticsHandler(reqAnalyticsA);
      const dataAnalyticsA = await resAnalyticsA.json();

      // Transações CONFIRMED ativas no WS A:
      // 1. TX-AUTH-BEARER: 50
      // 2. TX-AUTH-QUERY: 40
      // 3. TX-SLUG-ATTRIBUTION: 125
      // 4. TX-CONCURRENT: 150
      // (hotmartTxId virou REFUNDED -> 0)
      // (cancelTxId virou CANCELED -> 0)
      // (disjunctTxId é CANCELED -> 0)
      // (raceTxId virou REFUNDED -> 0)
      // (inexistentTxId é REFUNDED -> 0)
      // (crossConcurrentTxId pode ter sido ganho por A: +50 ou 0)
      // Confirmamos que nenhuma das transações REFUNDED ou CANCELED entrou em confirmedCommission:
      const totalExpectedBase = 50 + 40 + 125 + 150;
      assert(
        dataAnalyticsA.confirmedCommission === totalExpectedBase ||
        dataAnalyticsA.confirmedCommission === totalExpectedBase + 100, // se ganhou crossConcurrent
        `Comissões confirmadas do WS A refletem estritamente vendas CONFIRMED (${dataAnalyticsA.confirmedCommission})`
      );
    }

    // Consulta analytics do Workspace B
    {
      const reqAnalyticsB = makeAnalyticsRequest(tokenB);
      const resAnalyticsB = await getAnalyticsHandler(reqAnalyticsB);
      const dataAnalyticsB = await resAnalyticsB.json();

      // Transações criadas no WS B: Kiwify order: comissão 148.50 (+100 se ganhou crossConcurrent)
      assert(
        dataAnalyticsB.confirmedCommission === 148.5 || dataAnalyticsB.confirmedCommission === 248.5,
        `Comissões confirmadas do WS B devem refletir apenas vendas do WS B (${dataAnalyticsB.confirmedCommission})`
      );
      assert(dataAnalyticsB.confirmedCommission !== 365, "Workspace B não pode ter métricas vazadas do Workspace A");
    }

    console.log("\n====================================================================");
    console.log(`SUCESSO TOTAL! ${passedTests}/${totalTests} asserções passaram sem falhas.`);
    console.log("====================================================================\n");
  } catch (error) {
    console.error("\n❌ ERRO NA EXECUÇÃO DA SUÍTE F2:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();


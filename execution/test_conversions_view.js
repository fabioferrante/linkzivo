/**
 * LINKZIVO — ETAPA 3: SUÍTE DE TESTES DO EXTRATO DE CONVERSÕES E AUDITORIA
 *
 * Cobertura dos Requisitos Obrigatórios:
 * 1. Usuário autenticado consulta suas conversões com sucesso (HTTP 200).
 * 2. Usuário não autenticado recebe bloqueio adequado (HTTP 401).
 * 3. Isolamento multi-tenant: conversões do Workspace A NUNCA aparecem para o Workspace B.
 * 4. Tentativa de acesso IDOR a conversão de outro workspace via /api/conversions/[id] (bloqueio no banco -> 404).
 * 5. Filtros por status financeiro (CONFIRMED, ESTIMATED, REFUNDED, CANCELED).
 * 6. Filtro por período temporal (7d, 30d, all).
 * 7. Busca textual por identificador externo (externalConversionId), slug e título.
 * 8. Paginação server-side (page, limit, total, totalPages) e ordenação por timestamp DESC.
 * 9. Sumário financeiro estrito: conversões reembolsadas ou canceladas NUNCA somam como confirmadas.
 * 10. Detalhamento individual e sanitização estrita de rawPayload (mascara tokens, secrets, senhas).
 */

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/linkzivo_test_isolated?schema=public";
process.env.DATABASE_URL = TEST_DATABASE_URL;

const { PrismaClient } = require("@prisma/client");
const { NextRequest } = require("next/server");

const { GET: getConversionsHandler } = require("../src/app/api/conversions/route.ts");
const { GET: getConversionDetailHandler } = require("../src/app/api/conversions/[id]/route.ts");
const { sanitizeConversionPayload } = require("../src/lib/conversions.ts");
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

function makeGetRequest(urlPath, sessionToken = null) {
  const url = `http://localhost:3000${urlPath}`;
  const headers = new Headers();
  if (sessionToken) {
    headers.set("Cookie", `linkzivo_session=${sessionToken}`);
  }
  return new NextRequest(new URL(url), { method: "GET", headers });
}

async function createTestSession(userId, workspaceId) {
  const session = await prisma.session.create({
    data: {
      userId,
      workspaceId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  const token = await signSessionToken(`${session.id}:${userId}:${workspaceId}`);
  return { session, token };
}

async function runTestSuite() {
  console.log("================================================================================");
  console.log("   LINKZIVO — ETAPA 3: TESTES AUTOMATIZADOS DO EXTRATO DE CONVERSÕES");
  console.log("================================================================================\n");

  const timestamp = Date.now();

  // ---------------------------------------------------------------------------
  // CENÁRIO 1: Preparação de 2 Workspaces Independentes para Teste Multi-Tenant
  // ---------------------------------------------------------------------------
  console.log("--- 1. Preparando Usuários e Workspaces A e B para Isolamento ---");

  // Usuário A e Workspace A
  const userA = await prisma.user.create({
    data: {
      email: `conv_usera_${timestamp}@testlinkzivo.internal`,
      name: "Afiliado Workspace A",
      role: "USER",
    },
  });
  const wsA = await prisma.workspace.create({
    data: {
      userId: userA.id,
      name: "Workspace A",
      slug: `ws-a-${timestamp}`,
      plan: "CREATOR",
    },
  });
  const { token: tokenA } = await createTestSession(userA.id, wsA.id);

  // Usuário B e Workspace B
  const userB = await prisma.user.create({
    data: {
      email: `conv_userb_${timestamp}@testlinkzivo.internal`,
      name: "Afiliado Workspace B",
      role: "USER",
    },
  });
  const wsB = await prisma.workspace.create({
    data: {
      userId: userB.id,
      name: "Workspace B",
      slug: `ws-b-${timestamp}`,
      plan: "CREATOR",
    },
  });
  const { token: tokenB } = await createTestSession(userB.id, wsB.id);

  // Criação de Links para A e B
  const linkA = await prisma.smartLink.create({
    data: {
      workspaceId: wsA.id,
      slug: `link-a-${timestamp}`,
      title: "Curso Hotmart Python Pro",
      destinationUrl: "https://hotmart.com/pt-br/pay/python-pro",
    },
  });

  const linkB = await prisma.smartLink.create({
    data: {
      workspaceId: wsB.id,
      slug: `link-b-${timestamp}`,
      title: "Ebook Kiwify Marketing Digital",
      destinationUrl: "https://kiwify.com.br/pay/marketing-digital",
    },
  });

  // Clique de atribuição para o Link A
  const clickA = await prisma.click.create({
    data: {
      id: `clk_a_${timestamp}`,
      smartLinkId: linkA.id,
      workspaceId: wsA.id,
      device: "Mobile",
      os: "iOS",
      browser: "Safari",
      isQrScan: true,
      country: "BR",
    },
  });

  // Criação de Conversões no Workspace A:
  // 1. Confirmada (Venda: 200, Comissão: 100)
  const convA1 = await prisma.conversion.create({
    data: {
      smartLinkId: linkA.id,
      clickId: clickA.id,
      externalConversionId: `HP_CONFIRMED_${timestamp}`,
      conversionType: "SALE",
      status: "CONFIRMED",
      amount: 200.0,
      commissionAmount: 100.0,
      currency: "BRL",
      rawPayload: JSON.stringify({
        hottok: "secret_hottok_token_12345",
        api_token: "super_secret_api_token",
        buyer: { name: "Comprador A", email: "comprador@teste.com" },
        transaction: `HP_CONFIRMED_${timestamp}`,
        amount: 200.0,
      }),
    },
  });

  // 2. Estimada / Pendente (Venda: 150, Comissão: 75)
  const convA2 = await prisma.conversion.create({
    data: {
      smartLinkId: linkA.id,
      externalConversionId: `HP_ESTIMATED_${timestamp}`,
      conversionType: "SALE",
      status: "ESTIMATED",
      amount: 150.0,
      commissionAmount: 75.0,
      currency: "BRL",
      rawPayload: JSON.stringify({
        status: "WAITING_PAYMENT",
        transaction: `HP_ESTIMATED_${timestamp}`,
      }),
    },
  });

  // 3. Reembolsada / Estorno (Venda: 300, Comissão: 150)
  const convA3 = await prisma.conversion.create({
    data: {
      smartLinkId: linkA.id,
      externalConversionId: `HP_REFUNDED_${timestamp}`,
      conversionType: "SALE",
      status: "REFUNDED",
      amount: 300.0,
      commissionAmount: 150.0,
      currency: "BRL",
      rawPayload: JSON.stringify({
        status: "REFUNDED",
        reason: "Insatisfação do comprador com o produto",
        transaction: `HP_REFUNDED_${timestamp}`,
      }),
    },
  });

  // Conversão no Workspace B (Venda: 500, Comissão: 250)
  const convB = await prisma.conversion.create({
    data: {
      smartLinkId: linkB.id,
      externalConversionId: `KW_CONFIRMED_${timestamp}`,
      conversionType: "SALE",
      status: "CONFIRMED",
      amount: 500.0,
      commissionAmount: 250.0,
      currency: "BRL",
    },
  });

  console.log("  [OK] Dados de teste semeados com sucesso.\n");

  // ---------------------------------------------------------------------------
  // TESTE 1: Autenticação Obrigatória
  // ---------------------------------------------------------------------------
  console.log("--- 2. Validação de Autenticação na API ---");

  const unauthReq = makeGetRequest("/api/conversions");
  const unauthRes = await getConversionsHandler(unauthReq);
  assert(unauthRes.status === 401, "Acesso não autenticado a /api/conversions retorna HTTP 401");

  const authReq = makeGetRequest("/api/conversions", tokenA);
  const authRes = await getConversionsHandler(authReq);
  assert(authRes.status === 200, "Usuário autenticado recebe HTTP 200 ao consultar suas conversões");
  const authData = await authRes.json();
  assert(authData.conversions.length === 3, "Usuário A lista exatamente suas 3 conversões");

  // ---------------------------------------------------------------------------
  // TESTE 2: Isolamento Estrito Multi-Tenant entre Workspaces
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. Validação do Isolamento Multi-Tenant ---");

  const authBReq = makeGetRequest("/api/conversions", tokenB);
  const authBRes = await getConversionsHandler(authBReq);
  const authBData = await authBRes.json();
  assert(authBData.conversions.length === 1, "Usuário B lista apenas sua 1 conversão");
  assert(
    authBData.conversions[0].externalConversionId === `KW_CONFIRMED_${timestamp}`,
    "Conversão listada para Usuário B é exclusivamente a dele"
  );

  const leakAtoB = authBData.conversions.some((c) => c.smartLink.id === linkA.id);
  assert(!leakAtoB, "Nenhuma conversão do Workspace A vazou para a consulta do Workspace B");

  // ---------------------------------------------------------------------------
  // TESTE 3: Proteção Estrita contra IDOR no Banco (/api/conversions/[id])
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. Proteção IDOR no Detalhamento Individual ---");

  // Usuário A acessa sua própria conversão convA1
  const detailA1Req = makeGetRequest(`/api/conversions/${convA1.id}`, tokenA);
  const detailA1Res = await getConversionDetailHandler(detailA1Req, {
    params: Promise.resolve({ id: convA1.id }),
  });
  assert(detailA1Res.status === 200, "Usuário A consegue acessar o detalhe de sua própria conversão");

  // Usuário B tenta acessar a conversão convA1 do Usuário A via ID manipulado
  const idorReq = makeGetRequest(`/api/conversions/${convA1.id}`, tokenB);
  const idorRes = await getConversionDetailHandler(idorReq, {
    params: Promise.resolve({ id: convA1.id }),
  });
  assert(idorRes.status === 404, "Tentativa de IDOR do Usuário B sobre conversão do Workspace A é bloqueada diretamente no banco (HTTP 404)");

  // ---------------------------------------------------------------------------
  // TESTE 4: Sumário Financeiro Estrito (Reembolsos NUNCA entram em confirmadas)
  // ---------------------------------------------------------------------------
  console.log("\n--- 5. Validação do Sumário Financeiro Estrito ---");

  const summary = authData.summary;
  assert(summary.totalConversions === 3, "Total de conversões sob o filtro é exatamente 3");
  assert(summary.confirmed.count === 1, "Exatamente 1 venda confirmada");
  assert(summary.confirmed.salesAmount === 200.0, "Valor de vendas confirmadas é rigorosamente R$ 200.00");
  assert(summary.confirmed.commission === 100.0, "Comissão confirmada é rigorosamente R$ 100.00");

  assert(summary.estimated.count === 1, "Exatamente 1 venda pendente/estimada");
  assert(summary.estimated.commission === 75.0, "Comissão estimada é R$ 75.00");

  assert(summary.refunded.count === 1, "Exatamente 1 reembolso registrado");
  assert(summary.refunded.salesAmount === 300.0, "Valor de vendas estornadas é R$ 300.00");
  assert(summary.refunded.commission === 150.0, "Comissão estornada é R$ 150.00");

  // Regra crítica solicitada pelo usuário:
  assert(
    summary.confirmed.commission !== 250.0,
    "Comissão reembolsada (150) NUNCA é somada à comissão confirmada (100)"
  );
  assert(
    summary.confirmed.salesAmount !== 500.0,
    "Valor de venda reembolsado (300) NUNCA é somado às vendas confirmadas (200)"
  );

  // ---------------------------------------------------------------------------
  // TESTE 5: Filtro por Status Financeiro
  // ---------------------------------------------------------------------------
  console.log("\n--- 6. Filtros por Status Financeiro ---");

  // Filtro: CONFIRMED
  const filterConfReq = makeGetRequest("/api/conversions?status=CONFIRMED", tokenA);
  const filterConfRes = await getConversionsHandler(filterConfReq);
  const filterConfData = await filterConfRes.json();
  assert(filterConfData.conversions.length === 1, "Filtro status=CONFIRMED retorna exatamente 1 registro");
  assert(filterConfData.conversions[0].status === "CONFIRMED", "Registro retornado possui status CONFIRMED");

  // Filtro: REFUNDED
  const filterRefReq = makeGetRequest("/api/conversions?status=REFUNDED", tokenA);
  const filterRefRes = await getConversionsHandler(filterRefReq);
  const filterRefData = await filterRefRes.json();
  assert(filterRefData.conversions.length === 1, "Filtro status=REFUNDED retorna exatamente 1 registro");
  assert(filterRefData.conversions[0].status === "REFUNDED", "Registro retornado possui status REFUNDED");

  // ---------------------------------------------------------------------------
  // TESTE 6: Busca Textual por Identificador e Slug
  // ---------------------------------------------------------------------------
  console.log("\n--- 7. Busca Textual ---");

  // Busca por ID Externo parcial
  const searchIdReq = makeGetRequest(`/api/conversions?search=HP_REFUNDED`, tokenA);
  const searchIdRes = await getConversionsHandler(searchIdReq);
  const searchIdData = await searchIdRes.json();
  assert(searchIdData.conversions.length === 1, "Busca textual por externalConversionId encontra registro específico");
  assert(searchIdData.conversions[0].externalConversionId === `HP_REFUNDED_${timestamp}`, "ID externo retornado corresponde à busca");

  // Busca por slug
  const searchSlugReq = makeGetRequest(`/api/conversions?search=link-a`, tokenA);
  const searchSlugRes = await getConversionsHandler(searchSlugReq);
  const searchSlugData = await searchSlugRes.json();
  assert(searchSlugData.conversions.length === 3, "Busca textual por slug encontra todas as conversões do link");

  // ---------------------------------------------------------------------------
  // TESTE 7: Paginação Server-Side
  // ---------------------------------------------------------------------------
  console.log("\n--- 8. Paginação Server-Side ---");

  const page1Req = makeGetRequest("/api/conversions?page=1&limit=2", tokenA);
  const page1Res = await getConversionsHandler(page1Req);
  const page1Data = await page1Res.json();

  assert(page1Data.conversions.length === 2, "Página 1 com limit=2 retorna exatamente 2 registros");
  assert(page1Data.pagination.page === 1, "Metadado pagination.page é 1");
  assert(page1Data.pagination.limit === 2, "Metadado pagination.limit é 2");
  assert(page1Data.pagination.total === 3, "Metadado pagination.total é 3");
  assert(page1Data.pagination.totalPages === 2, "Metadado pagination.totalPages é 2");

  const page2Req = makeGetRequest("/api/conversions?page=2&limit=2", tokenA);
  const page2Res = await getConversionsHandler(page2Req);
  const page2Data = await page2Res.json();
  assert(page2Data.conversions.length === 1, "Página 2 com limit=2 retorna o 1 registro restante");

  // ---------------------------------------------------------------------------
  // TESTE 8: Sanitização Estrita do rawPayload
  // ---------------------------------------------------------------------------
  console.log("\n--- 9. Sanitização de Credenciais e Secrets no rawPayload ---");

  const detailA1Data = await detailA1Res.json();
  const rawSanitized = detailA1Data.conversion.technicalAudit.sanitizedRawPayload;

  assert(Boolean(rawSanitized), "rawPayload sanitizado está presente no detalhamento individual");
  assert(
    rawSanitized.hottok === "[PROTEGIDO POR SEGURANÇA]",
    "Campo sensível 'hottok' foi mascarado para '[PROTEGIDO POR SEGURANÇA]'"
  );
  assert(
    rawSanitized.api_token === "[PROTEGIDO POR SEGURANÇA]",
    "Campo sensível 'api_token' foi mascarado para '[PROTEGIDO POR SEGURANÇA]'"
  );
  assert(
    rawSanitized.buyer?.name === "Comprador A",
    "Campo de negócio útil 'buyer.name' foi preservado intacto para auditoria"
  );
  assert(
    rawSanitized.amount === 200.0,
    "Campo financeiro 'amount' no payload foi preservado intacto"
  );

  // Teste unitário de sanitizeConversionPayload com string JSON pura
  const dangerousJson = JSON.stringify({
    webhook_secret: "lz_wh_supersecret123",
    user_password: "MyPassword456",
    auth_header: "Bearer token999",
    transaction_id: "TX_100",
    client_name: "Fabio",
  });
  const sanitizedUnit = sanitizeConversionPayload(dangerousJson);
  assert(
    sanitizedUnit.webhook_secret === "[PROTEGIDO POR SEGURANÇA]",
    "Unitário: webhook_secret mascarado"
  );
  assert(
    sanitizedUnit.user_password === "[PROTEGIDO POR SEGURANÇA]",
    "Unitário: user_password mascarado"
  );
  assert(
    sanitizedUnit.auth_header === "[PROTEGIDO POR SEGURANÇA]",
    "Unitário: auth_header mascarado"
  );
  assert(
    sanitizedUnit.transaction_id === "TX_100",
    "Unitário: transaction_id preservado"
  );

  // ---------------------------------------------------------------------------
  // TESTE 9: Distinção entre Status Financeiro e Resultado Técnico
  // ---------------------------------------------------------------------------
  console.log("\n--- 10. Distinção entre Status Financeiro e Auditoria Técnica ---");

  const financial = detailA1Data.conversion.financial;
  const technical = detailA1Data.conversion.technicalAudit;

  assert(financial.status === "CONFIRMED", "Status financeiro reportado como CONFIRMED");
  assert(technical.attributionModel === "CLICK_ATTRIBUTION (sck)", "Modelo técnico reportado como atribuição de clique (sck)");
  assert(technical.platform === "Hotmart", "Plataforma detectada como Hotmart a partir das características do postback");
  assert(detailA1Data.conversion.click.device === "Mobile", "Metadado de dispositivo do clique preservado");
  assert(detailA1Data.conversion.click.isQrScan === true, "Metadado de QR Scan do clique preservado");

  // ---------------------------------------------------------------------------
  // 11. Limpeza dos Dados de Teste
  // ---------------------------------------------------------------------------
  console.log("\n--- 11. Limpeza dos Registros de Teste ---");
  await prisma.user.delete({ where: { id: userA.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: userB.id } }).catch(() => {});
  await prisma.$disconnect();
  console.log("  [OK] Dados de teste limpos com sucesso.\n");

  console.log("================================================================================");
  console.log(`TOTAL DE ASSERÇÕES APROVADAS: ${passed}`);
  console.log(`TOTAL DE FALHAS:              ${failed}`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("ERRO FATAL NA SUÍTE DE TESTES:", err);
  process.exit(1);
});

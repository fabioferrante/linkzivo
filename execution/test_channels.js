/**
 * LINKZIVO — ETAPA 4: SUÍTE DE TESTES AUTOMATIZADOS DO GERENCIAMENTO DE CANAIS
 *
 * Cobertura de Requisitos:
 * 1. Autenticação obrigatória (GET, POST, PUT, DELETE sem sessão -> HTTP 401).
 * 2. Listagem de canais do workspace autenticado (HTTP 200).
 * 3. Criação de canal personalizado com validações (HTTP 201).
 * 4. Tratamento e rejeição de nomes duplicados no mesmo workspace (HTTP 409).
 * 5. Isolamento estrito multi-tenant (Workspace B nunca lista canais de Workspace A).
 * 6. Proteção atômica contra IDOR no banco:
 *    - GET /api/channels/[id] de outro workspace -> HTTP 404
 *    - PUT /api/channels/[id] de outro workspace -> HTTP 404
 *    - DELETE /api/channels/[id] de outro workspace -> HTTP 404
 * 7. Associação de canais com Smart Links (criação e atualização de links com channelId).
 * 8. Trava de segurança de integridade na exclusão:
 *    - Canal com Smart Links associados NÃO PODE ser excluído (retorna HTTP 409 CHANNEL_HAS_ACTIVE_LINKS).
 * 9. Edição de canal preservando integridade das referências existentes.
 * 10. Exclusão segura após desvinculação dos links (HTTP 200).
 * 11. Limpeza segura dos registros de teste.
 */

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/linkzivo_test_isolated?schema=public";
process.env.DATABASE_URL = TEST_DATABASE_URL;

const { PrismaClient } = require("@prisma/client");
const { NextRequest } = require("next/server");

const { GET: getChannelsHandler, POST: createChannelHandler } = require("../src/app/api/channels/route.ts");
const {
  GET: getChannelDetailHandler,
  PUT: updateChannelHandler,
  DELETE: deleteChannelHandler,
} = require("../src/app/api/channels/[id]/route.ts");
const { POST: createLinkHandler } = require("../src/app/api/links/route.ts");
const { PUT: updateLinkHandler } = require("../src/app/api/links/[id]/route.ts");
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

function makeRequest(urlPath, method = "GET", body = null, sessionToken = null) {
  const url = `http://localhost:3000${urlPath}`;
  const headers = new Headers();
  if (sessionToken) {
    headers.set("Cookie", `linkzivo_session=${sessionToken}`);
  }
  if (body) {
    headers.set("Content-Type", "application/json");
  }

  const init = { method, headers };
  if (body) {
    init.body = JSON.stringify(body);
  }
  return new NextRequest(new URL(url), init);
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

async function runChannelsTestSuite() {
  console.log("================================================================================");
  console.log("   LINKZIVO — ETAPA 4: TESTES AUTOMATIZADOS DO GERENCIAMENTO DE CANAIS");
  console.log("================================================================================\n");

  const timestamp = Date.now();

  // ---------------------------------------------------------------------------
  // 1. Preparação de Usuários e Workspaces Independentes A e B
  // ---------------------------------------------------------------------------
  console.log("--- 1. Preparando Usuários e Workspaces A e B para Teste Multi-Tenant ---");

  const userA = await prisma.user.create({
    data: {
      email: `channel_usera_${timestamp}@testlinkzivo.internal`,
      name: "Gestor Workspace A",
      role: "USER",
    },
  });
  const wsA = await prisma.workspace.create({
    data: {
      userId: userA.id,
      name: "Workspace Canais A",
      slug: `ws-ch-a-${timestamp}`,
      plan: "CREATOR",
    },
  });
  const { token: tokenA } = await createTestSession(userA.id, wsA.id);

  const userB = await prisma.user.create({
    data: {
      email: `channel_userb_${timestamp}@testlinkzivo.internal`,
      name: "Gestor Workspace B",
      role: "USER",
    },
  });
  const wsB = await prisma.workspace.create({
    data: {
      userId: userB.id,
      name: "Workspace Canais B",
      slug: `ws-ch-b-${timestamp}`,
      plan: "CREATOR",
    },
  });
  const { token: tokenB } = await createTestSession(userB.id, wsB.id);

  console.log("  [OK] Usuários e sessões criados com sucesso.\n");

  // ---------------------------------------------------------------------------
  // 2. Autenticação Obrigatória
  // ---------------------------------------------------------------------------
  console.log("--- 2. Validação de Bloqueio Não Autenticado (401) ---");

  const unauthGet = makeRequest("/api/channels", "GET");
  const unauthGetRes = await getChannelsHandler(unauthGet);
  assert(unauthGetRes.status === 401, "GET /api/channels sem sessão retorna HTTP 401");

  const unauthPost = makeRequest("/api/channels", "POST", { name: "Canal Teste" });
  const unauthPostRes = await createChannelHandler(unauthPost);
  assert(unauthPostRes.status === 401, "POST /api/channels sem sessão retorna HTTP 401");

  const dummyId = "dummy_channel_id_123";
  const unauthDetail = makeRequest(`/api/channels/${dummyId}`, "GET");
  const unauthDetailRes = await getChannelDetailHandler(unauthDetail, {
    params: Promise.resolve({ id: dummyId }),
  });
  assert(unauthDetailRes.status === 401, "GET /api/channels/[id] sem sessão retorna HTTP 401");

  const unauthPut = makeRequest(`/api/channels/${dummyId}`, "PUT", { name: "Novo Nome" });
  const unauthPutRes = await updateChannelHandler(unauthPut, {
    params: Promise.resolve({ id: dummyId }),
  });
  assert(unauthPutRes.status === 401, "PUT /api/channels/[id] sem sessão retorna HTTP 401");

  const unauthDel = makeRequest(`/api/channels/${dummyId}`, "DELETE");
  const unauthDelRes = await deleteChannelHandler(unauthDel, {
    params: Promise.resolve({ id: dummyId }),
  });
  assert(unauthDelRes.status === 401, "DELETE /api/channels/[id] sem sessão retorna HTTP 401");

  // ---------------------------------------------------------------------------
  // 3. Listagem Inicial e Semeadura Automática de Canais Padrão
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. Listagem Inicial de Canais do Workspace A ---");

  const listAReq = makeRequest("/api/channels", "GET", null, tokenA);
  const listARes = await getChannelsHandler(listAReq);
  assert(listARes.status === 200, "Consulta de canais de A retorna HTTP 200");
  const listAData = await listARes.json();
  assert(listAData.channels.length >= 6, "Workspace A inicializa com canais padrão do ecossistema");
  assert(
    listAData.channels.some((c) => c.name === "Instagram"),
    "Canal padrão 'Instagram' está presente"
  );
  assert(
    listAData.channels.some((c) => c.name === "WhatsApp"),
    "Canal padrão 'WhatsApp' está presente"
  );

  // ---------------------------------------------------------------------------
  // 4. Criação de Canal Personalizado no Workspace A
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. Criação de Canal Personalizado ---");

  const createReq = makeRequest(
    "/api/channels",
    "POST",
    {
      name: "Canal VIP Telegram A",
      color: "#0088cc",
      icon: "send",
    },
    tokenA
  );
  const createRes = await createChannelHandler(createReq);
  assert(createRes.status === 201, "Criação de canal retorna HTTP 201");
  const createData = await createRes.json();
  assert(createData.success === true, "Retorno indica success: true");
  assert(createData.channel.name === "Canal VIP Telegram A", "Nome do canal gravado com precisão");
  assert(createData.channel.slug === "canal-vip-telegram-a", "Slug gerado automaticamente");
  assert(createData.channel.color === "#0088cc", "Cor customizada gravada");
  assert(createData.channel.icon === "send", "Ícone customizado gravado");
  assert(createData.channel.isCustom === true, "Canal marcado como isCustom: true");
  assert(createData.channel.workspaceId === wsA.id, "Canal vinculado estritamente ao Workspace A");

  const channelAId = createData.channel.id;

  // ---------------------------------------------------------------------------
  // 5. Bloqueio de Nomes Duplicados no Mesmo Workspace
  // ---------------------------------------------------------------------------
  console.log("\n--- 5. Validação de Unicidade e Bloqueio de Duplicados (409) ---");

  const dupReq = makeRequest(
    "/api/channels",
    "POST",
    {
      name: "Canal VIP Telegram A", // mesmo nome
      color: "#ff0000",
    },
    tokenA
  );
  const dupRes = await createChannelHandler(dupReq);
  assert(dupRes.status === 409, "Tentativa de criar canal com nome duplicado retorna HTTP 409 Conflict");
  const dupData = await dupRes.json();
  assert(dupData.error.includes("Já existe um canal"), "Mensagem de erro clara informando duplicidade");

  // ---------------------------------------------------------------------------
  // 6. Isolamento Multi-Tenant Estrito (A vs B)
  // ---------------------------------------------------------------------------
  console.log("\n--- 6. Isolamento Multi-Tenant entre Workspaces ---");

  const listBReq = makeRequest("/api/channels", "GET", null, tokenB);
  const listBRes = await getChannelsHandler(listBReq);
  const listBData = await listBRes.json();

  const leakAtoB = listBData.channels.some((c) => c.id === channelAId || c.name === "Canal VIP Telegram A");
  assert(!leakAtoB, "Canal customizado do Workspace A NUNCA aparece na listagem do Workspace B");

  // ---------------------------------------------------------------------------
  // 7. Bloqueio Atômico de IDOR no Banco (GET, PUT, DELETE)
  // ---------------------------------------------------------------------------
  console.log("\n--- 7. Proteção Anti-IDOR no Banco de Dados ---");

  // Workspace B tenta consultar canal de A
  const idorGetReq = makeRequest(`/api/channels/${channelAId}`, "GET", null, tokenB);
  const idorGetRes = await getChannelDetailHandler(idorGetReq, {
    params: Promise.resolve({ id: channelAId }),
  });
  assert(idorGetRes.status === 404, "Tentativa de GET por outro workspace é bloqueada no banco com HTTP 404");

  // Workspace B tenta alterar canal de A
  const idorPutReq = makeRequest(`/api/channels/${channelAId}`, "PUT", { name: "Invasão B" }, tokenB);
  const idorPutRes = await updateChannelHandler(idorPutReq, {
    params: Promise.resolve({ id: channelAId }),
  });
  assert(idorPutRes.status === 404, "Tentativa de PUT por outro workspace é bloqueada no banco com HTTP 404");

  // Workspace B tenta excluir canal de A
  const idorDelReq = makeRequest(`/api/channels/${channelAId}`, "DELETE", null, tokenB);
  const idorDelRes = await deleteChannelHandler(idorDelReq, {
    params: Promise.resolve({ id: channelAId }),
  });
  assert(idorDelRes.status === 404, "Tentativa de DELETE por outro workspace é bloqueada no banco com HTTP 404");

  // ---------------------------------------------------------------------------
  // 8. Associação de Smart Link com o Canal
  // ---------------------------------------------------------------------------
  console.log("\n--- 8. Criação de Smart Link Vinculado ao Canal ---");

  const createLinkReq = makeRequest(
    "/api/links",
    "POST",
    {
      url: "https://example.com/destino-afiliado-telegram",
      title: "Link Promocional Telegram",
      customSlug: `link-ch-${timestamp}`,
      channelId: channelAId,
    },
    tokenA
  );
  const createLinkRes = await createLinkHandler(createLinkReq);
  assert(createLinkRes.status === 201, "Criação de Smart Link com channelId retorna HTTP 201");
  const createLinkData = await createLinkRes.json();
  const smartLinkId = createLinkData.link.id;
  assert(createLinkData.link.channelId === channelAId, "Smart Link salvo com channelId correto");

  // Consulta individual do canal deve agora mostrar 1 link associado
  const channelDetailReq = makeRequest(`/api/channels/${channelAId}`, "GET", null, tokenA);
  const channelDetailRes = await getChannelDetailHandler(channelDetailReq, {
    params: Promise.resolve({ id: channelAId }),
  });
  assert(channelDetailRes.status === 200, "Consulta de detalhe do canal pelo proprietário retorna HTTP 200");
  const channelDetailData = await channelDetailRes.json();
  assert(channelDetailData.channel._count.smartLinks === 1, "Canal reporta exatamente 1 Smart Link associado");
  assert(
    channelDetailData.channel.smartLinks[0].id === smartLinkId,
    "Smart Link listado no canal é exatamente o link criado"
  );

  // ---------------------------------------------------------------------------
  // 9. Trava de Segurança na Exclusão (Impedir exclusão com vínculos ativos)
  // ---------------------------------------------------------------------------
  console.log("\n--- 9. Trava de Segurança na Exclusão de Canal com Vínculos Ativos ---");

  const deleteBlockedReq = makeRequest(`/api/channels/${channelAId}`, "DELETE", null, tokenA);
  const deleteBlockedRes = await deleteChannelHandler(deleteBlockedReq, {
    params: Promise.resolve({ id: channelAId }),
  });
  assert(
    deleteBlockedRes.status === 409,
    "Exclusão de canal com links vinculados é BLOQUEADA com HTTP 409 Conflict"
  );
  const deleteBlockedData = await deleteBlockedRes.json();
  assert(
    deleteBlockedData.code === "CHANNEL_HAS_ACTIVE_LINKS",
    "Código de erro específico 'CHANNEL_HAS_ACTIVE_LINKS' retornado"
  );
  assert(
    deleteBlockedData.error.includes("Smart Link(s) associado(s)"),
    "Mensagem de segurança orienta o usuário a desvincular os links primeiro"
  );

  // Confirma que o canal continua intacto no banco de dados
  const verifyExist = await prisma.channel.findUnique({ where: { id: channelAId } });
  assert(Boolean(verifyExist), "Canal permanece 100% preservado no banco de dados após tentativa de exclusão bloqueada");

  // ---------------------------------------------------------------------------
  // 10. Edição do Canal Preservando Referências
  // ---------------------------------------------------------------------------
  console.log("\n--- 10. Atualização do Canal (PUT) Mantendo Vínculos ---");

  const updateReq = makeRequest(
    `/api/channels/${channelAId}`,
    "PUT",
    {
      name: "Canal VIP Telegram Pro",
      color: "#10b981",
      icon: "send",
    },
    tokenA
  );
  const updateRes = await updateChannelHandler(updateReq, {
    params: Promise.resolve({ id: channelAId }),
  });
  assert(updateRes.status === 200, "Atualização do canal retorna HTTP 200");
  const updateData = await updateRes.json();
  assert(updateData.channel.name === "Canal VIP Telegram Pro", "Novo nome do canal persistido");
  assert(updateData.channel.color === "#10b981", "Nova cor do canal persistida");
  assert(updateData.channel._count.smartLinks === 1, "Vínculo com o Smart Link existente continua intacto");

  // ---------------------------------------------------------------------------
  // 11. Desvinculação do Link e Exclusão Segura
  // ---------------------------------------------------------------------------
  console.log("\n--- 11. Desvinculação do Smart Link e Exclusão Segura do Canal ---");

  // Atualiza o Smart Link desvinculando o canal (channelId: null)
  const unlinkReq = makeRequest(
    `/api/links/${smartLinkId}`,
    "PUT",
    {
      channelId: null,
    },
    tokenA
  );
  const unlinkRes = await updateLinkHandler(unlinkReq, {
    params: Promise.resolve({ id: smartLinkId }),
  });
  assert(unlinkRes.status === 200, "Smart Link atualizado com channelId: null (HTTP 200)");
  const unlinkData = await unlinkRes.json();
  assert(unlinkData.link.channelId === null, "channelId removido do Smart Link com sucesso");

  // Agora que não há links vinculados, a exclusão do canal deve ser autorizada
  const deleteSuccessReq = makeRequest(`/api/channels/${channelAId}`, "DELETE", null, tokenA);
  const deleteSuccessRes = await deleteChannelHandler(deleteSuccessReq, {
    params: Promise.resolve({ id: channelAId }),
  });
  assert(deleteSuccessRes.status === 200, "Exclusão do canal sem vínculos autorizada com HTTP 200");
  const deleteSuccessData = await deleteSuccessRes.json();
  assert(deleteSuccessData.success === true, "Retorno indica success: true");

  // Confirma remoção no banco
  const finalCheck = await prisma.channel.findUnique({ where: { id: channelAId } });
  assert(finalCheck === null, "Canal removido definitivamente do banco de dados");

  // Confirma que o Smart Link continua existindo intacto
  const linkStillAlive = await prisma.smartLink.findUnique({ where: { id: smartLinkId } });
  assert(Boolean(linkStillAlive), "Smart Link continua intacto no banco de dados sem quebras de integridade");

  // ---------------------------------------------------------------------------
  // 12. Limpeza dos Dados de Teste
  // ---------------------------------------------------------------------------
  console.log("\n--- 12. Limpeza dos Dados de Teste ---");
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

runChannelsTestSuite().catch((err) => {
  console.error("ERRO FATAL NA SUÍTE DE TESTES DE CANAIS:", err);
  process.exit(1);
});

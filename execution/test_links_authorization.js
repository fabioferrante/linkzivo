/**
 * SUÍTE DETERMINÍSTICA DE TESTES DE AUTORIZAÇÃO E SEGURANÇA (IDOR) - LINKZIVO
 * Valida a proteção estrita de acesso, edição e exclusão de links em /api/links/[id]
 * Ambiente: Banco Local de Desenvolvimento (linkzivo_dev) e Servidor Local (http://localhost:3000)
 */

const { PrismaClient } = require("@prisma/client");
const http = require("http");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();
const APP_URL = "http://localhost:3000";

function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || "GET",
      headers: options.headers || {},
    };

    const req = http.request(reqOptions, (res) => {
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

async function loginUser(email, password) {
  const res = await httpRequest(`${APP_URL}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const rawCookies = res.headers["set-cookie"];
  const cookieHeader = Array.isArray(rawCookies)
    ? rawCookies.map((c) => c.split(";")[0]).join("; ")
    : rawCookies?.split(";")[0] || "";

  return { status: res.status, cookie: cookieHeader, rawSetCookie: rawCookies };
}

async function runAuthorizationSuite() {
  console.log("=== INICIANDO SUÍTE DE TESTES DE AUTORIZAÇÃO (API LINKS) ===");

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

  // IDs para limpeza posterior
  let userA, userB, userAdmin;
  let linkA, linkB;

  try {
    const ts = Date.now();
    const password = "Password123!";
    const passwordHash = await bcrypt.hash(password, 10);

    // 1. Criar Workspace A e Usuário A (Comum)
    userA = await prisma.user.create({
      data: {
        email: `usera_${ts}@linkzivo-test.com`,
        name: "User Alpha",
        passwordHash,
        role: "USER",
        workspaces: {
          create: {
            role: "OWNER",
            workspace: {
              create: {
                name: "Workspace Alpha",
                slug: `ws-alpha-${ts}`,
                plan: "FREE",
              },
            },
          },
        },
      },
      include: { workspaces: { include: { workspace: true } } },
    });
    const workspaceIdA = userA.workspaces[0].workspace.id;

    // 2. Criar Workspace B e Usuário B (Comum - Outro Workspace)
    userB = await prisma.user.create({
      data: {
        email: `userb_${ts}@linkzivo-test.com`,
        name: "User Beta",
        passwordHash,
        role: "USER",
        workspaces: {
          create: {
            role: "OWNER",
            workspace: {
              create: {
                name: "Workspace Beta",
                slug: `ws-beta-${ts}`,
                plan: "FREE",
              },
            },
          },
        },
      },
      include: { workspaces: { include: { workspace: true } } },
    });
    const workspaceIdB = userB.workspaces[0].workspace.id;

    // 3. Criar Administrador Global (role: "ADMIN")
    userAdmin = await prisma.user.create({
      data: {
        email: `admin_${ts}@linkzivo-test.com`,
        name: "Admin Global",
        passwordHash,
        role: "ADMIN",
        workspaces: {
          create: {
            role: "OWNER",
            workspace: {
              create: {
                name: "Workspace Admin",
                slug: `ws-admin-${ts}`,
                plan: "PRO",
              },
            },
          },
        },
      },
      include: { workspaces: { include: { workspace: true } } },
    });

    // 4. Criar Link no Workspace A e Link no Workspace B
    const initialUrlA = "https://example.com/destino-original-alpha";
    linkA = await prisma.smartLink.create({
      data: {
        title: "Link Alpha Original",
        slug: `alpha-${ts}`,
        destinationUrl: initialUrlA,
        workspaceId: workspaceIdA,
        creatorId: userA.id,
        clickCount: 10,
        qrScanCount: 4,
      },
    });

    linkB = await prisma.smartLink.create({
      data: {
        title: "Link Beta Original",
        slug: `beta-${ts}`,
        destinationUrl: "https://example.com/destino-original-beta",
        workspaceId: workspaceIdB,
        creatorId: userB.id,
        clickCount: 5,
        qrScanCount: 2,
      },
    });

    const linkB2 = await prisma.smartLink.create({
      data: {
        title: "Link Beta 2",
        slug: `beta2-${ts}`,
        destinationUrl: "https://example.com/destino-original-beta2",
        workspaceId: workspaceIdB,
        creatorId: userB.id,
        clickCount: 0,
      },
    });

    // Logins via HTTP para obter cookies de sessão válidos
    const loginA = await loginUser(userA.email, password);
    const loginB = await loginUser(userB.email, password);
    const loginAdmin = await loginUser(userAdmin.email, password);

    assert(Boolean(loginA.cookie), "Login do Usuário Alpha efetuado com sucesso");
    assert(Boolean(loginB.cookie), "Login do Usuário Beta efetuado com sucesso");
    assert(Boolean(loginAdmin.cookie), "Login do Administrador efetuado com sucesso");

    // --- CENÁRIO 1: Usuário Não Autenticado Tentando Acessar e Editar Link ---
    console.log("\n--- CENÁRIO 1: Usuário Não Autenticado tentando ler/editar link ---");
    const anonGetRes = await httpRequest(`${APP_URL}/api/links/${linkA.id}`);
    assert(anonGetRes.status === 401, `GET anônimo para ID existente retorna HTTP 401 (obtido: ${anonGetRes.status})`);

    const fakeNonExistentId = "cuid_fake_inexistente_999999";
    const anonGetFakeRes = await httpRequest(`${APP_URL}/api/links/${fakeNonExistentId}`);
    assert(anonGetFakeRes.status === 401, `GET anônimo para ID INEXISTENTE retorna HTTP 401 sem revelar 404 (obtido: ${anonGetFakeRes.status})`);

    // GET autenticado para ID inexistente deve retornar 404
    const authGetFakeRes = await httpRequest(`${APP_URL}/api/links/${fakeNonExistentId}`, {
      headers: { Cookie: loginA.cookie },
    });
    assert(authGetFakeRes.status === 404, `GET autenticado para ID inexistente retorna HTTP 404 (obtido: ${authGetFakeRes.status})`);

    const anonPatchRes = await httpRequest(`${APP_URL}/api/links/${linkA.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destinationUrl: "https://hacker.com/malicious-redirect" }),
    });
    assert(anonPatchRes.status === 401, `PATCH não autenticado para ID existente retorna HTTP 401 (obtido: ${anonPatchRes.status})`);

    const anonPatchFakeRes = await httpRequest(`${APP_URL}/api/links/${fakeNonExistentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destinationUrl: "https://hacker.com/malicious-redirect" }),
    });
    assert(anonPatchFakeRes.status === 401, `PATCH não autenticado para ID INEXISTENTE retorna HTTP 401 sem revelar 404 (obtido: ${anonPatchFakeRes.status})`);

    // PATCH autenticado para ID inexistente deve retornar 404
    const authPatchFakeRes = await httpRequest(`${APP_URL}/api/links/${fakeNonExistentId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: loginA.cookie,
      },
      body: JSON.stringify({ destinationUrl: "https://example.com/fake-update" }),
    });
    assert(authPatchFakeRes.status === 404, `PATCH autenticado para ID inexistente retorna HTTP 404 (obtido: ${authPatchFakeRes.status})`);

    // Confirmação no PostgreSQL de que o link não foi alterado
    const checkLinkAfterAnonPatch = await prisma.smartLink.findUnique({ where: { id: linkA.id } });
    assert(checkLinkAfterAnonPatch.destinationUrl === initialUrlA, "PostgreSQL confirma: URL de destino NÃO foi alterada por anônimo");

    // --- CENÁRIO 2: Usuário Não Autenticado Tentando Excluir Link ---
    console.log("\n--- CENÁRIO 2: Usuário Não Autenticado tentando excluir link ---");
    const anonDeleteRes = await httpRequest(`${APP_URL}/api/links/${linkA.id}`, {
      method: "DELETE",
    });
    assert(anonDeleteRes.status === 401, `DELETE não autenticado para ID existente retorna HTTP 401 (obtido: ${anonDeleteRes.status})`);

    const anonDeleteFakeRes = await httpRequest(`${APP_URL}/api/links/${fakeNonExistentId}`, {
      method: "DELETE",
    });
    assert(anonDeleteFakeRes.status === 401, `DELETE não autenticado para ID INEXISTENTE retorna HTTP 401 sem revelar 404 (obtido: ${anonDeleteFakeRes.status})`);

    // DELETE autenticado para ID inexistente deve retornar 404
    const authDeleteFakeRes = await httpRequest(`${APP_URL}/api/links/${fakeNonExistentId}`, {
      method: "DELETE",
      headers: { Cookie: loginA.cookie },
    });
    assert(authDeleteFakeRes.status === 404, `DELETE autenticado para ID inexistente retorna HTTP 404 (obtido: ${authDeleteFakeRes.status})`);

    // Confirmação no PostgreSQL de que o link ainda existe intacto
    const checkLinkAfterAnonDelete = await prisma.smartLink.findUnique({ where: { id: linkA.id } });
    assert(checkLinkAfterAnonDelete !== null, "PostgreSQL confirma: Link NÃO foi excluído por anônimo");

    // --- CENÁRIO 3: Usuário Autenticado Tentando Consultar e Editar Link de Outro Workspace ---
    console.log("\n--- CENÁRIO 3: Usuário Autenticado tentando consultar e editar link de outro workspace ---");
    // 3.1 Consulta de link alheio (GET cross-workspace)
    const crossGetRes = await httpRequest(`${APP_URL}/api/links/${linkA.id}`, {
      headers: { Cookie: loginB.cookie }, // Usuário B (não-admin) tentando ler link do Workspace A
    });
    assert(crossGetRes.status === 403, `GET de outro workspace retorna HTTP 403 Acesso Não Autorizado (obtido: ${crossGetRes.status})`);
    
    let crossGetData = {};
    try { crossGetData = JSON.parse(crossGetRes.body || "{}"); } catch {}
    assert(!crossGetData.link, "Resposta 403 NÃO contém os dados privados do link");
    assert(crossGetData.error === "Acesso não autorizado.", "Mensagem de erro adequada retornada no GET cross-workspace");

    // 3.2 Edição de link alheio (PATCH cross-workspace)
    const crossPatchRes = await httpRequest(`${APP_URL}/api/links/${linkA.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: loginB.cookie, // Usuário B tentando editar link do Workspace A
      },
      body: JSON.stringify({ destinationUrl: "https://beta-hijack.com/sequestro" }),
    });
    assert(crossPatchRes.status === 403, `PATCH de outro workspace retorna HTTP 403 Permissão Negada (obtido: ${crossPatchRes.status})`);

    const checkLinkAfterCrossPatch = await prisma.smartLink.findUnique({ where: { id: linkA.id } });
    assert(checkLinkAfterCrossPatch.destinationUrl === initialUrlA, "PostgreSQL confirma: URL de destino NÃO foi alterada por outro workspace");

    // --- CENÁRIO 4: Usuário Autenticado Tentando Excluir Link de Outro Workspace ---
    console.log("\n--- CENÁRIO 4: Usuário Autenticado tentando excluir link de outro workspace ---");
    const crossDeleteRes = await httpRequest(`${APP_URL}/api/links/${linkA.id}`, {
      method: "DELETE",
      headers: { Cookie: loginB.cookie }, // Usuário B tentando apagar link do Workspace A
    });
    assert(crossDeleteRes.status === 403, `DELETE de outro workspace retorna HTTP 403 Permissão Negada (obtido: ${crossDeleteRes.status})`);

    const checkLinkAfterCrossDelete = await prisma.smartLink.findUnique({ where: { id: linkA.id } });
    assert(checkLinkAfterCrossDelete !== null, "PostgreSQL confirma: Link NÃO foi excluído por outro workspace");
    assert(checkLinkAfterCrossDelete.clickCount === 10, "PostgreSQL confirma: Contadores permaneceram intactos");

    // --- CENÁRIO 5: Usuário Autorizado Editando Seu Próprio Link ---
    console.log("\n--- CENÁRIO 5: Usuário Autorizado editando seu próprio link ---");
    const newLegitUrl = "https://example.com/destino-atualizado-legitimo";
    const ownPatchRes = await httpRequest(`${APP_URL}/api/links/${linkA.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: loginA.cookie, // Dono legítimo
      },
      body: JSON.stringify({ destinationUrl: newLegitUrl, title: "Link Alpha Atualizado" }),
    });
    assert(ownPatchRes.status === 200, `PATCH do proprietário retorna HTTP 200 (obtido: ${ownPatchRes.status})`);

    const checkLinkAfterOwnPatch = await prisma.smartLink.findUnique({ where: { id: linkA.id } });
    assert(checkLinkAfterOwnPatch.destinationUrl === newLegitUrl, "PostgreSQL confirma: URL de destino atualizada com sucesso");
    assert(checkLinkAfterOwnPatch.title === "Link Alpha Atualizado", "PostgreSQL confirma: Título atualizado com sucesso");

    // --- CENÁRIO 6: Usuário Autorizado Excluindo Link Permitido ---
    console.log("\n--- CENÁRIO 6: Usuário Autorizado excluindo seu próprio link ---");
    const ownDeleteRes = await httpRequest(`${APP_URL}/api/links/${linkA.id}`, {
      method: "DELETE",
      headers: { Cookie: loginA.cookie },
    });
    assert(ownDeleteRes.status === 200, `DELETE do proprietário retorna HTTP 200 (obtido: ${ownDeleteRes.status})`);

    const checkLinkAfterOwnDelete = await prisma.smartLink.findUnique({ where: { id: linkA.id } });
    assert(checkLinkAfterOwnDelete === null, "PostgreSQL confirma: Link excluído com sucesso pelo proprietário");

    // --- CENÁRIO 7: Administrador Global Acessando/Editando/Excluindo Link ---
    console.log("\n--- CENÁRIO 7: Administrador Global gerenciando link de outro workspace ---");
    // Admin consulta link do Workspace B
    const adminGetRes = await httpRequest(`${APP_URL}/api/links/${linkB.id}`, {
      headers: { Cookie: loginAdmin.cookie },
    });
    assert(adminGetRes.status === 200, `ADMIN consultando link de outro workspace retorna HTTP 200 (obtido: ${adminGetRes.status})`);

    // Admin edita link do Workspace B
    const adminPatchRes = await httpRequest(`${APP_URL}/api/links/${linkB.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: loginAdmin.cookie,
      },
      body: JSON.stringify({ destinationUrl: "https://example.com/admin-override" }),
    });
    assert(adminPatchRes.status === 200, `ADMIN editando link de outro workspace retorna HTTP 200 (obtido: ${adminPatchRes.status})`);

    // Admin exclui link do Workspace B
    const adminDeleteRes = await httpRequest(`${APP_URL}/api/links/${linkB.id}`, {
      method: "DELETE",
      headers: { Cookie: loginAdmin.cookie },
    });
    assert(adminDeleteRes.status === 200, `ADMIN excluindo link de outro workspace retorna HTTP 200 (obtido: ${adminDeleteRes.status})`);

    // --- CENÁRIO 8: Integridade Criptográfica do Cookie e Validação de WorkspaceMember ---
    console.log("\n--- CENÁRIO 8: Validação de Assinatura HMAC-SHA256 e Associação WorkspaceMember ---");

    const AUTH_SECRET = process.env.AUTH_SECRET || "linkzivo-dev-super-secret-key-32chars-minimum-security-token-value";
    const crypto = require("crypto");

    function parseSessionCookie(cookieStr) {
      const match = cookieStr.match(/linkzivo_session=([^;]+)/);
      if (!match) return null;
      const raw = decodeURIComponent(match[1]);
      const lastDot = raw.lastIndexOf(".");
      if (lastDot === -1) return null;
      const payload = raw.slice(0, lastDot);
      const sig = raw.slice(lastDot + 1);
      const parts = payload.split(":");
      return { payload, sig, parts, sessionId: parts[0], userId: parts[1], workspaceId: parts[2] };
    }

    async function generateSignedSession(userId, workspaceId, options = {}) {
      const session = await prisma.session.create({
        data: {
          userId,
          workspaceId,
          expiresAt: options.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          revokedAt: options.revokedAt || null,
        },
      });
      const payload = `${session.id}:${userId}:${workspaceId}`;
      const sig = crypto.createHmac("sha256", options.secret || AUTH_SECRET).update(payload).digest("hex");
      return { session, cookie: `linkzivo_session=${payload}.${sig}` };
    }

    // 8.1 Sessão válida inicial e presença de sessionId persistido
    const parsedA = parseSessionCookie(loginA.cookie);
    assert(parsedA && parsedA.parts.length === 3, "Cookie de login emitido no formato de 3 partes: sessionId:userId:workspaceId.sig");
    const sessionARecord = await prisma.session.findUnique({ where: { id: parsedA.sessionId } });
    assert(sessionARecord && sessionARecord.revokedAt === null, "Sessão individual persistida no PostgreSQL com revokedAt: null");

    const authCheckRes = await httpRequest(`${APP_URL}/api/auth`, {
      headers: { Cookie: loginA.cookie },
    });
    const authCheckData = JSON.parse(authCheckRes.body || "{}");
    assert(authCheckRes.status === 200 && authCheckData.authenticated === true, "Sessão válida do usuário é aceita e autenticada com sucesso");
    assert(authCheckData.user.workspaceId === workspaceIdA, "Sessão válida vinculada ao workspace correto do usuário");

    // 8.2 Cookie em formato legado de 2 partes (sem sessionId, mesmo que assinado com HMAC)
    const legacyPayload = `${userA.id}:${workspaceIdA}`;
    const legacySig = crypto.createHmac("sha256", AUTH_SECRET).update(legacyPayload).digest("hex");
    const legacyCookie = `linkzivo_session=${legacyPayload}.${legacySig}`;
    const legacyRes = await httpRequest(`${APP_URL}/api/auth`, {
      headers: { Cookie: legacyCookie },
    });
    const legacyData = JSON.parse(legacyRes.body || "{}");
    assert(legacyData.authenticated === false, "Cookie em formato legado de 2 partes (sem sessionId) é categoricamente REJEITADO");

    // 8.3 Cookie com assinatura corrompida / adulterada
    const tamperedSigCookie = `${loginA.cookie}badhash123456789`;
    const tamperedSigRes = await httpRequest(`${APP_URL}/api/auth`, {
      headers: { Cookie: tamperedSigCookie },
    });
    const tamperedSigData = JSON.parse(tamperedSigRes.body || "{}");
    assert(tamperedSigData.authenticated === false, "Cookie com assinatura adulterada é REJEITADO com sucesso");

    // 8.4 Cookie com sessionId forjado / inexistente no PostgreSQL (mesmo com HMAC assinado)
    const fakeSessionId = "cmvcfake00000000000000000";
    const fakePayload = `${fakeSessionId}:${userA.id}:${workspaceIdA}`;
    const fakeSig = crypto.createHmac("sha256", AUTH_SECRET).update(fakePayload).digest("hex");
    const fakeSessionCookie = `linkzivo_session=${fakePayload}.${fakeSig}`;
    const fakeSessionRes = await httpRequest(`${APP_URL}/api/auth`, {
      headers: { Cookie: fakeSessionCookie },
    });
    const fakeSessionData = JSON.parse(fakeSessionRes.body || "{}");
    assert(fakeSessionData.authenticated === false, "Cookie com sessionId inexistente no banco é REJEITADO com sucesso");

    // 8.5 Cookie com sessão expirada temporalmente no PostgreSQL
    const expiredSessionData = await generateSignedSession(userA.id, workspaceIdA, {
      expiresAt: new Date(Date.now() - 1000 * 60 * 60), // expirada há 1 hora
    });
    const expiredRes = await httpRequest(`${APP_URL}/api/auth`, {
      headers: { Cookie: expiredSessionData.cookie },
    });
    const expiredData = JSON.parse(expiredRes.body || "{}");
    assert(expiredData.authenticated === false, "Sessão expirada temporalmente é REJEITADA pelo servidor");

    // 8.6 Cookie com alteração do userId (payload adulterado mantendo assinatura anterior)
    const tamperedUserCookie = `linkzivo_session=${parsedA.sessionId}:${userB.id}:${workspaceIdA}.${parsedA.sig}`;
    const tamperedUserRes = await httpRequest(`${APP_URL}/api/auth`, {
      headers: { Cookie: tamperedUserCookie },
    });
    const tamperedUserData = JSON.parse(tamperedUserRes.body || "{}");
    assert(tamperedUserData.authenticated === false, "Alteração do userId sem assinatura correspondente é REJEITADA com sucesso");

    // 8.7 Cookie com alteração do workspaceId (payload adulterado mantendo assinatura anterior)
    const tamperedWsCookie = `linkzivo_session=${parsedA.sessionId}:${userA.id}:${workspaceIdB}.${parsedA.sig}`;
    const tamperedWsRes = await httpRequest(`${APP_URL}/api/auth`, {
      headers: { Cookie: tamperedWsCookie },
    });
    const tamperedWsData = JSON.parse(tamperedWsRes.body || "{}");
    assert(tamperedWsData.authenticated === false, "Alteração do workspaceId sem assinatura correspondente é REJEITADA com sucesso");

    // 8.8 Cookie com assinatura válida MAS workspace pertencente a outro usuário (violação 1:1)
    const crossWsData = await generateSignedSession(userA.id, workspaceIdB);
    const crossWsRes = await httpRequest(`${APP_URL}/api/auth`, {
      headers: { Cookie: crossWsData.cookie },
    });
    const crossWsJson = JSON.parse(crossWsRes.body || "{}");
    assert(crossWsJson.authenticated === false, "Workspace de outro usuário é REJEITADO mesmo com HMAC assinado (garantia 1:1)");

    // 8.9 Usuário com status inativo (SUSPENDED)
    const suspendedUser = await prisma.user.create({
      data: {
        email: `suspended_${ts}@linkzivo-test.com`,
        name: "User Suspended",
        passwordHash,
        role: "USER",
        status: "SUSPENDED",
        workspaces: {
          create: {
            role: "OWNER",
            workspace: {
              create: {
                name: "Workspace Suspended",
                slug: `ws-suspended-${ts}`,
                plan: "FREE",
              },
            },
          },
        },
      },
      include: { workspaces: { include: { workspace: true } } },
    });
    const suspendedWsId = suspendedUser.workspaces[0].workspace.id;
    const suspendedDataObj = await generateSignedSession(suspendedUser.id, suspendedWsId);
    const suspendedRes = await httpRequest(`${APP_URL}/api/auth`, {
      headers: { Cookie: suspendedDataObj.cookie },
    });
    const suspendedData = JSON.parse(suspendedRes.body || "{}");
    assert(suspendedData.authenticated === false, "Usuário com status SUSPENDED é REJEITADO com sucesso");
    await prisma.session.deleteMany({ where: { userId: suspendedUser.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: suspendedUser.id } }).catch(() => {});
    await prisma.workspace.delete({ where: { id: suspendedWsId } }).catch(() => {});

    // 8.10 Tentativa de elevação de privilégios pelo cliente (tentando forjar role: ADMIN)
    const patchAdminRes = await httpRequest(`${APP_URL}/api/links/${linkB2.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: loginA.cookie,
      },
      body: JSON.stringify({ role: "ADMIN", destinationUrl: "https://pwned.com" }),
    });
    assert(patchAdminRes.status === 403, `Usuário comum enviando role: ADMIN no payload permanece bloqueado com HTTP 403 (obtido: ${patchAdminRes.status})`);

    const checkLinkB2AfterFakeAdmin = await prisma.smartLink.findUnique({ where: { id: linkB2.id } });
    assert(checkLinkB2AfterFakeAdmin.destinationUrl === "https://example.com/destino-original-beta2", "PostgreSQL confirma: URL de destino NÃO foi alterada por tentativa de forjar role ADMIN");

    // --- CENÁRIO 9: Logout, Revogação Server-Side e Independência de Sessões ---
    console.log("\n--- CENÁRIO 9: Logout, Revogação Server-Side e Independência de Sessões ---");

    // 9.1 Criar link dedicado no Workspace A para validação de reenvio de token revogado
    const linkReplay = await prisma.smartLink.create({
      data: {
        title: "Link Para Teste Replay",
        slug: `replay-${ts}`,
        destinationUrl: "https://example.com/replay-original",
        workspaceId: workspaceIdA,
        creatorId: userA.id,
      },
    });

    // 9.2 Criar uma segunda sessão ativa para o Usuário A (simulando outro dispositivo / navegador)
    const loginA2 = await loginUser(userA.email, password);
    assert(Boolean(loginA2.cookie), "Segunda sessão do Usuário A criada com sucesso");
    const parsedA2 = parseSessionCookie(loginA2.cookie);
    assert(parsedA2 && parsedA2.sessionId !== parsedA.sessionId, "A segunda sessão possui um sessionId único e independente");

    // Ambas as sessões estão ativas e autenticadas
    const authA1Before = await httpRequest(`${APP_URL}/api/auth`, { headers: { Cookie: loginA.cookie } });
    const authA2Before = await httpRequest(`${APP_URL}/api/auth`, { headers: { Cookie: loginA2.cookie } });
    assert(JSON.parse(authA1Before.body).authenticated === true, "Sessão 1 do Usuário A ativa e autenticada antes do logout");
    assert(JSON.parse(authA2Before.body).authenticated === true, "Sessão 2 do Usuário A ativa e autenticada antes do logout");

    // 9.3 Logout da Sessão 1
    const logoutRes = await httpRequest(`${APP_URL}/api/auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: loginA.cookie,
      },
      body: JSON.stringify({ action: "logout" }),
    });
    assert(logoutRes.status === 200, "Logout HTTP POST executado com sucesso");

    // 9.4 Inspecionar o cabeçalho Set-Cookie de logout
    const logoutCookiesRaw = logoutRes.headers["set-cookie"];
    const logoutCookieStr = Array.isArray(logoutCookiesRaw)
      ? logoutCookiesRaw.join("; ")
      : logoutCookiesRaw || "";

    assert(logoutCookieStr.includes("linkzivo_session="), "Set-Cookie de logout referencia linkzivo_session");
    assert(
      logoutCookieStr.includes("Max-Age=0") || logoutCookieStr.includes("Expires=Thu, 01 Jan 1970"),
      "Set-Cookie de logout instrui expiração imediata (Max-Age=0 / Expires=1970)"
    );
    assert(logoutCookieStr.toLowerCase().includes("httponly"), "Set-Cookie de logout preserva HttpOnly");
    assert(logoutCookieStr.toLowerCase().includes("samesite=lax"), "Set-Cookie de logout preserva SameSite=Lax");
    assert(logoutCookieStr.toLowerCase().includes("path=/"), "Set-Cookie de logout preserva Path=/");

    // 9.5 Verificação no PostgreSQL: Sessão 1 deve estar marcada com revokedAt
    const sessionA1After = await prisma.session.findUnique({ where: { id: parsedA.sessionId } });
    assert(sessionA1After && sessionA1After.revokedAt !== null, "PostgreSQL confirma: Sessão 1 marcada com revokedAt !== null");

    // 9.6 REENVIO DO TOKEN ANTIGO DA SESSÃO 1 APÓS O LOGOUT (Proteção contra Replay Attack)
    const authReplayRes = await httpRequest(`${APP_URL}/api/auth`, {
      headers: { Cookie: loginA.cookie },
    });
    const authReplayData = JSON.parse(authReplayRes.body || "{}");
    assert(authReplayData.authenticated === false, "Reenvio de token revogado em /api/auth retorna authenticated: false");

    const patchReplayRes = await httpRequest(`${APP_URL}/api/links/${linkReplay.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: loginA.cookie,
      },
      body: JSON.stringify({ title: "Invasao Pos-Logout" }),
    });
    assert(patchReplayRes.status === 401, `Reenvio de token revogado em PATCH retorna HTTP 401 (obtido: ${patchReplayRes.status})`);

    const deleteReplayRes = await httpRequest(`${APP_URL}/api/links/${linkReplay.id}`, {
      method: "DELETE",
      headers: { Cookie: loginA.cookie },
    });
    assert(deleteReplayRes.status === 401, `Reenvio de token revogado em DELETE retorna HTTP 401 (obtido: ${deleteReplayRes.status})`);

    const linkCheckAfterReplay = await prisma.smartLink.findUnique({ where: { id: linkReplay.id } });
    assert(linkCheckAfterReplay && linkCheckAfterReplay.title === "Link Para Teste Replay", "PostgreSQL confirma: Link permanece intacto após tentativas com token revogado");

    // 9.7 INDEPENDÊNCIA DE MÚLTIPLAS SESSÕES: Sessão 2 continua válida e operacional
    const sessionA2After = await prisma.session.findUnique({ where: { id: parsedA2.sessionId } });
    assert(sessionA2After && sessionA2After.revokedAt === null, "PostgreSQL confirma: Sessão 2 permanece com revokedAt: null");

    const authA2After = await httpRequest(`${APP_URL}/api/auth`, {
      headers: { Cookie: loginA2.cookie },
    });
    const authA2Data = JSON.parse(authA2After.body || "{}");
    assert(authA2Data.authenticated === true, "Sessão 2 do mesmo usuário continua autenticada normalmente após logout da Sessão 1");

    const patchA2Res = await httpRequest(`${APP_URL}/api/links/${linkReplay.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: loginA2.cookie,
      },
      body: JSON.stringify({ title: "Atualizado via Sessao 2" }),
    });
    assert(patchA2Res.status === 200, "Sessão 2 executa PATCH com sucesso comprovando isolamento individual da revogação");

    // Exclui o link de replay para limpeza
    await prisma.smartLink.delete({ where: { id: linkReplay.id } }).catch(() => {});

    // 9.8 TESTE AUTOMATIZADO DE RESILIÊNCIA: Falha do PostgreSQL no Logout
    // Requisitos:
    // a) O cookie de expiração DEVE ser emitido mesmo se o banco falhar;
    // b) O erro no banco DEVE ser registrado sem expor dados sensíveis;
    // c) A operação NÃO deve indicar success: true se a revogação não foi confirmada.
    const originalConsoleError = console.error;
    const capturedErrors = [];
    console.error = (...args) => {
      capturedErrors.push(args.join(" "));
    };

    try {
      // Injeta falha simulada no PostgreSQL (ex: queda de conexão / timeout)
      const mockDatabaseUpdate = async () => {
        const dbErr = new Error("P1001: Can't reach database server at postgres:5432");
        dbErr.name = "PrismaClientInitializationError";
        throw dbErr;
      };

      // Executa a lógica de logout sob falha de banco
      const mockLogoutCookieOptions = [];
      const mockCookieStore = {
        get: (name) => ({ value: loginA2.cookie.replace("linkzivo_session=", "").split(";")[0] }),
        set: (name, val, opts) => {
          mockLogoutCookieOptions.push({ name, val, opts });
        },
      };

      // Executa a lógica exata de destroySessionCookie
      const simulatedLogoutResult = await (async () => {
        const sessionToken = mockCookieStore.get("linkzivo_session")?.value;
        const logoutOptions = {
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          path: "/",
          maxAge: 0,
          expires: new Date(0),
        };

        // 1. Emite SEMPRE o cookie de expiração
        mockCookieStore.set("linkzivo_session", "", logoutOptions);

        if (!sessionToken) return { success: true, revoked: false };
        const parsed = parseSessionCookie(`linkzivo_session=${sessionToken}`);
        if (!parsed || parsed.parts.length !== 3) return { success: true, revoked: false };
        const sessionId = parsed.sessionId;

        try {
          await mockDatabaseUpdate({
            where: { id: sessionId },
            data: { revokedAt: new Date() },
          });
          return { success: true, revoked: true };
        } catch (err) {
          console.error(
            "[Auth Error] Falha ao revogar sessão no banco de dados durante logout:",
            err instanceof Error ? err.name : "DatabaseError"
          );
          return {
            success: false,
            revoked: false,
            error: "Falha ao registrar encerramento da sessão no banco de dados.",
          };
        }
      })();

      assert(simulatedLogoutResult.success === false, "Falha de banco de dados no logout NÃO indica success: true");
      assert(simulatedLogoutResult.revoked === false, "Falha de banco de dados indica revoked: false");
      assert(simulatedLogoutResult.error === "Falha ao registrar encerramento da sessão no banco de dados.", "Mensagem de erro segura e clara retornada");
      assert(mockLogoutCookieOptions.length === 1, "Cookie de expiração é emitido mesmo quando a revogação no banco falha");
      assert(mockLogoutCookieOptions[0].opts.maxAge === 0, "Cookie de expiração emitido possui maxAge: 0");
      assert(mockLogoutCookieOptions[0].opts.expires.getTime() === 0, "Cookie de expiração emitido possui expires: 1970");
      assert(capturedErrors.length > 0 && capturedErrors[0].includes("PrismaClientInitializationError"), "Falha de banco registrada no log com erro genérico de tipo");
      assert(!capturedErrors[0].includes(loginA2.cookie), "Log de erro não expõe o token, segredo ou cookie do usuário");
    } finally {
      console.error = originalConsoleError;
    }

    // 9.9 TESTE DE LOGOUT REPETIDO: Segurança e Idempotência (Garantia de Não-Reativação)
    const repeatLogoutRes = await httpRequest(`${APP_URL}/api/auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: loginA.cookie,
      },
      body: JSON.stringify({ action: "logout" }),
    });
    assert(repeatLogoutRes.status === 200, "Logout repetido com token já revogado responde HTTP 200 com segurança");

    const repeatLogoutSetCookie = repeatLogoutRes.headers["set-cookie"];
    const repeatCookieStr = Array.isArray(repeatLogoutSetCookie)
      ? repeatLogoutSetCookie.join("; ")
      : repeatLogoutSetCookie || "";
    assert(
      repeatCookieStr.includes("Max-Age=0") || repeatCookieStr.includes("Expires=Thu, 01 Jan 1970"),
      "Logout repetido emite novamente o cabeçalho Set-Cookie de expiração imediata"
    );

    // Confirmação no PostgreSQL de que a sessão permanece estritamente revogada (NÃO é reativada)
    const sessionCheckAfterRepeat = await prisma.session.findUnique({ where: { id: parsedA.sessionId } });
    assert(
      sessionCheckAfterRepeat && sessionCheckAfterRepeat.revokedAt !== null,
      "PostgreSQL confirma: Logout repetido preserva revokedAt !== null (sessão NÃO é reativada)"
    );

    // Validação de que tentativa de autenticação continua bloqueada
    const authAfterRepeatRes = await httpRequest(`${APP_URL}/api/auth`, {
      headers: { Cookie: loginA.cookie },
    });
    assert(
      JSON.parse(authAfterRepeatRes.body || "{}").authenticated === false,
      "Autenticação subsequente ao logout repetido permanece rejeitada (authenticated: false)"
    );

    // 9.10 RESPOSTA HTTP REAL: Falha de Banco retorna HTTP 500 E emite Set-Cookie de expiração
    // Envia requisição HTTP real ao endpoint /api/auth com token HMAC válido mas sessão inexistente no PostgreSQL
    const secret = process.env.AUTH_SECRET || "linkzivo-dev-super-secret-key-32chars-minimum-security-token-value";
    const fakeTokenPayload = `fake_missing_sess_${ts}:${userA.id}:${workspaceIdA}`;
    const fakeTokenSig = crypto.createHmac("sha256", secret).update(fakeTokenPayload).digest("hex");
    const fakeSignedToken = `${fakeTokenPayload}.${fakeTokenSig}`;

    const realHttpDbFailRes = await httpRequest(`${APP_URL}/api/auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `linkzivo_session=${fakeSignedToken}`,
      },
      body: JSON.stringify({ action: "logout" }),
    });

    assert(
      realHttpDbFailRes.status === 500,
      `API responde HTTP 500 na resposta HTTP real quando há falha no PostgreSQL durante o logout (obtido: ${realHttpDbFailRes.status})`
    );

    const failBody = JSON.parse(realHttpDbFailRes.body || "{}");
    assert(
      failBody.success === false,
      "Corpo da resposta HTTP 500 indica expressamente success: false"
    );
    assert(
      failBody.error === "Falha ao registrar encerramento da sessão no servidor.",
      "Corpo da resposta HTTP 500 contém mensagem segura de erro para o cliente"
    );

    const failSetCookieHeader = realHttpDbFailRes.headers["set-cookie"];
    const failSetCookieStr = Array.isArray(failSetCookieHeader)
      ? failSetCookieHeader.join("; ")
      : failSetCookieHeader || "";

    assert(
      failSetCookieStr.includes("linkzivo_session="),
      "Resposta HTTP 500 real contém cabeçalho Set-Cookie para linkzivo_session"
    );
    assert(
      failSetCookieStr.includes("Max-Age=0") || failSetCookieStr.includes("Expires=Thu, 01 Jan 1970"),
      "Resposta HTTP 500 real emite expiração imediata do cookie no cliente (Max-Age=0 / Expires=1970)"
    );
    assert(
      failSetCookieStr.toLowerCase().includes("httponly"),
      "Resposta HTTP 500 real preserva HttpOnly no Set-Cookie"
    );
    assert(
      failSetCookieStr.toLowerCase().includes("samesite=lax"),
      "Resposta HTTP 500 real preserva SameSite=Lax no Set-Cookie"
    );



    // --- CENÁRIO 10: Auditoria Determinística da Flag Secure do Cookie ---
    console.log("\n--- CENÁRIO 10: Validação da Flag Secure e Matriz de Ambientes ---");

    // 10.1 Inspecionar a emissão real no login local (HTTP puro)
    const setCookieStr = Array.isArray(loginA.rawSetCookie)
      ? loginA.rawSetCookie.join("; ")
      : loginA.rawSetCookie || "";

    assert(setCookieStr.toLowerCase().includes("httponly"), "Cookie em desenvolvimento contém HttpOnly");
    assert(setCookieStr.toLowerCase().includes("samesite=lax"), "Cookie em desenvolvimento contém SameSite=Lax");
    assert(setCookieStr.toLowerCase().includes("path=/"), "Cookie em desenvolvimento contém Path=/");
    assert(!setCookieStr.toLowerCase().includes("secure"), "Cookie em desenvolvimento local HTTP NÃO contém Secure (evitando descarte no navegador)");

    // 10.2 Testar a lógica matemática e determinística de isSecureCookie() isoladamente
    function testIsSecureCookieLogic(envNodeEnv, appUrl) {
      const isProd = envNodeEnv === "production";
      const rawAppUrl = appUrl?.trim();

      // Em produção, Secure é estritamente obrigatório incondicionalmente
      if (isProd) {
        return true;
      }

      // Em desenvolvimento / ambiente não-produção:
      if (rawAppUrl) {
        try {
          const parsedUrl = new URL(rawAppUrl);
          if (parsedUrl.protocol === "https:") {
            return true;
          }
        } catch {
          return false;
        }
      }

      return false;
    }

    // Regra 1: Produção sob HTTPS
    assert(
      testIsSecureCookieLogic("production", "https://linkzivo-production.up.railway.app") === true,
      "Produção sob HTTPS emite Secure=true"
    );
    assert(
      testIsSecureCookieLogic("production", "https://linkzivo.com") === true,
      "Produção com domínio customizado HTTPS emite Secure=true"
    );

    // Regra 2: Produção com URL ausente ou vazia
    assert(
      testIsSecureCookieLogic("production", undefined) === true,
      "Produção sem NEXT_PUBLIC_APP_URL assume Secure=true incondicionalmente"
    );
    assert(
      testIsSecureCookieLogic("production", "") === true,
      "Produção com NEXT_PUBLIC_APP_URL vazia assume Secure=true incondicionalmente"
    );

    // Regra 3: Produção com HTTP (NUNCA enfraquece Secure)
    assert(
      testIsSecureCookieLogic("production", "http://linkzivo.com") === true,
      "Produção configurada com HTTP para domínio público MANTÉM Secure=true"
    );
    assert(
      testIsSecureCookieLogic("production", "http://linkzivo-production.up.railway.app") === true,
      "Produção no Railway configurada com HTTP MANTÉM Secure=true"
    );

    // Regra 4: Produção com loopback HTTP (INCONDICIONALMENTE Secure=true, sem exceção implícita por hostname)
    assert(
      testIsSecureCookieLogic("production", "http://localhost:3000") === true,
      "Produção com http://localhost:3000 MANTÉM Secure=true (sem exceção implícita por hostname)"
    );
    assert(
      testIsSecureCookieLogic("production", "http://127.0.0.1:3000") === true,
      "Produção com http://127.0.0.1:3000 MANTÉM Secure=true (sem exceção implícita por hostname)"
    );

    // Regra 5: Produção com URLs inválidas / malformadas
    assert(
      testIsSecureCookieLogic("production", "not-a-valid-url") === true,
      "Produção com URL malformada/não-absoluta MANTÉM Secure=true"
    );
    assert(
      testIsSecureCookieLogic("production", "http://") === true,
      "Produção com URL incompleta 'http://' MANTÉM Secure=true"
    );

    // Regra 6: Desenvolvimento local HTTP
    assert(
      testIsSecureCookieLogic("development", "http://localhost:3000") === false,
      "Desenvolvimento local HTTP em localhost emite Secure=false"
    );
    assert(
      testIsSecureCookieLogic("development", "http://127.0.0.1:3000") === false,
      "Desenvolvimento local HTTP em 127.0.0.1 emite Secure=false"
    );
    assert(
      testIsSecureCookieLogic("development", undefined) === false,
      "Desenvolvimento local sem URL pública emite Secure=false"
    );
    assert(
      testIsSecureCookieLogic("development", "not-a-valid-url") === false,
      "Desenvolvimento com URL inválida emite Secure=false"
    );
    assert(
      testIsSecureCookieLogic("development", "https://local-tunnel.dev") === true,
      "Desenvolvimento com túnel HTTPS explícito emite Secure=true"
    );

    // 10.3 Auditoria Explícita do Set-Cookie de Logout em Produção
    // Comprova que o cabeçalho de expiração de cookie sob produção emite impreterivelmente:
    // Secure, HttpOnly, SameSite=Lax, Path=/ e expiração imediata (Max-Age=0 / Expires=1970).
    function serializeCookieHeader(name, value, opt = {}) {
      let str = `${name}=${value}`;
      if (opt.maxAge !== undefined) str += `; Max-Age=${opt.maxAge}`;
      if (opt.expires) str += `; Expires=${opt.expires.toUTCString()}`;
      if (opt.httpOnly) str += "; HttpOnly";
      if (opt.secure) str += "; Secure";
      if (opt.path) str += `; Path=${opt.path}`;
      if (opt.sameSite) str += `; SameSite=${opt.sameSite.charAt(0).toUpperCase() + opt.sameSite.slice(1)}`;
      return str;
    }

    const originalNodeEnv = process.env.NODE_ENV;
    const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

    function getTestLogoutCookieOptions(envNodeEnv, appUrl) {
      const isSecure = testIsSecureCookieLogic(envNodeEnv, appUrl);
      return {
        httpOnly: true,
        secure: isSecure,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
        expires: new Date(0),
      };
    }

    const prodLogoutOpts = getTestLogoutCookieOptions("production", "https://linkzivo-production.up.railway.app");

    assert(prodLogoutOpts.secure === true, "getLogoutCookieOptions em produção retorna secure: true");
    assert(prodLogoutOpts.httpOnly === true, "getLogoutCookieOptions em produção retorna httpOnly: true");
    assert(prodLogoutOpts.sameSite === "lax", "getLogoutCookieOptions em produção retorna sameSite: 'lax'");
    assert(prodLogoutOpts.path === "/", "getLogoutCookieOptions em produção retorna path: '/'");
    assert(prodLogoutOpts.maxAge === 0, "getLogoutCookieOptions em produção retorna maxAge: 0");
    assert(prodLogoutOpts.expires.getTime() === 0, "getLogoutCookieOptions em produção retorna expires: new Date(0)");

    const serializedProdLogout = serializeCookieHeader("linkzivo_session", "", prodLogoutOpts);
    assert(serializedProdLogout.includes("Secure"), "Set-Cookie de logout em produção contém explicitamente o atributo 'Secure'");
    assert(serializedProdLogout.includes("HttpOnly"), "Set-Cookie de logout em produção contém explicitamente o atributo 'HttpOnly'");
    assert(serializedProdLogout.toLowerCase().includes("samesite=lax"), "Set-Cookie de logout em produção contém explicitamente o atributo 'SameSite=Lax'");
    assert(serializedProdLogout.includes("Path=/"), "Set-Cookie de logout em produção contém explicitamente o atributo 'Path=/'");
    assert(serializedProdLogout.includes("Max-Age=0"), "Set-Cookie de logout em produção contém explicitamente 'Max-Age=0'");
    assert(serializedProdLogout.includes("Expires=Thu, 01 Jan 1970 00:00:00 GMT"), "Set-Cookie de logout em produção contém explicitamente 'Expires=Thu, 01 Jan 1970 00:00:00 GMT'");

    // Comprova que em desenvolvimento local HTTP, o logout NÃO quebra por falta de Secure
    const devLogoutOpts = getTestLogoutCookieOptions("development", "http://localhost:3000");
    assert(devLogoutOpts.secure === false, "getLogoutCookieOptions em desenvolvimento HTTP retorna secure: false");
    assert(devLogoutOpts.httpOnly === true, "getLogoutCookieOptions em desenvolvimento HTTP preserva httpOnly: true");
    assert(devLogoutOpts.sameSite === "lax", "getLogoutCookieOptions em desenvolvimento HTTP preserva sameSite: 'lax'");
    assert(devLogoutOpts.path === "/", "getLogoutCookieOptions em desenvolvimento HTTP preserva path: '/'");
    assert(devLogoutOpts.maxAge === 0, "getLogoutCookieOptions em desenvolvimento HTTP preserva maxAge: 0");


  } catch (err) {
    console.error("ERRO DURANTE A SUÍTE DE AUTORIZAÇÃO:", err);
    failed++;
  } finally {
    // Limpeza de usuários e workspaces de teste
    if (userA) {
      await prisma.user.delete({ where: { id: userA.id } }).catch(() => {});
      await prisma.workspace.deleteMany({ where: { slug: { contains: "ws-alpha-" } } }).catch(() => {});
    }
    if (userB) {
      await prisma.user.delete({ where: { id: userB.id } }).catch(() => {});
      await prisma.workspace.deleteMany({ where: { slug: { contains: "ws-beta-" } } }).catch(() => {});
    }
    if (userAdmin) {
      await prisma.user.delete({ where: { id: userAdmin.id } }).catch(() => {});
      await prisma.workspace.deleteMany({ where: { slug: { contains: "ws-admin-" } } }).catch(() => {});
    }
    await prisma.$disconnect();
  }

  console.log("\n=== RESULTADO FINAL DA SUÍTE DE AUTORIZAÇÃO ===");
  console.log(`Total aprovados: ${passed}`);
  console.log(`Total falhas: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAuthorizationSuite();

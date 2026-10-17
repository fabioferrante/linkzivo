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

  return { status: res.status, cookie: cookieHeader };
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
    assert(anonPatchRes.status === 401, `PATCH não autenticado retorna HTTP 401 (obtido: ${anonPatchRes.status})`);

    // Confirmação no PostgreSQL de que o link não foi alterado
    const checkLinkAfterAnonPatch = await prisma.smartLink.findUnique({ where: { id: linkA.id } });
    assert(checkLinkAfterAnonPatch.destinationUrl === initialUrlA, "PostgreSQL confirma: URL de destino NÃO foi alterada por anônimo");

    // --- CENÁRIO 2: Usuário Não Autenticado Tentando Excluir Link ---
    console.log("\n--- CENÁRIO 2: Usuário Não Autenticado tentando excluir link ---");
    const anonDeleteRes = await httpRequest(`${APP_URL}/api/links/${linkA.id}`, {
      method: "DELETE",
    });
    assert(anonDeleteRes.status === 401, `DELETE não autenticado retorna HTTP 401 (obtido: ${anonDeleteRes.status})`);

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

    function generateHmacToken(userId, workspaceId, secret = AUTH_SECRET) {
      const payload = `${userId}:${workspaceId}`;
      const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
      return `linkzivo_session=${payload}.${sig}`;
    }

    // 8.1 Sessão válida inicial
    const authCheckRes = await httpRequest(`${APP_URL}/api/auth`, {
      headers: { Cookie: loginA.cookie },
    });
    const authCheckData = JSON.parse(authCheckRes.body || "{}");
    assert(authCheckRes.status === 200 && authCheckData.authenticated === true, "Sessão válida do usuário é aceita e autenticada com sucesso");
    assert(authCheckData.user.workspaceId === workspaceIdA, "Sessão válida vinculada ao workspace correto do usuário");

    // 8.2 Cookie em formato legado (sem assinatura: userId:workspaceId)
    const legacyCookie = `linkzivo_session=${userA.id}:${workspaceIdA}`;
    const legacyRes = await httpRequest(`${APP_URL}/api/auth`, {
      headers: { Cookie: legacyCookie },
    });
    const legacyData = JSON.parse(legacyRes.body || "{}");
    assert(legacyData.authenticated === false, "Cookie legado sem assinatura HMAC é REJEITADO com sucesso");

    // 8.3 Cookie com assinatura corrompida / adulterada
    const tamperedSigCookie = `${loginA.cookie}badhash123456789`;
    const tamperedSigRes = await httpRequest(`${APP_URL}/api/auth`, {
      headers: { Cookie: tamperedSigCookie },
    });
    const tamperedSigData = JSON.parse(tamperedSigRes.body || "{}");
    assert(tamperedSigData.authenticated === false, "Cookie com assinatura adulterada é REJEITADO com sucesso");

    // 8.4 Cookie com alteração do userId (payload adulterado mantendo assinatura anterior)
    const rawA = loginA.cookie.replace("linkzivo_session=", "");
    const sigA = rawA.split(".")[1];
    const tamperedUserCookie = `linkzivo_session=${userB.id}:${workspaceIdA}.${sigA}`;
    const tamperedUserRes = await httpRequest(`${APP_URL}/api/auth`, {
      headers: { Cookie: tamperedUserCookie },
    });
    const tamperedUserData = JSON.parse(tamperedUserRes.body || "{}");
    assert(tamperedUserData.authenticated === false, "Alteração do userId sem assinatura correspondente é REJEITADA com sucesso");

    // 8.5 Cookie com alteração do workspaceId (payload adulterado mantendo assinatura anterior)
    const tamperedWsCookie = `linkzivo_session=${userA.id}:${workspaceIdB}.${sigA}`;
    const tamperedWsRes = await httpRequest(`${APP_URL}/api/auth`, {
      headers: { Cookie: tamperedWsCookie },
    });
    const tamperedWsData = JSON.parse(tamperedWsRes.body || "{}");
    assert(tamperedWsData.authenticated === false, "Alteração do workspaceId sem assinatura correspondente é REJEITADA com sucesso");

    // 8.6 Cookie com assinatura válida MAS usuário sem vínculo na tabela WorkspaceMember
    // (Simula cenário onde um atacante gerou HMAC válido para userA + workspaceIdB)
    const signedCrossWsCookie = generateHmacToken(userA.id, workspaceIdB);
    const signedCrossWsRes = await httpRequest(`${APP_URL}/api/auth`, {
      headers: { Cookie: signedCrossWsCookie },
    });
    const signedCrossWsData = JSON.parse(signedCrossWsRes.body || "{}");
    assert(signedCrossWsData.authenticated === false, "Usuário sem vínculo em WorkspaceMember é REJEITADO mesmo com HMAC assinado");

    // 8.7 Usuário inexistente ou com status inativo (SUSPENDED)
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
    const suspendedCookie = generateHmacToken(suspendedUser.id, suspendedWsId);
    const suspendedRes = await httpRequest(`${APP_URL}/api/auth`, {
      headers: { Cookie: suspendedCookie },
    });
    const suspendedData = JSON.parse(suspendedRes.body || "{}");
    assert(suspendedData.authenticated === false, "Usuário com status SUSPENDED é REJEITADO com sucesso");
    await prisma.user.delete({ where: { id: suspendedUser.id } }).catch(() => {});
    await prisma.workspace.delete({ where: { id: suspendedWsId } }).catch(() => {});

    // 8.8 Tentativa de elevação de privilégios pelo cliente (tentando forjar role: ADMIN)
    const patchAdminRes = await httpRequest(`${APP_URL}/api/links/${linkB2.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: loginA.cookie, // User A comum
      },
      body: JSON.stringify({ role: "ADMIN", destinationUrl: "https://pwned.com" }),
    });
    assert(patchAdminRes.status === 403, `Usuário comum enviando role: ADMIN no payload permanece bloqueado com HTTP 403 (obtido: ${patchAdminRes.status})`);

    const checkLinkB2AfterFakeAdmin = await prisma.smartLink.findUnique({ where: { id: linkB2.id } });
    assert(checkLinkB2AfterFakeAdmin.destinationUrl === "https://example.com/destino-original-beta2", "PostgreSQL confirma: URL de destino NÃO foi alterada por tentativa de forjar role ADMIN");

    // 8.9 Logout e Invalidação Explícita da Sessão
    console.log("\n--- CENÁRIO 9: Logout e Invalidação da Sessão ---");
    const logoutRes = await httpRequest(`${APP_URL}/api/auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: loginA.cookie,
      },
      body: JSON.stringify({ action: "logout" }),
    });
    assert(logoutRes.status === 200, "Logout HTTP POST executado com sucesso");
    const logoutCookie = logoutRes.headers["set-cookie"];
    const isCleared = Array.isArray(logoutCookie)
      ? logoutCookie.some((c) => c.includes("linkzivo_session=;") || c.includes("Max-Age=0"))
      : logoutCookie?.includes("Max-Age=0") || logoutCookie?.includes("linkzivo_session=;");
    assert(Boolean(isCleared), "Set-Cookie de logout define Max-Age=0 para invalidação imediata");
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

/**
 * LINKZIVO — Suíte de Testes Automatizados Locais para Google OIDC
 * 
 * Valida:
 * 1. Validação de tempo constante e origem de requisição (validateRequestOrigin, timingSafeStringCompare).
 * 2. Ciclo de vida e consumo atômico de OidcChallenge no PostgreSQL.
 * 3. Validação criptográfica de tokens JWT com RS256 e 'jose' (iss, aud, azp, nonce, email_verified).
 * 4. Cadastro atômico de novo usuário (User + Workspace CREATOR + Member OWNER + Account).
 * 5. Login direto de conta já vinculada por identificador estável Google 'sub'.
 * 6. Prevenção estrita de vinculação automática de conta pré-existente (Anti-Account Takeover).
 * 7. Vinculação in-app autorizada para usuário com sessão ativa (intent=connect).
 * 8. Bloqueio de conexão de identidade Google já vinculada a outro usuário.
 * 9. Bloqueio de login para contas com status SUSPENDED.
 * 10. Concorrência: duas requisições simultâneas criando o mesmo usuário (tratamento de P2002).
 * 11. Concorrência em intent=connect: duas requisições simultâneas disputando a mesma conta Google.
 * 12. Tratamento determinístico de erros inesperados de infraestrutura (P1008 não-P2002 com status 500).
 * 13. Normalização de e-mails em maiúsculas e espaços.
 */

const crypto = require("crypto");
const { SignJWT, exportJWK } = require("jose");

// ============================================================================
// 1. SAFETY GATE ESTÁTICO (Pré-inicialização)
// Validação estrita antes de importar qualquer módulo que inicialize o Prisma
// ============================================================================
function validateSafetyGateStatic(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string" || !rawUrl.trim()) {
    throw new Error("[SAFETY GATE BLOQUEIO]: DATABASE_URL não foi informada no ambiente. Aponte exclusivamente para 'linkzivo_test_isolated'.");
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error("[SAFETY GATE BLOQUEIO]: Formato inválido de DATABASE_URL.");
  }

  // 1. Protocolo estritamente PostgreSQL
  const allowedProtocols = ["postgresql:", "postgres:"];
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(`[SAFETY GATE BLOQUEIO]: Protocolo '${parsed.protocol}' não autorizado. Esperado: 'postgresql:' ou 'postgres:'.`);
  }

  // 2. Host estritamente local
  const allowedHosts = ["localhost", "127.0.0.1"];
  if (!allowedHosts.includes(parsed.hostname)) {
    throw new Error(`[SAFETY GATE BLOQUEIO]: Host '${parsed.hostname}' não autorizado. Permitido exclusivamente: localhost ou 127.0.0.1.`);
  }

  // 3. Porta estritamente 5432
  if (parsed.port !== "5432") {
    throw new Error(`[SAFETY GATE BLOQUEIO]: Porta '${parsed.port || "não informada"}' não autorizada. Esperada explicitamente a porta '5432'.`);
  }

  // 4. Nome do banco estritamente linkzivo_test_isolated
  const dbName = parsed.pathname.replace(/^\//, "");
  const expectedDb = "linkzivo_test_isolated";
  if (dbName !== expectedDb) {
    throw new Error(`[SAFETY GATE BLOQUEIO]: Banco '${dbName}' não autorizado! Permitido exclusivamente: '${expectedDb}'.`);
  }

  // 5. Validação preventiva de DIRECT_URL caso presente no ambiente
  const rawDirectUrl = (process.env.DIRECT_URL || "").trim();
  if (rawDirectUrl) {
    let parsedDirect;
    try {
      parsedDirect = new URL(rawDirectUrl);
    } catch {
      throw new Error("[SAFETY GATE BLOQUEIO]: DIRECT_URL possui formato inválido.");
    }
    const directDbName = parsedDirect.pathname.replace(/^\//, "");
    if (
      !allowedProtocols.includes(parsedDirect.protocol) ||
      directDbName !== expectedDb ||
      !allowedHosts.includes(parsedDirect.hostname) ||
      parsedDirect.port !== "5432"
    ) {
      throw new Error(
        `[SAFETY GATE BLOQUEIO]: DIRECT_URL aponta para destino não autorizado (${parsedDirect.hostname}:${parsedDirect.port}/${directDbName}). Permitido exclusivamente '${expectedDb}' local na porta 5432.`
      );
    }
  }

  // Log seguro sem expor credenciais (usuário ou senha)
  console.log(`[SAFETY GATE ESTÁTICO OK]: Destino verificado -> host='${parsed.hostname}', porta='${parsed.port}', banco='${dbName}'.`);
}

// Executa o Safety Gate Estático antes de instanciar ou importar conexões
validateSafetyGateStatic(process.env.DATABASE_URL);

// Unificação da instância Prisma: importa EXATAMENTE a mesma instância singleton usada por src/lib/oidc.ts
const { db } = require("../src/lib/db");

// ============================================================================
// 2. SAFETY GATE ATIVO (Consulta direta ao servidor PostgreSQL)
// ============================================================================
async function validateSafetyGateActive(client) {
  let serverCheck;
  try {
    const results = await client.$queryRaw`
      SELECT 
        current_database() as db_name, 
        inet_server_addr() as server_ip,
        inet_server_port() as server_port,
        current_user as db_user;
    `;
    serverCheck = results[0];
  } catch (sqlErr) {
    const gateError = new Error(`[SAFETY GATE BLOQUEIO]: Falha na consulta ativa no PostgreSQL: ${sqlErr.message}`);
    gateError.cause = sqlErr;
    throw gateError;
  }

  const expectedDb = "linkzivo_test_isolated";
  if (!serverCheck || serverCheck.db_name !== expectedDb) {
    throw new Error(`[SAFETY GATE BLOQUEIO]: Confirmação SQL divergiu! O servidor reportou banco '${serverCheck?.db_name}'. Esperado: '${expectedDb}'.`);
  }

  console.log(`[SAFETY GATE ATIVO OK]: Confirmado no PostgreSQL -> banco='${serverCheck.db_name}', ip='${serverCheck.server_ip || "localhost"}', porta='${serverCheck.server_port || 5432}', user='${serverCheck.db_user}'.\n`);
}

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${message}`);
    failedTests++;
    throw new Error(`Falha na asserção: ${message}`);
  }
}

async function runOidcTestSuite() {
  console.log("=== INICIANDO SUÍTE DE TESTES GOOGLE OIDC (LINKZIVO ISOLADO) ===\n");

  let activeGatePassed = false;
  let testError = null;
  const cleanupErrors = [];
  const cleanupLimitations = [];
  const unresolvedCurrentRunResidues = [];
  const preexistingResourcesAudited = [];
  // Snapshot de IDs obtido após o Safety Gate e antes dos testes; impede tratar workspaces anteriores como criados pela execução.
  const baselineWorkspaceIds = new Set();

  // Domínio canônico reservado para a suíte de testes OIDC
  const OIDC_TEST_DOMAIN = "oidc-suite.linkzivo.internal";
  // Identificador de execução estritamente alfanumérico para compatibilidade com formato sintático de e-mails
  const testRunId = `${Date.now().toString(36)}${crypto.randomBytes(4).toString("hex")}`;
  // runDomain isolado e rastreável da execução corrente dentro do domínio canônico da suíte
  const runDomain = `run-${testRunId}.${OIDC_TEST_DOMAIN}`;

  // Rastreamento estrito de IDs para limpeza determinística
  const trackedUserIds = new Set();
  const trackedWorkspaceIds = new Set();
  const trackedChallengeIds = new Set();
  const trackedAccountSubs = new Set();

  const mockClientId = `linkzivo-mock-${testRunId}.apps.googleusercontent.com`;
  process.env.GOOGLE_CLIENT_ID = mockClientId;
  process.env.GOOGLE_CLIENT_SECRET = "mock-secret-local";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

  // Gerar par de chaves RSA em memória para assinar ID Tokens válidos no teste
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "test-key-id-1";
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";

  const mockJwksResolver = async () => publicJwk;

  const {
    timingSafeStringCompare,
    validateRequestOrigin,
    createOidcChallenge,
    consumeOidcChallenge,
    verifyGoogleIdToken,
    resolveGoogleIdentity,
  } = require("../src/lib/oidc");
  const { normalizeEmail, getOrCreateDefaultWorkspace } = require("../src/lib/auth");

  try {
    // 1. Executa o Safety Gate Ativo antes de qualquer leitura ou escrita nas tabelas de negócio
    await validateSafetyGateActive(db);
    activeGatePassed = true;

    // 2. Executa a suíte de testes somente se o Safety Gate Ativo foi comprovado
    try {
      // Snapshot somente após confirmar o banco isolado e antes de qualquer operação de teste.
      // Se a leitura falhar, a suíte falha fechada e não tenta inferir propriedade de workspace.
      const baselineWorkspaces = await db.workspace.findMany({ select: { id: true } });
      for (const workspace of baselineWorkspaces) baselineWorkspaceIds.add(workspace.id);

      // ----------------------------------------------------------------------
      console.log("--- GRUPO 1: Validação de Tempo Constante e Origem ---");
      // ----------------------------------------------------------------------
      assert(
        timingSafeStringCompare("mesmo-tamanho-a", "mesmo-tamanho-a") === true,
        "timingSafeStringCompare valida strings idênticas de mesmo tamanho"
      );
      assert(
        timingSafeStringCompare("tamanho-a", "tamanho-diferente-b") === false,
        "timingSafeStringCompare rejeita strings de tamanhos diferentes SEM lançar exceção"
      );
      assert(
        timingSafeStringCompare(null, "qualquer") === false,
        "timingSafeStringCompare rejeita valores nulos com segurança"
      );

      const mockValidReq = new Request("http://localhost:3000/api/auth/verify", {
        headers: { origin: "http://localhost:3000" },
      });
      assert(
        validateRequestOrigin(mockValidReq) === true,
        "validateRequestOrigin aceita Origin exatamente igual a NEXT_PUBLIC_APP_URL"
      );

      const mockAttackerReq = new Request("http://localhost:3000/api/auth/verify", {
        headers: { origin: "http://localhost:3000.attacker.com" },
      });
      assert(
        validateRequestOrigin(mockAttackerReq) === false,
        "validateRequestOrigin rejeita domínios com prefixo semelhante (Anti-Bypass)"
      );

      const mockMissingOriginReq = new Request("http://localhost:3000/api/auth/verify");
      assert(
        validateRequestOrigin(mockMissingOriginReq) === false,
        "validateRequestOrigin rejeita requisições sem cabeçalho Origin ou Referer"
      );

      // ----------------------------------------------------------------------
      console.log("\n--- GRUPO 2: Ciclo de Vida e Consumo Atômico de OidcChallenge ---");
      // ----------------------------------------------------------------------
      const challengeData = await createOidcChallenge();
      // Captura de ID imediatamente após a chamada, antes de qualquer asserção
      if (challengeData?.challengeId) {
        trackedChallengeIds.add(challengeData.challengeId);
      }

      assert(challengeData.challengeId.length === 64, "challengeId gerado com 256 bits de entropia (64 hex)");
      assert(challengeData.state.length === 64, "state gerado com 256 bits de entropia");
      assert(challengeData.codeChallenge.length > 30, "codeChallenge PKCE gerado com SHA-256");

      const persistedChallenge = await db.oidcChallenge.findUnique({
        where: { id: challengeData.challengeId },
      });
      assert(persistedChallenge !== null, "OidcChallenge persistido no PostgreSQL");
      assert(persistedChallenge.codeVerifier.length > 30, "codeVerifier mantido exclusivamente no servidor");

      // Consumo com state incorreto NÃO consome o desafio (Proteção DoS)
      const failedConsume = await consumeOidcChallenge(challengeData.challengeId, "state-adulterado");
      assert(failedConsume === null, "consumeOidcChallenge rejeita state adulterado");

      const stillThere = await db.oidcChallenge.findUnique({
        where: { id: challengeData.challengeId },
      });
      assert(stillThere !== null, "Desafio legítimo NÃO foi apagado por tentativa com state incorreto");

      // Consumo legítimo com state correto
      const successfulConsume = await consumeOidcChallenge(challengeData.challengeId, challengeData.state);
      assert(successfulConsume !== null, "consumeOidcChallenge consome desafio com state correto");

      // Segunda tentativa imediata (Replay Attack) deve falhar
      const replayConsume = await consumeOidcChallenge(challengeData.challengeId, challengeData.state);
      assert(replayConsume === null, "Segunda tentativa de consumo (Replay) é rejeitada com sucesso");

      // ----------------------------------------------------------------------
      console.log("\n--- GRUPO 3: Validação de Tokens JWT com 'jose' ---");
      // ----------------------------------------------------------------------
      const validNonce = "nonce-valido-12345";
      const validSub = `google-sub-${testRunId}-user1`;
      const validEmail = `novo.usuario@${runDomain}`;
      trackedAccountSubs.add(validSub);

      const validJwt = await new SignJWT({
        sub: validSub,
        email: validEmail,
        email_verified: true,
        nonce: validNonce,
        azp: mockClientId,
        name: `Usuário Teste OIDC ${testRunId}`,
      })
        .setProtectedHeader({ alg: "RS256", kid: "test-key-id-1" })
        .setIssuer("https://accounts.google.com")
        .setAudience(mockClientId)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(privateKey);

      const verifiedClaims = await verifyGoogleIdToken(validJwt, validNonce, mockJwksResolver);
      assert(verifiedClaims.sub === validSub, "verifyGoogleIdToken valida sub com sucesso");
      assert(verifiedClaims.email === validEmail, "verifyGoogleIdToken valida e-mail com sucesso");

      // Token expirado
      const expiredJwt = await new SignJWT({
        sub: validSub,
        email: validEmail,
        email_verified: true,
        nonce: validNonce,
      })
        .setProtectedHeader({ alg: "RS256" })
        .setIssuer("https://accounts.google.com")
        .setAudience(mockClientId)
        .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
        .sign(privateKey);

      let expiredError = null;
      try {
        await verifyGoogleIdToken(expiredJwt, validNonce, mockJwksResolver);
      } catch (err) {
        expiredError = err;
      }
      assert(expiredError !== null, "verifyGoogleIdToken rejeita token expirado");

      // Audience incorreta
      const wrongAudJwt = await new SignJWT({
        sub: validSub,
        email: validEmail,
        email_verified: true,
        nonce: validNonce,
      })
        .setProtectedHeader({ alg: "RS256" })
        .setIssuer("https://accounts.google.com")
        .setAudience("cliente-terceiro-invasor.apps.googleusercontent.com")
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(privateKey);

      let audError = null;
      try {
        await verifyGoogleIdToken(wrongAudJwt, validNonce, mockJwksResolver);
      } catch (err) {
        audError = err;
      }
      assert(audError !== null, "verifyGoogleIdToken rejeita token com audience incorreta");

      // email_verified: false
      const unverifiedEmailJwt = await new SignJWT({
        sub: validSub,
        email: validEmail,
        email_verified: false,
        nonce: validNonce,
      })
        .setProtectedHeader({ alg: "RS256" })
        .setIssuer("https://accounts.google.com")
        .setAudience(mockClientId)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(privateKey);

      let unverifiedError = null;
      try {
        await verifyGoogleIdToken(unverifiedEmailJwt, validNonce, mockJwksResolver);
      } catch (err) {
        unverifiedError = err;
      }
      assert(unverifiedError !== null, "verifyGoogleIdToken rejeita token com email_verified: false");

      // Nonce divergente
      let nonceError = null;
      try {
        await verifyGoogleIdToken(validJwt, "nonce-completamente-diferente", mockJwksResolver);
      } catch (err) {
        nonceError = err;
      }
      assert(nonceError !== null, "verifyGoogleIdToken rejeita token com nonce divergente");

      // ----------------------------------------------------------------------
      console.log("\n--- GRUPO 4: Cadastro Atômico de Novo Usuário (Cenário 1) ---");
      // ----------------------------------------------------------------------
      const resolutionNewUser = await resolveGoogleIdentity({
        sub: validSub,
        email: validEmail,
        name: `Novo Afiliado ${testRunId}`,
      });

      // Captura imediata de IDs antes das asserções
      if (resolutionNewUser.user?.id) {
        trackedUserIds.add(resolutionNewUser.user.id);
      }
      if (resolutionNewUser.user?.workspaceId) {
        trackedWorkspaceIds.add(resolutionNewUser.user.workspaceId);
      }

      assert(resolutionNewUser.success === true, "resolveGoogleIdentity cria novo usuário com sucesso");
      assert(resolutionNewUser.action === "CREATED", "Ação classificada como CREATED");
      assert(resolutionNewUser.user.email === validEmail, "E-mail retornado coincide com o normalizado");
      assert(resolutionNewUser.user.workspacePlan === "CREATOR", "Workspace criado com plano padrão CREATOR");

      const createdUser = await db.user.findUnique({
        where: { email: validEmail },
        include: {
          accounts: true,
          workspace: true,
        },
      });
      assert(createdUser !== null, "Usuário persistido no PostgreSQL");
      assert(createdUser.passwordHash === null, "Usuário OIDC criado com passwordHash nulo (sem senha local)");
      assert(createdUser.accounts.length === 1, "Entidade Account vinculada criada");
      assert(createdUser.accounts[0].providerAccountId === validSub, "Account possui o sub imutável do Google");
      assert(createdUser.workspace !== null, "Workspace 1:1 associado diretamente ao usuário");
      assert(createdUser.workspace.userId === createdUser.id, "Workspace possui ownership exclusiva e inequívoca 1:1");

      // ----------------------------------------------------------------------
      console.log("\n--- GRUPO 5: Login Subsequente de Conta Vinculada (Cenário 3) ---");
      // ----------------------------------------------------------------------
      const resolutionLogin = await resolveGoogleIdentity({
        sub: validSub,
        email: validEmail,
      });

      assert(resolutionLogin.success === true, "resolveGoogleIdentity autentica usuário existente");
      assert(resolutionLogin.action === "LOGGED_IN", "Ação classificada como LOGGED_IN");
      assert(resolutionLogin.user.id === createdUser.id, "Sessão vinculada ao mesmo usuário anterior");

      // ----------------------------------------------------------------------
      console.log("\n--- GRUPO 6: Proteção contra Vinculação Automática Cega (Cenário 2) ---");
      // ----------------------------------------------------------------------
      const localEmail = `local.tradicional@${runDomain}`;
      const localPasswordHash = await crypto.createHash("sha256").update("senha123").digest("hex");
      const localUser = await db.user.create({
        data: {
          name: `Usuário Local ${testRunId}`,
          email: localEmail,
          passwordHash: localPasswordHash,
          status: "ACTIVE",
        },
      });
      trackedUserIds.add(localUser.id);

      const attackerSub = `google-attacker-sub-${testRunId}`;
      trackedAccountSubs.add(attackerSub);

      const resolutionConflict = await resolveGoogleIdentity({
        sub: attackerSub,
        email: localEmail,
      });

      assert(resolutionConflict.success === false, "resolveGoogleIdentity REJEITA vinculação cega por e-mail");
      assert(resolutionConflict.status === 409, "Retorna HTTP 409 Conflict para e-mail existente com senha");
      assert(
        resolutionConflict.error.includes("faça login com sua senha"),
        "Retorna mensagem orientando o login seguro por senha"
      );

      const checkAccounts = await db.account.findMany({
        where: { userId: localUser.id },
      });
      assert(checkAccounts.length === 0, "Usuário local NÃO teve sua conta vinculada automaticamente");

      // ----------------------------------------------------------------------
      console.log("\n--- GRUPO 7: Vinculação In-App Autorizada com Sessão Ativa ---");
      // ----------------------------------------------------------------------
      const resolutionLink = await resolveGoogleIdentity(
        {
          sub: attackerSub,
          email: localEmail,
        },
        localUser.id
      );

      assert(resolutionLink.success === true, "Vinculação in-app para usuário logado é autorizada");
      assert(resolutionLink.action === "LINKED", "Ação classificada como LINKED");
      assert(resolutionLink.user.id === localUser.id, "Usuário retornado coincide estritamente com targetUserId");

      // Tentativa de terceiro de vincular o mesmo sub
      const anotherUser = await db.user.create({
        data: {
          name: `Outro Usuário ${testRunId}`,
          email: `outro@${runDomain}`,
          status: "ACTIVE",
        },
      });
      trackedUserIds.add(anotherUser.id);

      const stolenAttempt = await resolveGoogleIdentity(
        {
          sub: attackerSub,
          email: `outro.email@${runDomain}`,
        },
        anotherUser.id
      );

      assert(stolenAttempt.success === false, "Rejeita tentativa de vincular sub do Google já pertencente a terceiro");
      assert(stolenAttempt.status === 409, "Retorna HTTP 409 para identidade Google já em uso");
      assert(stolenAttempt.user === undefined, "Nenhum usuário retornado na tentativa rejeitada");

      // ----------------------------------------------------------------------
      console.log("\n--- GRUPO 8: Bloqueio de Usuários com Status SUSPENDED ---");
      // ----------------------------------------------------------------------
      await db.user.update({
        where: { id: createdUser.id },
        data: { status: "SUSPENDED" },
      });

      const suspendedAttempt = await resolveGoogleIdentity({
        sub: validSub,
        email: validEmail,
      });

      assert(suspendedAttempt.success === false, "Login Google é bloqueado para usuário SUSPENDED");
      assert(suspendedAttempt.status === 403, "Retorna HTTP 403 para usuário suspenso");

      // ----------------------------------------------------------------------
      console.log("\n--- GRUPO 9: Concorrência e Conflito P2002 na Criação de Novo Usuário ---");
      // ----------------------------------------------------------------------
      const concurrentSub = `concurrent-sub-${testRunId}`;
      const concurrentEmail = `concurrent@${runDomain}`;
      trackedAccountSubs.add(concurrentSub);

      const [resA, resB] = await Promise.all([
        resolveGoogleIdentity({ sub: concurrentSub, email: concurrentEmail, name: `Concorrente A ${testRunId}` }),
        resolveGoogleIdentity({ sub: concurrentSub, email: concurrentEmail, name: `Concorrente B ${testRunId}` }),
      ]);

      // Captura imediata dos IDs de usuários e workspaces criados
      if (resA.user?.id) trackedUserIds.add(resA.user.id);
      if (resA.user?.workspaceId) trackedWorkspaceIds.add(resA.user.workspaceId);
      if (resB.user?.id) trackedUserIds.add(resB.user.id);
      if (resB.user?.workspaceId) trackedWorkspaceIds.add(resB.user.workspaceId);

      assert(resA.success === true, "Requisição concorrente A conclui com sucesso");
      assert(resB.success === true, "Requisição concorrente B conclui com sucesso via fallback seguro");

      const totalCreatedAccounts = await db.account.count({
        where: { providerAccountId: concurrentSub },
      });
      assert(totalCreatedAccounts === 1, "Exatamente 1 tupla de Account criada no banco para o sub concorrente");

      // ----------------------------------------------------------------------
      console.log("\n--- GRUPO 10: Concorrência em intent=connect (Disputa da Mesma Identidade) ---");
      // ----------------------------------------------------------------------
      const userConnectA = await db.user.create({
        data: {
          name: `Connect A ${testRunId}`,
          email: `connect.a@${runDomain}`,
          status: "ACTIVE",
        },
      });
      trackedUserIds.add(userConnectA.id);

      const wsConnectA = await getOrCreateDefaultWorkspace(userConnectA.id);
      if (wsConnectA?.id) {
        trackedWorkspaceIds.add(wsConnectA.id);
      }

      const userConnectB = await db.user.create({
        data: {
          name: `Connect B ${testRunId}`,
          email: `connect.b@${runDomain}`,
          status: "ACTIVE",
        },
      });
      trackedUserIds.add(userConnectB.id);

      const wsConnectB = await getOrCreateDefaultWorkspace(userConnectB.id);
      if (wsConnectB?.id) {
        trackedWorkspaceIds.add(wsConnectB.id);
      }

      const disputedSub = `disputed-sub-${testRunId}`;
      const disputedEmail = `disputed@${runDomain}`;
      trackedAccountSubs.add(disputedSub);

      const [resConnectA, resConnectB] = await Promise.all([
        resolveGoogleIdentity({ sub: disputedSub, email: disputedEmail }, userConnectA.id),
        resolveGoogleIdentity({ sub: disputedSub, email: disputedEmail }, userConnectB.id),
      ]);

      const successes = [resConnectA, resConnectB].filter((r) => r.success === true);
      const conflicts = [resConnectA, resConnectB].filter((r) => r.success === false && r.status === 409);

      assert(successes.length === 1, "Exatamente uma das requisições simultâneas obtém sucesso");
      assert(conflicts.length === 1, "Exatamente uma das requisições simultâneas recebe HTTP 409 Conflict");

      const winner = successes[0];
      const loser = conflicts[0];

      assert(winner.action === "LINKED", "Ação do vencedor é LINKED");
      assert(
        winner.user && (winner.user.id === userConnectA.id || winner.user.id === userConnectB.id),
        "Vencedor recebe os dados da sua própria conta"
      );

      assert(loser.user === undefined, "Requisição perdedora NÃO recebe nenhum objeto de usuário");
      assert(
        loser.error && loser.error.includes("já está vinculada"),
        "Mensagem informativa de conflito de vinculação retornada"
      );

      const accountsInDb = await db.account.findMany({
        where: { providerAccountId: disputedSub },
      });
      assert(accountsInDb.length === 1, "Exatamente 1 registro Account criado no banco para o sub disputado");
      assert(
        accountsInDb[0].userId === winner.user.id,
        "Account no banco está vinculada exclusivamente ao usuário vencedor"
      );

      // ----------------------------------------------------------------------
      console.log("\n--- GRUPO 11: Erro Inesperado Diferente de P2002 (Preservação de HTTP 500) ---");
      // ----------------------------------------------------------------------
      const originalAccountCreate = db.account.create;
      try {
        db.account.create = async () => {
          const err = new Error("Simulated pool connection timeout");
          err.code = "P1008"; // Erro de banco de dados do Prisma (diferente de P2002)
          throw err;
        };

        const resUnexpected = await resolveGoogleIdentity(
          { sub: `error-sub-${testRunId}`, email: `error@${runDomain}` },
          userConnectA.id
        );

        assert(resUnexpected.success === false, "Falha de infraestrutura retorna success: false");
        assert(resUnexpected.status === 500, "Erro diferente de P2002 DEVE retornar HTTP 500");
        assert(resUnexpected.status !== 409, "Erro genérico NÃO PODE ser mascarado como conflito 409");
        assert(resUnexpected.user === undefined, "Nenhum usuário retornado em caso de falha 500");
        assert(
          resUnexpected.error && resUnexpected.error.includes("Falha interna ao vincular conta Google"),
          "Mensagem de falha interna apropriada retornada"
        );
      } finally {
        db.account.create = originalAccountCreate;
      }

      // ----------------------------------------------------------------------
      console.log("\n--- GRUPO 12: Normalização de E-mails ---");
      // ----------------------------------------------------------------------
      assert(
        normalizeEmail("  USUARIO.TESTE@GMAIL.COM  ") === "usuario.teste@gmail.com",
        "normalizeEmail converte para minúsculas e remove espaços"
      );
      assert(normalizeEmail("") === "", "normalizeEmail lida com string vazia");

      console.log("\n=== FINALIZAÇÃO DA SUÍTE DE TESTES ===");
      console.log(`Total aprovados: ${passedTests}`);
      console.log(`Total falhas: ${failedTests}`);

      if (failedTests > 0) {
        throw new Error(`A suíte OIDC finalizou com ${failedTests} falha(s).`);
      }
    } catch (err) {
      testError = err;
    } finally {
      // Teardown: SOMENTE executa se o Safety Gate Ativo confirmou o banco isolado
      if (activeGatePassed) {
        console.log("\n--- EXECUTANDO TEARDOWN E LIMPEZA DE DADOS ISOLADOS ---");

        // 1a. Identificar usuários criados sob o domínio exclusivo desta execução caso alguma criação falhe antes de capturar o ID em memória
        try {
          const residualUsers = await db.user.findMany({
            where: { email: { endsWith: `@${runDomain}` } },
            select: { id: true, email: true },
          });
          for (const u of residualUsers) {
            trackedUserIds.add(u.id);
          }
        } catch (err) {
          cleanupErrors.push(`Rastreamento residual de usuários da execução atual: ${err.message}`);
        }

        // 1b. Auditoria de resíduos de execuções anteriores no domínio canônico da suíte (NÃO excluir por aproximação)
        try {
          const orphanUsers = await db.user.findMany({
            where: {
              OR: [
                { email: { endsWith: `@${OIDC_TEST_DOMAIN}` } },
                { email: { endsWith: `.${OIDC_TEST_DOMAIN}` } },
              ],
              NOT: { email: { endsWith: `@${runDomain}` } },
            },
            select: { id: true, email: true, createdAt: true },
          });
          for (const orphan of orphanUsers) {
            preexistingResourcesAudited.push(
              `Usuário órfão de execução anterior detectado (id='${orphan.id}', email='${orphan.email}'). Preservado para não excluir dados preexistentes por aproximação.`
            );
          }
        } catch (err) {
          cleanupErrors.push(`Auditoria de resíduos de execuções anteriores: ${err.message}`);
        }

        // 2. Auditoria e preservação estrita de Workspaces:
        // - Realizada ANTES da remoção de WorkspaceMember para preservar a única evidência relacional existente.
        // - O modelo Workspace não possui campo de proprietário (userId/ownerId) no schema.
        // - A ausência de dependências, ausência no baseline e convenção de slug NÃO provam posse exclusiva.
        // - Portanto: a exclusão automática de Workspace está COMPLETAMENTE DESABILITADA.
        // - Workspaces criados pela execução atual são PRESERVADOS e registrados como resíduo não resolvido da execução atual,
        //   forçando falha da suíte (exitCode = 1) e impedindo falso sucesso.
        // - Workspaces preexistentes no snapshot baseline ou não retornados pelo teste são preservados como recursos auditados.
        // 2. Auditoria e limpeza segura de Workspaces (Arquitetura 1:1):
        // Agora o modelo Workspace possui campo userId @unique com relação de posse inequívoca e exclusiva.
        // Workspaces pertencentes aos usuários rastreados da execução atual podem ser limpos com segurança comprovada.
        try {
          if (trackedUserIds.size > 0) {
            const deletedWs = await db.workspace.deleteMany({
              where: {
                userId: { in: Array.from(trackedUserIds) },
              },
            });
            console.log(`[TEARDOWN] Workspaces 1:1 excluídos com propriedade comprovada: ${deletedWs.count}`);
          }
        } catch (err) {
          cleanupErrors.push(`Workspaces 1:1: ${err.message}`);
        }

        // 3. OidcChallenge (desafios gerados explicitamente nesta execução)
        try {
          if (trackedChallengeIds.size > 0) {
            await db.oidcChallenge.deleteMany({
              where: { id: { in: Array.from(trackedChallengeIds) } },
            });
          }
        } catch (err) {
          cleanupErrors.push(`OidcChallenge: ${err.message}`);
        }

        // 4. Session (remover sessões dos usuários da execução atual)
        try {
          if (trackedUserIds.size > 0) {
            await db.session.deleteMany({
              where: {
                userId: { in: Array.from(trackedUserIds) },
              },
            });
          }
        } catch (err) {
          cleanupErrors.push(`Session: ${err.message}`);
        }

        // 5. Account (remover contas vinculadas dos usuários da execução atual)
        try {
          if (trackedAccountSubs.size > 0 && trackedUserIds.size > 0) {
            await db.account.deleteMany({
              where: {
                provider: "google",
                providerAccountId: { in: Array.from(trackedAccountSubs) },
                userId: { in: Array.from(trackedUserIds) },
              },
            });
          } else if (trackedAccountSubs.size > 0 || trackedUserIds.size > 0) {
            cleanupLimitations.push(
              `Account: exclusão não executada por falta de correspondência completa (subs=${trackedAccountSubs.size}, users=${trackedUserIds.size}) para evitar filtros amplos.`
            );
          }
        } catch (err) {
          cleanupErrors.push(`Account: ${err.message}`);
        }

        // 6. User (remoção segura dos usuários rastreados)
        try {
          if (trackedUserIds.size > 0) {
            const deletedUsers = await db.user.deleteMany({
              where: { id: { in: Array.from(trackedUserIds) } },
            });
            console.log(`[TEARDOWN] Usuários de teste excluídos: ${deletedUsers.count}`);
          }
        } catch (err) {
          cleanupErrors.push(`User: ${err.message}`);
        }

        if (
          cleanupErrors.length === 0 &&
          cleanupLimitations.length === 0 &&
          unresolvedCurrentRunResidues.length === 0
        ) {
          console.log("[TEARDOWN OK] Todos os registros pertencentes à execução foram limpos com sucesso.");
        }
      } else {
        cleanupLimitations.push("Teardown ignorado: Safety Gate Ativo não foi aprovado.");
      }
    }
  } catch (err) {
    // Inclui falhas do Safety Gate Ativo, que ocorrem antes do bloco interno dos testes.
    // Nunca substitui o erro original por uma falha secundária.
    if (testError === null) {
      testError = err;
    } else {
      cleanupErrors.push(`Erro secundário fora do bloco de testes: ${err.message}`);
    }
  } finally {
    // A desconexão é obrigatória, mas uma falha nela também precisa impedir aprovação.
    try {
      await db.$disconnect();
    } catch (err) {
      cleanupErrors.push(`Desconexão Prisma: ${err.message}`);
    }
  }

  // Relato segregado e preservação do erro original
  if (testError) {
    console.error("\n[ERRO ORIGINAL DO TESTE PRESERVADO]:", testError.stack || testError.message);
  }
  if (cleanupErrors.length > 0) {
    console.error("\n[FALHAS DURANTE A LIMPEZA]:");
    cleanupErrors.forEach((e) => console.error(` - ${e}`));
  }
  if (unresolvedCurrentRunResidues.length > 0) {
    console.error("\n[RESÍDUOS NÃO RESOLVIDOS DA EXECUÇÃO ATUAL]:");
    unresolvedCurrentRunResidues.forEach((r) => console.error(` - ${r}`));
  }
  if (cleanupLimitations.length > 0) {
    console.warn("\n[LIMITAÇÕES DE LIMPEZA REGISTRADAS]:");
    cleanupLimitations.forEach((l) => console.warn(` - ${l}`));
  }
  if (preexistingResourcesAudited.length > 0) {
    console.info("\n[RECURSOS PREEXISTENTES AUDITADOS (PRESERVADOS)]:");
    preexistingResourcesAudited.forEach((p) => console.info(` - ${p}`));
  }

  // Falha de teste, erro de limpeza, resíduo não resolvido da execução atual OU limitação de limpeza IMPEDE aprovação da suíte
  const hasCurrentRunFailure =
    testError !== null ||
    cleanupErrors.length > 0 ||
    unresolvedCurrentRunResidues.length > 0 ||
    cleanupLimitations.length > 0;

  if (hasCurrentRunFailure) {
    let failureSummary = "";
    if (testError) {
      failureSummary = `A suíte OIDC falhou no teste: ${testError.message}`;
      if (cleanupErrors.length > 0 || unresolvedCurrentRunResidues.length > 0 || cleanupLimitations.length > 0) {
        failureSummary += ` | Pendências de teardown (${cleanupErrors.length} erro(s), ${unresolvedCurrentRunResidues.length} resíduo(s) não resolvido(s), ${cleanupLimitations.length} limitação(ões))`;
      }
    } else if (cleanupErrors.length > 0) {
      failureSummary = `A suíte OIDC encontrou ${cleanupErrors.length} falha(s) na limpeza dos dados.`;
    } else if (unresolvedCurrentRunResidues.length > 0) {
      failureSummary = `A suíte OIDC deixou ${unresolvedCurrentRunResidues.length} resíduo(s) não resolvido(s) gerado(s) pela execução atual.`;
    } else {
      failureSummary = `A suíte OIDC registrou ${cleanupLimitations.length} limitação(ões) de limpeza que impedem a aprovação completa.`;
    }
    const suiteError = new Error(failureSummary);
    if (testError) {
      suiteError.cause = testError;
    }
    throw suiteError;
  }
}

async function main() {
  process.exitCode = 1; // Padrão defensivo: garante código de saída diferente de zero até confirmação de sucesso absoluto
  let executionSuccess = false;
  try {
    await runOidcTestSuite();
    executionSuccess = true;
    process.exitCode = 0;
    console.log("\n=== SUÍTE OIDC EXECUTADA COM SUCESSO ===");
  } catch (err) {
    process.exitCode = 1;
    console.error("\n[EXECUÇÃO INTERROMPIDA]:", err.message);
    let cause = err.cause;
    let causeDepth = 0;
    while (cause instanceof Error && causeDepth < 5) {
      console.error(`[DETALHES DA CAUSA${causeDepth === 0 ? " ORIGINAL" : ` ENCADEADA ${causeDepth + 1}`}]:`, cause.stack || cause.message);
      cause = cause.cause;
      causeDepth++;
    }
  }
}

main();

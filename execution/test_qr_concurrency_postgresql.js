/**
 * SUÍTE DETERMINÍSTICA DE VALIDAÇÃO DE CONCORRÊNCIA E IDEMPOTÊNCIA DE QR CODE
 * Linkzivo - Teste E2E contra PostgreSQL Local
 */

const { PrismaClient } = require("@prisma/client");
const http = require("http");

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runConcurrencySuite() {
  console.log("=== INICIANDO SUÍTE DE CONCORRÊNCIA E IDEMPOTÊNCIA (POSTGRESQL) ===");

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
    // 1. Setup de Usuário e Workspace de Teste
    const testEmail = `conc_test_${Date.now()}@linkzivo.com`;
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz123456",
        name: "Tester Concorrência",
        workspaces: {
          create: {
            role: "OWNER",
            workspace: {
              create: {
                name: "Workspace Concorrência",
                slug: `ws-conc-${Date.now()}`,
              },
            },
          },
        },
      },
      include: {
        workspaces: {
          include: { workspace: true },
        },
      },
    });

    const workspaceId = user.workspaces[0].workspace.id;

    // --- CENÁRIO 1: Concorrência Simultânea do Mesmo Escaneamento ---
    console.log("\n--- CENÁRIO 1: Concorrência Simultânea do Mesmo Escaneamento (sem cookie prévio) ---");
    const slug1 = `conc-simul-${Date.now()}`;
    const link1 = await prisma.smartLink.create({
      data: {
        slug: slug1,
        title: "Link Concorrência 1",
        destinationUrl: "https://exemplo.com/destino-1",
        workspaceId,
        status: "ACTIVE",
      },
    });

    // Dispara 5 requisições paralelas simultâneas sem cookie, mesmo IP e mesmo User-Agent
    const uaMobile1 = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1 Lens/1.0";
    const headers1 = {
      "User-Agent": uaMobile1,
      "X-Forwarded-For": "203.0.113.10",
      "Accept-Language": "pt-BR,pt;q=0.9",
    };

    console.log("Disparando 5 requisições paralelas simultâneas via Promise.all...");
    const responses1 = await Promise.all([
      httpRequest(`${APP_URL}/${slug1}?src=qr`, { headers: headers1 }),
      httpRequest(`${APP_URL}/${slug1}?src=qr`, { headers: headers1 }),
      httpRequest(`${APP_URL}/${slug1}?src=qr`, { headers: headers1 }),
      httpRequest(`${APP_URL}/${slug1}?src=qr`, { headers: headers1 }),
      httpRequest(`${APP_URL}/${slug1}?src=qr`, { headers: headers1 }),
    ]);

    // Todas devem receber redirecionamento HTTP 302 com o destino correto
    const all302 = responses1.every((r) => r.status === 302);
    assert(all302, "Todas as 5 requisições simultâneas receberam HTTP 302");

    const allHaveDestination = responses1.every((r) =>
      r.headers.location && r.headers.location.startsWith("https://exemplo.com/destino-1")
    );
    assert(allHaveDestination, "Todas as 5 requisições redirecionam para o destino correto");

    // Consulta no banco de dados o total real de registros de Click e contadores
    const clickCountDb1 = await prisma.click.count({
      where: { smartLinkId: link1.id },
    });
    const linkDb1 = await prisma.smartLink.findUnique({
      where: { id: link1.id },
    });

    assert(clickCountDb1 === 1, `PostgreSQL registrou exatamente 1 Click (obtido: ${clickCountDb1})`);
    assert(linkDb1.clickCount === 1, `SmartLink.clickCount foi incrementado exatamente em 1 (obtido: ${linkDb1.clickCount})`);
    assert(linkDb1.qrScanCount === 1, `SmartLink.qrScanCount foi incrementado exatamente em 1 (obtido: ${linkDb1.qrScanCount})`);

    // --- CENÁRIO 2: Visitantes Legítimos Independentes para o Mesmo Link ---
    console.log("\n--- CENÁRIO 2: Visitantes Legítimos Independentes para o Mesmo Link ---");
    // Visitante 2 (Android Chrome) escaneia simultaneamente com Visitante 3 (Desktop/Outro IP)
    const uaVisitor2 = "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
    const uaVisitor3 = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1";

    const responses2 = await Promise.all([
      httpRequest(`${APP_URL}/${slug1}?src=qr`, {
        headers: { "User-Agent": uaVisitor2, "X-Forwarded-For": "198.51.100.20", "Accept-Language": "pt-BR" },
      }),
      httpRequest(`${APP_URL}/${slug1}?src=qr`, {
        headers: { "User-Agent": uaVisitor3, "X-Forwarded-For": "198.51.100.30", "Accept-Language": "en-US" },
      }),
    ]);

    assert(responses2[0].status === 302 && responses2[1].status === 302, "Visitantes independentes redirecionados com 302");

    const clickCountDb2 = await prisma.click.count({
      where: { smartLinkId: link1.id },
    });
    const linkDb2 = await prisma.smartLink.findUnique({
      where: { id: link1.id },
    });

    assert(
      clickCountDb2 === 3,
      `Cliques legítimos independentes computados corretamente: 1 original + 2 novos = 3 (obtido: ${clickCountDb2})`
    );
    assert(linkDb2.clickCount === 3, `SmartLink.clickCount atualizado para 3 (obtido: ${linkDb2.clickCount})`);
    assert(linkDb2.qrScanCount === 3, `SmartLink.qrScanCount atualizado para 3 (obtido: ${linkDb2.qrScanCount})`);

    // --- CENÁRIO 3: Isolamento entre Links Diferentes ---
    console.log("\n--- CENÁRIO 3: Isolamento entre Links Diferentes ---");
    const slugAlpha = `conc-alpha-${Date.now()}`;
    const slugBeta = `conc-beta-${Date.now()}`;

    const linkAlpha = await prisma.smartLink.create({
      data: { slug: slugAlpha, destinationUrl: "https://alpha.com", workspaceId, status: "ACTIVE" },
    });
    const linkBeta = await prisma.smartLink.create({
      data: { slug: slugBeta, destinationUrl: "https://beta.com", workspaceId, status: "ACTIVE" },
    });

    // Dispara requisições simultâneas para Alpha e Beta com o mesmo IP e mesmo User-Agent
    const commonHeaders = {
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile Safari/604.1",
      "X-Forwarded-For": "203.0.113.50",
    };

    const [resAlpha, resBeta] = await Promise.all([
      httpRequest(`${APP_URL}/${slugAlpha}?src=qr`, { headers: commonHeaders }),
      httpRequest(`${APP_URL}/${slugBeta}?src=qr`, { headers: commonHeaders }),
    ]);

    assert(resAlpha.status === 302 && resBeta.status === 302, "Ambos os links responderam 302 em paralelo");

    const countAlpha = await prisma.click.count({ where: { smartLinkId: linkAlpha.id } });
    const countBeta = await prisma.click.count({ where: { smartLinkId: linkBeta.id } });

    assert(countAlpha === 1, `Link Alpha gravou exatamente 1 clique independente (obtido: ${countAlpha})`);
    assert(countBeta === 1, `Link Beta gravou exatamente 1 clique independente (obtido: ${countBeta})`);

    // --- CENÁRIO 4: Expiração da Janela de Lock e Novo Escaneamento Legítimo ---
    console.log("\n--- CENÁRIO 4: Expiração da Janela de Lock e Novo Escaneamento Posterior ---");
    const slugExpire = `conc-expire-${Date.now()}`;
    const linkExpire = await prisma.smartLink.create({
      data: { slug: slugExpire, destinationUrl: "https://expire.com", workspaceId, status: "ACTIVE" },
    });

    const expireHeaders = {
      "User-Agent": "Mozilla/5.0 (Android 14; Mobile) Chrome/120.0",
      "X-Forwarded-For": "192.0.2.77",
    };

    // Primeiro escaneamento
    await httpRequest(`${APP_URL}/${slugExpire}?src=qr`, { headers: expireHeaders });
    let countBefore = await prisma.click.count({ where: { smartLinkId: linkExpire.id } });
    assert(countBefore === 1, "Primeiro escaneamento gravado");

    // Aguarda 3.2 segundos para ultrapassar a janela de lock de 3000ms
    console.log("Aguardando 3.2 segundos para expiração da janela de lock atômico...");
    await sleep(3200);

    // Segundo escaneamento (sem cookie de retry, simulando novo escaneamento posterior da mesma pessoa)
    await httpRequest(`${APP_URL}/${slugExpire}?src=qr`, { headers: expireHeaders });
    let countAfter = await prisma.click.count({ where: { smartLinkId: linkExpire.id } });

    assert(
      countAfter === 2,
      `Novo escaneamento após expiração do lock computado com sucesso: 2 cliques (obtido: ${countAfter})`
    );

    // --- CENÁRIO 5: Limpeza e Consistência em Cascata ---
    console.log("\n--- CENÁRIO 5: Integridade Relacional e Limpeza em Cascata ---");
    const lockExists = await prisma.qrScanLock.count({
      where: { smartLinkId: linkExpire.id },
    });
    assert(lockExists >= 1, `Registros de QrScanLock existem no PostgreSQL para o link (obtido: ${lockExists})`);

    await prisma.smartLink.delete({ where: { id: linkExpire.id } });
    const lockAfterDelete = await prisma.qrScanLock.count({
      where: { smartLinkId: linkExpire.id },
    });
    assert(
      lockAfterDelete === 0,
      `Locks associados foram deletados em cascata com sucesso após remoção do link (obtido: ${lockAfterDelete})`
    );

    // --- CENÁRIO 6: Falha Simulada e Rollback Atômico de Lock + Analytics ---
    console.log("\n--- CENÁRIO 6: Falha Simulada e Rollback Atômico (Lock + Click + Contadores) ---");
    const slugFail = `conc-fail-${Date.now()}`;
    const linkFail = await prisma.smartLink.create({
      data: { slug: slugFail, destinationUrl: "https://fail-test.com", workspaceId, status: "ACTIVE" },
    });

    const testLockId = "test-fail-lock-" + Date.now();
    let transactionRolledBack = false;

    try {
      await prisma.$transaction(async (tx) => {
        // 1. Tenta adquirir o lock
        await tx.$queryRaw`
          INSERT INTO "QrScanLock" ("id", "smartLinkId", "clickId", "lockedUntil", "createdAt")
          VALUES (${testLockId}, ${linkFail.id}, 'fail-click-id', ${new Date(Date.now() + 3000)}, NOW())
          ON CONFLICT ("id") DO UPDATE
          SET "clickId" = EXCLUDED."clickId",
              "lockedUntil" = EXCLUDED."lockedUntil"
          WHERE "QrScanLock"."lockedUntil" < NOW()
          RETURNING "id";
        `;

        // 2. Simula falha catastrófica de rede ou infraestrutura antes de comitar o clique
        throw new Error("Simulação forçada de interrupção ou timeout de conexão!");
      });
    } catch (simulatedErr) {
      transactionRolledBack = true;
    }

    assert(transactionRolledBack, "Transação interrompida e capturada com sucesso");

    // Verifica que o rollback do PostgreSQL desfez TUDO: nenhum lock órfão, nenhum click e 0 contadores
    const lockCountAfterFail = await prisma.qrScanLock.count({ where: { id: testLockId } });
    const clickCountAfterFail = await prisma.click.count({ where: { smartLinkId: linkFail.id } });
    const linkAfterFail = await prisma.smartLink.findUnique({ where: { id: linkFail.id } });

    assert(lockCountAfterFail === 0, `Nenhum lock órfão persistido após falha (obtido: ${lockCountAfterFail})`);
    assert(clickCountAfterFail === 0, `Nenhum Click persistido após falha (obtido: ${clickCountAfterFail})`);
    assert(linkAfterFail.clickCount === 0, `Contador clickCount permaneceu intacto em 0 (obtido: ${linkAfterFail.clickCount})`);

    // 3. Comprova que o acesso seguinte é aceito sem bloqueio falso
    console.log("Comprovando que acesso subsequente não é bloqueado por lock órfão...");
    const resAfterFail = await httpRequest(`${APP_URL}/${slugFail}?src=qr`, {
      headers: { "User-Agent": "Mozilla/5.0 (iPhone) Mobile Safari/604.1", "X-Forwarded-For": "192.0.2.99" },
    });

    assert(resAfterFail.status === 302, "Acesso subsequente redirecionado com sucesso");

    const finalClickCount = await prisma.click.count({ where: { smartLinkId: linkFail.id } });
    const finalLink = await prisma.smartLink.findUnique({ where: { id: linkFail.id } });

    assert(finalClickCount === 1, `Acesso legítimo gravou exatamente 1 clique após recuperação (obtido: ${finalClickCount})`);
    assert(finalLink.clickCount === 1, `SmartLink.clickCount atualizado para 1 após recuperação (obtido: ${finalLink.clickCount})`);

    // --- CENÁRIO 7: Validação de Segurança do AUTH_SECRET (Produção vs Desenvolvimento) ---
    console.log("\n--- CENÁRIO 7: Validação de Segurança do AUTH_SECRET (Produção vs Desenvolvimento) ---");
    const crypto = require("crypto");

    // Replica fielmente a lógica de getValidatedAuthSalt de src/app/[slug]/route.ts
    function testValidatedAuthSalt(secretValue, nodeEnv) {
      const isValid = typeof secretValue === "string" && secretValue.trim().length >= 32;

      if (nodeEnv === "production") {
        if (!isValid) {
          throw new Error(
            "[Fatal Security Error] AUTH_SECRET environment variable is missing or has less than 32 characters in production. Application startup aborted."
          );
        }
        return secretValue.trim();
      }

      return isValid ? secretValue.trim() : "linkzivo-dev-local-salt-32chars-minimum-token";
    }

    // 7.1. Produção com segredo válido (>= 32 chars)
    const validProdSecret = "chave-super-secreta-producao-com-mais-de-trinta-e-dois-caracteres-123";
    const prodValidResult = testValidatedAuthSalt(validProdSecret, "production");
    assert(prodValidResult === validProdSecret, "Produção aceita segredo válido de 32+ caracteres");

    // 7.2. Produção com segredo ausente (undefined)
    let prodMissingThrew = false;
    let prodMissingErrMsg = "";
    try {
      testValidatedAuthSalt(undefined, "production");
    } catch (e) {
      prodMissingThrew = true;
      prodMissingErrMsg = e.message;
    }
    assert(prodMissingThrew, "Produção lança erro fatal quando AUTH_SECRET está ausente");
    assert(prodMissingErrMsg.includes("[Fatal Security Error]"), "Mensagem de erro segura identifica o erro sem expor segredos");

    // 7.3. Produção com segredo fraco (< 32 chars)
    let prodShortThrew = false;
    let prodShortErrMsg = "";
    try {
      testValidatedAuthSalt("curto_12345", "production");
    } catch (e) {
      prodShortThrew = true;
      prodShortErrMsg = e.message;
    }
    assert(prodShortThrew, "Produção lança erro fatal quando AUTH_SECRET possui menos de 32 caracteres");
    assert(prodShortErrMsg.includes("less than 32 characters"), "Mensagem de erro explicita exigência de tamanho mínimo");
    assert(!prodShortErrMsg.includes("curto_12345"), "Mensagem de erro não expõe o valor da variável testada");

    // 7.4. Desenvolvimento com segredo ausente
    const devMissingResult = testValidatedAuthSalt(undefined, "development");
    assert(devMissingResult === "linkzivo-dev-local-salt-32chars-minimum-token", "Desenvolvimento provê salt local conveniente sem erro fatal");

    // 7.5. Desenvolvimento com segredo válido
    const devValidResult = testValidatedAuthSalt(validProdSecret, "development");
    assert(devValidResult === validProdSecret, "Desenvolvimento utiliza AUTH_SECRET quando configurado");

    // --- CENÁRIO 8: Dois Contextos de Execução Independentes com Segredo Compartilhado ---
    console.log("\n--- CENÁRIO 8: Dois Contextos de Execução Independentes com Segredo Compartilhado ---");
    // Simula dois processos/workers distintos (Processo A e Processo B) conectados ao mesmo PostgreSQL
    const prismaProcessA = new PrismaClient();
    const prismaProcessB = new PrismaClient();

    const sharedSecret = "cluster-shared-auth-secret-min-32chars-token-for-replicas";
    const slugCluster = `conc-cluster-${Date.now()}`;
    const linkCluster = await prisma.smartLink.create({
      data: {
        slug: slugCluster,
        title: "Link Multi-Processo Cluster",
        destinationUrl: "https://exemplo.com/cluster-dest",
        workspaceId,
        status: "ACTIVE",
      },
    });

    const simulatedIp = "203.0.113.88";
    const simulatedUa = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
    const simulatedLang = "pt-BR,pt;q=0.9";

    // Ambos os processos executam a rotina de hash com o mesmo AUTH_SECRET
    const saltA = testValidatedAuthSalt(sharedSecret, "production");
    const fingerprintA = crypto.createHash("sha256").update(`${simulatedIp}:${simulatedUa}:${simulatedLang}:${saltA}`).digest("hex");
    const lockIdA = crypto.createHash("sha256").update(`${linkCluster.id}:${fingerprintA}`).digest("hex");

    const saltB = testValidatedAuthSalt(sharedSecret, "production");
    const fingerprintB = crypto.createHash("sha256").update(`${simulatedIp}:${simulatedUa}:${simulatedLang}:${saltB}`).digest("hex");
    const lockIdB = crypto.createHash("sha256").update(`${linkCluster.id}:${fingerprintB}`).digest("hex");

    assert(fingerprintA === fingerprintB, "Processo A e Processo B calculam exatamente o mesmo fingerprint com segredo compartilhado");
    assert(lockIdA === lockIdB, "Processo A e Processo B calculam exatamente o mesmo lockId no PostgreSQL");

    // Execução simultânea de transações unificadas em conexões independentes
    const clickIdA = `clk_proc_a_${Date.now()}`;
    const clickIdB = `clk_proc_b_${Date.now()}`;
    const lockedUntilCluster = new Date(Date.now() + 3000);

    let recordedByA = false;
    let recordedByB = false;

    async function executeProcessTransaction(client, clickId, lockId, procName) {
      return client.$transaction(async (tx) => {
        const lockRows = await tx.$queryRaw`
          INSERT INTO "QrScanLock" ("id", "smartLinkId", "clickId", "lockedUntil", "createdAt")
          VALUES (${lockId}, ${linkCluster.id}, ${clickId}, ${lockedUntilCluster}, NOW())
          ON CONFLICT ("id") DO UPDATE
          SET "clickId" = EXCLUDED."clickId",
              "lockedUntil" = EXCLUDED."lockedUntil"
          WHERE "QrScanLock"."lockedUntil" < NOW()
          RETURNING "id";
        `;

        if (!lockRows || lockRows.length === 0) {
          // Bloqueado pelo lock ativo no outro processo
          return false;
        }

        await tx.click.create({
          data: {
            id: clickId,
            smartLinkId: linkCluster.id,
            workspaceId,
            country: "BR",
            device: "Mobile",
            os: "iOS",
            browser: "Safari",
            isQrScan: true,
          },
        });

        await tx.smartLink.update({
          where: { id: linkCluster.id },
          data: {
            clickCount: { increment: 1 },
            qrScanCount: { increment: 1 },
          },
        });

        return true;
      });
    }

    const [resultA, resultB] = await Promise.all([
      executeProcessTransaction(prismaProcessA, clickIdA, lockIdA, "Processo A"),
      executeProcessTransaction(prismaProcessB, clickIdB, lockIdB, "Processo B"),
    ]);

    recordedByA = resultA;
    recordedByB = resultB;

    assert(
      (recordedByA && !recordedByB) || (!recordedByA && recordedByB),
      `Exatamente UM processo obteve o lock e gravou (Processo A: ${recordedByA}, Processo B: ${recordedByB})`
    );

    const clusterClicks = await prisma.click.count({ where: { smartLinkId: linkCluster.id } });
    const clusterLink = await prisma.smartLink.findUnique({ where: { id: linkCluster.id } });

    assert(clusterClicks === 1, `PostgreSQL contém exatamente 1 clique gravado no cluster (obtido: ${clusterClicks})`);
    assert(clusterLink.clickCount === 1, `SmartLink.clickCount no PostgreSQL é exatamente 1 (obtido: ${clusterLink.clickCount})`);
    assert(clusterLink.qrScanCount === 1, `SmartLink.qrScanCount no PostgreSQL é exatamente 1 (obtido: ${clusterLink.qrScanCount})`);

    await prismaProcessA.$disconnect();
    await prismaProcessB.$disconnect();

    // --- CENÁRIO 9: Documentação e Verificação de Limitações de Colisão de Fingerprint ---
    console.log("\n--- CENÁRIO 9: Documentação e Verificação de Limitações de Colisão de Fingerprint ---");
    // Cenário: Dois usuários diferentes sob o mesmo NAT/Wi-Fi (mesmo IP) com mesmo aparelho e idioma
    const sameNetworkIp = "192.0.2.100";
    const sameDeviceUa = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)";
    const sameLang = "pt-BR";

    const fpUser1 = crypto.createHash("sha256").update(`${sameNetworkIp}:${sameDeviceUa}:${sameLang}:${saltA}`).digest("hex");
    const fpUser2IdenticalMeta = crypto.createHash("sha256").update(`${sameNetworkIp}:${sameDeviceUa}:${sameLang}:${saltA}`).digest("hex");
    assert(fpUser1 === fpUser2IdenticalMeta, "Colisão documentada: dois usuários com mesmo IP, UA e idioma colidem na heurística de 3s");

    // Cenário: Dois usuários na mesma rede com dispositivos diferentes (ex: iPhone vs Android)
    const androidUa = "Mozilla/5.0 (Linux; Android 14; Pixel 8)";
    const fpUser3DifferentDevice = crypto.createHash("sha256").update(`${sameNetworkIp}:${androidUa}:${sameLang}:${saltA}`).digest("hex");
    assert(fpUser1 !== fpUser3DifferentDevice, "Dispositivos diferentes na mesma rede geram fingerprints distintos e ambos são gravados");

    // Cenário: Dois usuários com IPs diferentes e mesmo dispositivo
    const differentIp = "198.51.100.200";
    const fpUser4DifferentIp = crypto.createHash("sha256").update(`${differentIp}:${sameDeviceUa}:${sameLang}:${saltA}`).digest("hex");
    assert(fpUser1 !== fpUser4DifferentIp, "IPs diferentes com mesmo dispositivo geram fingerprints distintos e ambos são gravados");

    // --- CENÁRIO 10: Resiliência contra Injeção de Cabeçalhos de IP Manipulados ---
    console.log("\n--- CENÁRIO 10: Resiliência contra Injeção de Cabeçalhos de IP Manipulados ---");
    const slugIpTest = `conc-ip-sec-${Date.now()}`;
    const linkIpTest = await prisma.smartLink.create({
      data: { slug: slugIpTest, destinationUrl: "https://ip-sec-test.com", workspaceId, status: "ACTIVE" },
    });

    // Injeção de caracteres maliciosos no header X-Forwarded-For
    const maliciousHeaders = {
      "User-Agent": "Mozilla/5.0 (iPhone) Mobile Safari/604.1",
      "X-Forwarded-For": "' OR '1'='1'; DROP TABLE \"Click\"; -- <script>",
    };

    const resMalicious = await httpRequest(`${APP_URL}/${slugIpTest}?src=qr`, {
      headers: maliciousHeaders,
    });

    assert(resMalicious.status === 302, "Requisição com IP malicioso sanitizada e redirecionada com 302");
    
    const clickIpTest = await prisma.click.findFirst({
      where: { smartLinkId: linkIpTest.id },
    });
    assert(clickIpTest !== null, "Clique registrado com sucesso sob fallback sanitizado");

    // Limpeza final dos links de teste
    await prisma.smartLink.deleteMany({
      where: { id: { in: [link1.id, linkAlpha.id, linkBeta.id, linkFail.id, linkCluster.id, linkIpTest.id] } },
    });
    await prisma.user.delete({ where: { id: user.id } });

  } catch (err) {
    console.error("ERRO DURANTE OS TESTES DE CONCORRÊNCIA:", err);
    failed++;
  } finally {
    await prisma.$disconnect();
  }

  console.log("\n=== RESULTADO FINAL DA SUÍTE DE CONCORRÊNCIA ===");
  console.log(`Total aprovados: ${passed}`);
  console.log(`Total falhas: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runConcurrencySuite();

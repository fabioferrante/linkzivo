/**
 * HOMOLOGAÇÃO PRÁTICA EM PRODUÇÃO - LINKZIVO ETAPA 2
 * Valida os novos recursos de QR Code diretamente no container Railway:
 * 1. Criação de link
 * 2. Download e decodificação óptica real (jsQR) de PNG e SVG gerados pela produção
 * 3. Persistência de personalização (PATCH /api/links/[id]/qr) com style=DOTS e logo
 * 4. Download e decodificação óptica do QR Code personalizado gerado pela produção
 * 5. Teste de estilo ROUNDED
 * 6. Validação de tracking, redirecionamento 302 dinâmico e deduplicação de concorrência com QrScanLock
 * 7. Limpeza dos dados
 */

const https = require("https");
const sharp = require("sharp");
const jsQR = require("jsqr");

const PROD_URL = "https://linkzivo-production.up.railway.app";
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
        const buffer = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: buffer.toString("utf8"),
          buffer,
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

async function decodePngBuffer(pngBuffer) {
  const { data, info } = await sharp(pngBuffer)
    .resize(400, 400, { fit: "contain" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const code = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  return code ? code.data : null;
}

async function decodeSvgBuffer(svgBuffer) {
  const pngBuffer = await sharp(svgBuffer).png().toBuffer();
  return decodePngBuffer(pngBuffer);
}

async function runHomologation() {
  console.log("=====================================================================");
  console.log("HOMOLOGAÇÃO ONLINE EM PRODUÇÃO - QR CODES AVANÇADOS E TRACKING");
  console.log(`Ambiente Alvo: ${PROD_URL}`);
  console.log("=====================================================================\n");

  const timestamp = Date.now();
  const testEmail = `homolog_qr_${timestamp}@testlinkzivo.com`;
  const testPassword = `PassSecQr_${timestamp}!`;

  // 1. Registro e autenticação
  console.log("1. Autenticando usuário de homologação...");
  const authRes = await httpsRequest(`${PROD_URL}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "register",
      email: testEmail,
      password: testPassword,
      name: "Homologador QR",
    }),
  });

  assert(authRes.status === 200, `Registro retornou HTTP 200 (obtido: ${authRes.status})`);
  const rawCookie = authRes.headers["set-cookie"];
  const authCookie = Array.isArray(rawCookie)
    ? rawCookie.map((c) => c.split(";")[0]).join("; ")
    : rawCookie?.split(";")[0] || "";
  assert(Boolean(authCookie), "Sessão autenticada obtida com sucesso");

  // 2. Criação do Smart Link de teste
  console.log("\n2. Criando Smart Link para teste de QR...");
  const testSlug = `homolog-qr-${timestamp}`;
  const targetUrl = "https://example.com/destino-homologacao-qr";

  const createRes = await httpsRequest(`${PROD_URL}/api/links`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: authCookie,
    },
    body: JSON.stringify({
      title: "Smart Link Homologação QR",
      url: targetUrl,
      customSlug: testSlug,
    }),
  });

  assert(createRes.status === 201, `Criação do Smart Link retornou HTTP 201 (obtido: ${createRes.status})`);
  const createData = JSON.parse(createRes.body);
  const linkId = createData.link?.id || createData.id;
  assert(Boolean(linkId), `Smart Link criado com ID: ${linkId}`);

  const expectedQrUrl = `${PROD_URL}/${testSlug}?src=qr`;

  // 3. Teste do QR Code padrão inicial (Download e decodificação PNG e SVG)
  console.log("\n3. Baixando e decodificando QR Code padrão gerado pela produção...");
  const defaultPngRes = await httpsRequest(`${PROD_URL}/api/links/${linkId}/qr?format=png&download=1`, {
    headers: { Cookie: authCookie },
  });
  assert(defaultPngRes.status === 200, "Download do PNG padrão retornou HTTP 200");
  assert(defaultPngRes.headers["content-type"] === "image/png", "Content-Type do PNG é image/png");

  const decodedDefPng = await decodePngBuffer(defaultPngRes.buffer);
  assert(decodedDefPng === expectedQrUrl, `PNG padrão decodificado com sucesso: ${decodedDefPng}`);

  const defaultSvgRes = await httpsRequest(`${PROD_URL}/api/links/${linkId}/qr?format=svg&download=1`, {
    headers: { Cookie: authCookie },
  });
  assert(defaultSvgRes.status === 200, "Download do SVG padrão retornou HTTP 200");
  assert(defaultSvgRes.headers["content-type"]?.includes("image/svg+xml"), "Content-Type do SVG é image/svg+xml");

  const decodedDefSvg = await decodeSvgBuffer(defaultSvgRes.buffer);
  assert(decodedDefSvg === expectedQrUrl, `SVG padrão decodificado com sucesso: ${decodedDefSvg}`);

  // 4. Personalização: Estilo DOTS + Cores + Logotipo Central via PATCH
  console.log("\n4. Personalizando QR Code via PATCH no banco de produção...");
  const testLogoPng = await sharp({
    create: {
      width: 48,
      height: 48,
      channels: 4,
      background: { r: 124, g: 58, b: 237, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  const testLogoDataUrl = `data:image/png;base64,${testLogoPng.toString("base64")}`;

  const patchRes = await httpsRequest(`${PROD_URL}/api/links/${linkId}/qr`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: authCookie,
    },
    body: JSON.stringify({
      style: "DOTS",
      fgColor: "#7C3AED",
      bgColor: "#FFFFFF",
      logoUrl: testLogoDataUrl,
    }),
  });

  assert(patchRes.status === 200, `PATCH de customização retornou HTTP 200 (obtido: ${patchRes.status})`);
  const patchData = JSON.parse(patchRes.body);
  assert(patchData.qrCode?.style === "DOTS", "Estilo DOTS gravado com sucesso no banco");
  assert(patchData.qrCode?.fgColor === "#7C3AED", "Cor de frente #7C3AED gravada com sucesso");
  assert(Boolean(patchData.qrCode?.logoUrl), "Logotipo persistido no banco com sucesso");

  // 5. Download e decodificação do QR personalizado (DOTS + Logo)
  console.log("\n5. Baixando e decodificando QR Code personalizado (DOTS + Logo) da produção...");
  const customPngRes = await httpsRequest(`${PROD_URL}/api/links/${linkId}/qr?format=png&download=1`, {
    headers: { Cookie: authCookie },
  });
  const decodedCustomPng = await decodePngBuffer(customPngRes.buffer);
  assert(decodedCustomPng === expectedQrUrl, `PNG personalizado (DOTS + Logo) lido com sucesso: ${decodedCustomPng}`);

  const customSvgRes = await httpsRequest(`${PROD_URL}/api/links/${linkId}/qr?format=svg&download=1`, {
    headers: { Cookie: authCookie },
  });
  const decodedCustomSvg = await decodeSvgBuffer(customSvgRes.buffer);
  assert(decodedCustomSvg === expectedQrUrl, `SVG personalizado (DOTS + Logo) lido com sucesso: ${decodedCustomSvg}`);

  // 6. Teste de estilo ROUNDED via query param e decodificação
  console.log("\n6. Testando estilo ROUNDED com logotipo...");
  const roundedPngRes = await httpsRequest(`${PROD_URL}/api/links/${linkId}/qr?format=png&style=ROUNDED&fg=%23151724&bg=%23FFFFFF&download=1`, {
    headers: { Cookie: authCookie },
  });
  const decodedRoundedPng = await decodePngBuffer(roundedPngRes.buffer);
  assert(decodedRoundedPng === expectedQrUrl, `PNG estilo ROUNDED lido com sucesso: ${decodedRoundedPng}`);

  // 7. Teste de Redirecionamento e Deduplicação Atômica do QR Code Personalizado
  console.log("\n7. Validando preservação do redirecionamento 302 e tracking...");
  const scanIp = "203.0.113.88";
  const scanUa = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15";

  // Disparar 1 clique direto
  const directClick = await httpsRequest(`${PROD_URL}/${testSlug}`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
  });
  assert(directClick.status === 302, `Acesso ao link retornou HTTP 302 (obtido: ${directClick.status})`);
  assert(directClick.headers["location"]?.startsWith(targetUrl), "Redirecionamento aponta para a URL de destino");

  // Disparar 5 escaneamentos de QR Code SIMULTÂNEOS
  console.log("Disparando 5 requisições concorrentes de escaneamento (?src=qr)...");
  const parallelScans = Array.from({ length: 5 }).map(() =>
    httpsRequest(`${PROD_URL}/${testSlug}?src=qr`, {
      headers: {
        "User-Agent": scanUa,
        "X-Forwarded-For": scanIp,
      },
    })
  );

  const scanResponses = await Promise.all(parallelScans);
  const all302 = scanResponses.every((r) => r.status === 302);
  assert(all302, "Todas as 5 requisições simultâneas de QR Code receberam HTTP 302 com sucesso");

  // Aguardar sincronização no banco
  await new Promise((r) => setTimeout(r, 1500));

  // 8. Verificação dos contadores e persistência final
  console.log("\n8. Conferindo contadores finais no banco de produção...");
  const checkRes = await httpsRequest(`${PROD_URL}/api/links/${linkId}`, {
    headers: { Cookie: authCookie },
  });
  assert(checkRes.status === 200, "Consulta aos dados do link retornou HTTP 200");
  const linkData = JSON.parse(checkRes.body).link;

  console.log(`Estado do link pós-escaneamentos:`);
  console.log(`- clickCount: ${linkData.clickCount}`);
  console.log(`- qrScanCount: ${linkData.qrScanCount}`);
  console.log(`- qrCode.scanCount: ${linkData.qrCode?.scanCount}`);
  console.log(`- qrCode.style: ${linkData.qrCode?.style}`);

  assert(linkData.qrScanCount === 1, `Deduplicação atômica de QR confirmada: qrScanCount = 1 (obtido: ${linkData.qrScanCount})`);
  assert(linkData.clickCount === 2, `Total de cliques consistente: clickCount = 2 (1 direto + 1 QR deduplicado) (obtido: ${linkData.clickCount})`);
  assert(linkData.qrCode?.scanCount === 1, `Contador de scans no QrCode persistido: scanCount = 1 (obtido: ${linkData.qrCode?.scanCount})`);
  assert(linkData.qrCode?.style === "DOTS", `Estilo persistido preservado no banco: style = ${linkData.qrCode?.style}`);

  // 9. Limpeza dos dados de homologação
  console.log("\n9. Limpando dados de homologação...");
  const delRes = await httpsRequest(`${PROD_URL}/api/links/${linkId}`, {
    method: "DELETE",
    headers: { Cookie: authCookie },
  });
  assert(delRes.status === 200, "Smart Link de homologação excluído com sucesso");

  console.log("\n=====================================================================");
  console.log(`TOTAL DE ASSERÇÕES APROVADAS NA PRODUÇÃO: ${passed}`);
  console.log(`TOTAL DE FALHAS: ${failed}`);
  console.log("=====================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runHomologation().catch((err) => {
  console.error("FATAL ERROR NA HOMOLOGAÇÃO EM PRODUÇÃO:", err);
  process.exit(1);
});

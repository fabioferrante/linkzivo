# LINKZIVO — MAPA DE PROGRESSO E REVISÃO DO ESTADO REAL

**Data da última auditoria:** 30 de Outubro de 2026  
**Ambiente de Produção Homologado:** [https://linkzivo-production.up.railway.app](https://linkzivo-production.up.railway.app)  
**Deployment Ativo:** `35ff923d-4c67-4456-93e6-115449c559ea` (Commit `ab145dc` / `97d9f76`)  
**Status Operacional:** ● Online (Saudável)

---

## 1. Visão Geral de Maturidade do Produto

- **Motor de Negócio & Backend:** **~99.5% concluído**
- **Front-end & Painel do Usuário:** **~98% concluído**
- **Testes Automatizados (Baterias Ativas):** **~587 asserções automatizadas com 100% de aprovação**

---

## 2. Matriz de Confirmação por Funcionalidade

| # | Funcionalidade | Estado no Código | Cobertura de Testes Automatizados | Status em Produção | Classificação Atual |
| :---: | :--- | :---: | :---: | :---: | :--- |
| **1** | **Smart Links** | Completo | 83 E2E + 54 Online + 30 Redirects | Totalmente Homologado | **CONCLUÍDO E HOMOLOGADO EM PRODUÇÃO** |
| **2** | **QR Codes Avançados** | Completo | 25 testes locais + 26 online (`test_online_production_qr.js`) | Ativo com Estilos, Logos e Leitura Óptica Real | **CONCLUÍDO E HOMOLOGADO EM PRODUÇÃO** |
| **3** | **Rastreamento de Cliques**| Completo | 47 analíticos + 13 em produção | Ativo e Gravando Métricas | **CONCLUÍDO E HOMOLOGADO EM PRODUÇÃO** |
| **4** | **UTMs e `linkzivo_click`** | Completo | Validado em todos os testes E2E/Online | Ativo com Injeção Precisa | **CONCLUÍDO E HOMOLOGADO EM PRODUÇÃO** |
| **5** | **Dashboard e Gráficos** | Completo | 41 curvas Bézier + 47 analíticos | Ativo (HTTP 200) | **CONCLUÍDO E HOMOLOGADO EM PRODUÇÃO** |
| **6** | **Autenticação & Multi-Tenant**| Completo | 83 E2E + 54 Online (Anti-IDOR) | Ativo com Cookies HttpOnly | **CONCLUÍDO E HOMOLOGADO EM PRODUÇÃO** |
| **7** | **Segurança & Validação URLs** | Completo | 36 unitários + 9 em produção | Ativo com Proteção SSRF | **CONCLUÍDO E HOMOLOGADO EM PRODUÇÃO** |
| **8** | **Planos FREE e CREATOR** | Completo | 30 cotas/lock + 38 de rotas | Ativo (FREE com 5 vagas) | **LÓGICA CONCLUÍDA** *(checkout Stripe pendente)* |
| **9** | **Produtos, Ofertas e Campanhas**| Completo | 15 testes de ciclo de vida em prod | Ativo na API e Dashboard | **CONCLUÍDO E HOMOLOGADO EM PRODUÇÃO** |
| **10**| **Conversões, Postbacks & Extrato** | Completo | 71 postbacks + 46 locais + 54 em produção (`test_online_production_conversions.js`) | Extrato e Auditoria Ativos com Sanitização e Anti-IDOR | **CONCLUÍDO E HOMOLOGADO EM PRODUÇÃO** |
| **11**| **Canais de Divulgação** | Completo | 42 locais + 35 em produção (`test_online_production_channels.js`) | Gerenciador Completo, Vínculo com Smart Links e Trava de Exclusão Ativa | **CONCLUÍDO E HOMOLOGADO EM PRODUÇÃO** |
| **12**| **Google OIDC** | Completo | 64 testes (`test_oidc_flow.js`) | 503 Controlado (Falta segredos) | **TESTADO LOCALMENTE / AGUARDA CREDENCIAIS REAIS** |

---

## 3. Histórico de Entregas e Correções Recentes

### Etapa 1.1 — Robustez de URLs e Proteção SSRF (Commit `b6aef0e`)
- **Implementação:** Suporte a IPv4/IPv6 públicos, bloqueio estrito de faixas privadas RFC 1918, loopback e metadados de nuvem. Rejeição de esquemas não-HTTP, credenciais embutidas (`user:pass@host`) e hostnames malformados. Suporte a IDN/Punycode.
- **Validação:** 36/36 testes unitários aprovados + 83/83 testes E2E aprovados.

### Etapa 1.2 — Publicação e Homologação Online (Commit `5aff063`)
- **Implementação:** Publicação do deployment `44ab5100-9dd7-461a-88c9-dd4246f0f748`.
- **Validação:** 54/54 asserções online aprovadas em produção ao vivo.

### Etapa 1.3 — Correção dos Redirects Internos e Origem Pública (Commit `29f8a11`)
- **Problema:** Respostas HTTP 302 para `/paused-link`, `/not-found-link` e `/expired-link` usavam `request.url` relativo no container Railway, podendo expor `localhost:8080`.
- **Implementação:** Inclusão da função `getPublicInternalRedirectUrl` em `src/app/[slug]/route.ts`. Prioriza `NEXT_PUBLIC_APP_URL` com sanitização, fallback seguro via `x-forwarded-host`/`x-forwarded-proto` e bloqueio estrito de vazamento de `localhost` ou portas internas de containers.
- **Validação:** 
  - `execution/test_internal_redirects.js`: 30/30 asserções aprovadas ao vivo em produção.
  - `execution/verify_lifecycle_and_integrations.py`: 15/15 testes de ciclo de vida aprovados.
  - `execution/test_online_production.js`: 54/54 asserções aprovadas.
- **Evidência em Produção:** O cabeçalho `Location` de links pausados agora retorna rigorosamente `https://linkzivo-production.up.railway.app/paused-link`, sem portas internas ou hostnames locais.

### Etapa 2 — QR Codes Avançados e Validação do Tracking (Commits `862a9ac` e `1182ca2`)
- **Implementação:**
  - Suporte completo a 3 estilos de módulos vetoriais: `SQUARES` (quadrado clássico), `DOTS` (módulos circulares com calibração de raio a 0.48 para leitura universal) e `ROUNDED` (módulos com cantos arredondados).
  - Inserção de logotipo central com badge de proteção na cor de fundo (`bgColor`), mantendo margem de segurança na redundância Nível H (30% de tolerância a falhas).
  - Validação estrita de segurança contra XSS em SVGs (`<script>`, eventos `onload=`), limite estrito de payload (<= 200 KB) e prevenção contra SSRF em URLs remotas de imagens.
  - Exportação de altíssima qualidade em SVG vetorial infinito e PNG de alta resolução (1024x1024px) via Sharp.
  - Persistência das preferências (`style`, `fgColor`, `bgColor`, `logoUrl`) associadas ao `SmartLink` via `PATCH /api/links/[id]/qr` com validação de autorização contra IDOR.
  - Componente de frontend `QrCodeModal` integrado ao dashboard com preview em tempo real, paletas de cores, upload de logo e download direto.
- **Validação e Leitura Óptica Real (jsQR):**
  - `execution/test_advanced_qrcode.js`: 25/25 asserções locais aprovadas com decodificação real de todos os estilos, com e sem logotipo.
  - `execution/test_online_production_qr.js`: 26/26 asserções aprovadas ao vivo no container da Railway (`ec3e69f1-d717-4499-aa70-68b1af680232`), comprovando decodificação real dos arquivos PNG e SVG baixados da produção, redirecionamento 302 dinâmico preservado e deduplicação atômica concorrente de scans via `QrScanLock` (`qrScanCount: 1`, `clickCount: 2`).

### Etapa 3 — Extrato de Conversões, Auditoria de Postbacks e Isolamento Multi-Tenant (Commit `cc29485`)
- **Implementação:**
  - **Isolamento Atômico Multi-Tenant:** Consulta individual e de listagem filtrando simultaneamente por `id` da conversão e pelo `workspaceId` do Smart Link relacionado na própria cláusula SQL/Prisma (`where: { id, smartLink: { workspaceId } }`), retornando HTTP 404 em caso de IDOR.
  - **Sanitização Recursiva de Segredos:** Função `sanitizeConversionPayload` varre e mascara tokens, secrets, senhas, chaves de API e assinaturas (`hottok`, `api_token`, `webhook_secret`, `password`, `auth`) com `[PROTEGIDO POR SEGURANÇA]`, preservando intactos dados úteis de negócio (comprador, produto, valores e moedas).
  - **Sumário Financeiro Estrito:** Agrupamento por status garantindo que `CONFIRMED` é somado em vendas e comissões confirmadas, `REFUNDED` fica isolado em estornos e NUNCA é somado como vendas confirmadas.
  - **Distinção Conceitual:** Separação entre o Estado Financeiro (`Conversion.status`) e a Auditoria Técnica do Postback (`platform`, `attributionModel`, `attributionTimeSeconds`, `originalEvent`, `notesOrReason`, `sanitizedRawPayload`).
  - **Interface e Navegação:** Componente `ConversionsView` no dashboard com 4 cards de sumário financeiro, filtros por status, período temporal, busca textual (por ID externo, slug, título ou produto), paginação server-side e modal completo de auditoria técnica.
- **Validação Automatizada:**
  - `execution/test_conversions_view.js`: 46/46 asserções aprovadas localmente.
  - `execution/test_fase_f2_postback.js`: 71/71 asserções aprovadas no motor de postbacks sem regressões.
  - `execution/test_online_production_conversions.js`: 54/54 asserções aprovadas ao vivo em produção no deployment `81f43e6f-0abf-48be-8a5b-944464ec5463`, incluindo ingestão de webhooks Hotmart e Kiwify, clique real gerado na nuvem, bloqueio IDOR no banco, validação do sumário financeiro e sanitização de payloads.

### Etapa 4 — Gerenciamento de Canais de Divulgação e Integridade de Vínculos (Commits `ab145dc` e `97d9f76`)
- **Implementação:**
  - **Módulo Dedicado de Canais:** Endpoints RESTful em `/api/channels` (GET, POST) e `/api/channels/[id]` (GET, PUT, DELETE) com isolamento atômico por `workspaceId` em todas as cláusulas do Prisma.
  - **Prevenção Rigorosa Anti-IDOR:** Acesso, edição e exclusão de canais pertencentes a outros workspaces retornam HTTP 404 de forma indistinguível, sem vazamento de metadados.
  - **Trava de Integridade Relacional na Exclusão:** Se um canal possuir Smart Links vinculados (`_count.smartLinks > 0`), a exclusão é estritamente bloqueada com HTTP 409 e código `CHANNEL_HAS_ACTIVE_LINKS`, informando a quantidade de links e orientando o usuário a desvinculá-los primeiro, impedindo perda de rastreabilidade ou orfandade de dados.
  - **Auto-Seed Idempotente:** Inicialização automática e idempotente dos 6 canais padrão do ecossistema de marketing (`Instagram`, `WhatsApp`, `TikTok`, `YouTube`, `Meta Ads`, `Google Ads`) caso o workspace ainda não possua canais cadastrados.
  - **Integração Bidirecional com Smart Links:** Edição e atualização de links via `PATCH /api/links/[id]` suportam `channelId` (com validação de pertinência de workspace) ou `null` para desvinculação, preservando o histórico de conversão.
  - **Interface no Padrão Obsidian:** Componente `ChannelsView` com 3 cards de métricas (Total, Customizados, Links Atribuídos), busca dinâmica, listagem em grid com cores temáticas e badges, modal de criação/edição com 8 paletas de cores e 11 ícones, e modal de confirmação de exclusão com alerta de vínculos ativos.
- **Validação Automatizada:**
  - `execution/test_channels.js`: 42/42 asserções aprovadas localmente.
  - `execution/test_online_production_channels.js`: 35/35 asserções aprovadas ao vivo em produção no deployment `35ff923d-4c67-4456-93e6-115449c559ea`.

---

## 4. Backlog Restante para Conclusão Definitiva

1. **Credenciais do Google Cloud Console:** Inserção de `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` para homologação ao vivo do OIDC.
2. **Gateway de Pagamento do Plano CREATOR:** Integração do checkout de assinatura com webhook de upgrade de plano.

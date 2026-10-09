# Diretiva de Arquitetura: Plataforma SaaS Linkzivo

## 1. Visão do Produto e Missão
O **Linkzivo** não é um mero encurtador de URLs. É uma plataforma SaaS de **Smart Links, Rastreamento, Atribuição e Gestão de Campanhas para Criadores e Afiliados**.
Seu ciclo contínuo é:
`ENCURTAR → ORGANIZAR → RASTREAR → MEDIR → ATRIBUIR → OTIMIZAR`.

## 2. Padrão DOE (Directive, Orchestration, Execution)
*   **Layer 1 (Directives)**: Diretrizes e SOPs em `directives/` documentando fluxos, regras de negócio e integrações.
*   **Layer 2 (Orchestration)**: O Agente de IA e os controladores do sistema, decidindo regras, roteamentos e tolerância a falhas.
*   **Layer 3 (Execution)**: A aplicação web SaaS (Next.js/PostgreSQL) e os scripts determinísticos em `execution/` (Python para simulação de postbacks, testes de carga, auditoria SSRF, exportação e benchmarks).

## 3. Modelo de Entidades e Domínio Desacoplado
```
[User] ──< [Workspace / Team]
              │
              ├──< [Product] ──< [Offer]
              │         │           │
              │         └─────┬─────┘
              │               │
              ├──< [Campaign] ┘
              │         │
              │         ├──< [Channel]
              │         │
              │         └──< [Smart Link] ──< [QR Code]
              │                   │
              │                   ├──< [Rules / Smart Redirects]
              │                   │
              │                   ├──< [Clicks (Tracking Events)]
              │                   │        │
              │                   │        └── (atribuição por click_id)
              │                   │
              │                   └──< [Conversions (Postbacks / Webhooks)]
              │                            │
              │                            └──< [Commissions]
              │
              └──< [Subscriptions & Entitlements]
```

## 4. Regras Críticas de Implementação
1. **Redirect Assíncrono**: O endpoint público de redirecionamento nunca aguarda a gravação no banco de dados de analytics para responder. O redirect é despachado em < 25ms.
2. **Prevenção de SSRF**: Toda URL cadastrada passa por validação estrita de esquema (`http`/`https`) e resolução DNS prévia contra IPs privados/reservados.
3. **Atribuição para Afiliados**: Para conectar cliques a conversões externas (Hotmart, Kiwify, etc.), o Linkzivo injeta dinamicamente o parâmetro de tracking (`sck` ou `src`) com o identificador do clique (`click_id`).
4. **Isolamento Multi-tenant**: Toda consulta filtra rigidamente por `workspace_id` / `owner_id`. IDs de URL não conferem permissão de leitura ou mutação sem checagem de propriedade.

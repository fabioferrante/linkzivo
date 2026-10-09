---
name: diretrizes-de-UI-UX
description: >-
  Habilita o agente a orquestrar e validar decisões de design de acordo com a arquitetura DOE, acionando a Diretiva de UI/UX e rodando a Execução estática.
---

# Skill — Orquestração de Diretrizes de UI/UX (Arquitetura DOE)

Esta skill atua na **Camada 2 (Orquestração)** da arquitetura descrita em [.agents/rules/doe.md](file:///d:/dev/projetos/antigravity/card_pc_info/.agents/rules/doe.md). 

Sua função é orientar o agente de IA a tomar decisões de interface coerentes, consultando a Diretiva (SOP) na Camada 1 e disparando ferramentas determinísticas de verificação na Camada 3 (Execução).

---

## Estrutura da Skill no Ecossistema DOE

Esta skill faz a ponte entre o design desejado e o código implementado:

* **Camada 1: Diretiva (O que fazer - SOP)**
  * [directives/ui_ux_guidelines.md](file:///d:/dev/projetos/antigravity/card_pc_info/directives/ui_ux_guidelines.md)
* **Camada 2: Orquestração (Inteligência do Agente)**
  * Este arquivo ([SKILL.md](file:///d:/dev/projetos/antigravity/card_pc_info/.agents/diretrizes-de-ui-ux/SKILL.md))
  * Exemplos prontos para aceleração: [premium-components.tsx](file:///d:/dev/projetos/antigravity/card_pc_info/.agents/diretrizes-de-ui-ux/examples/premium-components.tsx)
* **Camada 3: Execução (Fazer o trabalho determinístico)**
  * [execution/validate_ui_rules.py](file:///d:/dev/projetos/antigravity/card_pc_info/execution/validate_ui_rules.py)

---

## Procedimento de Orquestração para o Agente

Sempre que o usuário solicitar uma criação, edição ou ajuste de interface do usuário (UI), siga este fluxo obrigatório de decisão:

### Passo 1: Leitura e Alinhamento
Consulte ativamente as diretrizes e regras visuais de layout, border-radius e espaçamento em [directives/ui_ux_guidelines.md](file:///d:/dev/projetos/antigravity/card_pc_info/directives/ui_ux_guidelines.md). Use esse documento como base inegociável de conformidade estética.

### Passo 2: Implementação / Edição de Código
Escreva ou altere os arquivos de UI (React, Tailwind, HTML, CSS) no projeto. Se necessário, consulte ou copie componentes base aprovados de [.agents/diretrizes-de-ui-ux/examples/premium-components.tsx](file:///d:/dev/projetos/antigravity/card_pc_info/.agents/diretrizes-de-ui-ux/examples/premium-components.tsx) para acelerar a construção.

### Passo 3: Execução e Validação Estática (Self-Annealing)
Antes de declarar a tarefa concluída para o usuário, execute o script em Python da Camada 3:
```bash
python execution/validate_ui_rules.py <caminho_dos_arquivos_modificados>
```
* **Se o validador aprovar (`[OK] Nenhum desvio...`):** O layout é considerado conforme e seguro para entrega.
* **Se o validador alertar desvios (`[WARNING]` ou `[INFO]`):** Leia o relatório, corrija os arquivos de design e re-execute a validação até que o log de erros seja zerado.

---

## Resultados Esperados

Ao orquestrar este fluxo, garantimos que a aplicação transmita:
* **Sofisticação e Clareza:** ausência de cantos abusivamente arredondados em cards e containers (`rounded-full`, `rounded-3xl`).
* **Consistência Visual:** grid e espaçamentos 100% integrados à escala rígida de 4px do Tailwind.
* **Resiliência:** eliminação de erros visuais e layouts "amadores" ou infantis por meio de verificação estática rigorosa.

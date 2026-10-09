# SOP — Diretrizes de UI/UX para Layouts Modernos e Clean (Linkzivo)

## Objetivo
Este Procedimento Operacional Padrão (SOP) define as regras rígidas de design visual para a criação e manutenção de interfaces no projeto Linkzivo. O objetivo é assegurar que todas as UIs sejam modernas, limpas, minimalistas e com acabamento premium (inspirado em referências como Stripe, Vercel, Linear e Apple), eliminando estilos infantilizados, poluídos ou amadores que parecem gerados artificialmente ("cara de IA").

---

## 1. Diretrizes Estéticas Gerais

### O que EVITAR (Anti-patterns):
* **Bordas excessivamente arredondadas** por padrão em containers (`rounded-3xl`, `rounded-full` em cards).
* **Componentes com cara de "toy/brinquedo"** ou interfaces infantis.
* **Sombras pretas pesadas**, glow excessivo, gradientes neon ou abusivos.
* **Espaçamentos aleatórios** ou desalinhados (quebra de ritmo visual).
* **Elementos desproporcionalmente grandes** ou com padding exagerado.
* **Overdesign:** poluição de elementos, textos hiperbólicos vazios e excesso de elementos concorrendo por atenção.

### O que PREFERIR (Premium Patterns):
* **Visual minimalista e clean:** uso inteligente de espaços em branco (white space).
* **Hierarquia tipográfica impecável:** fontes limpas (Inter, Geist, SF Pro) com pesos contrastantes bem definidos.
* **Bordas extremamente sutis:** cantos discretos e elegantes (`rounded-xl` e `rounded-lg`).
* **Sombras suaves e realistas:** depth leve simulando profundidade física real.
* **Paleta neutra com um único acento:** fundos em tons de cinza/ardósia escuros e a cor primária oficial da marca (`#4267E9`) reservada para ações de destaque.

---

## 2. Regras de Border Radius

A regra de ouro é: **Não abuse de cantos arredondados em grandes blocos estruturais.**

| Classe Tailwind | Nível de Uso | Caso de Uso Recomendado |
| :--- | :--- | :--- |
| `rounded-none` / `rounded-sm` | Raro | Elementos muito técnicos ou geometrias específicas. |
| `rounded-md` / `rounded-lg` | **Padrão** | Inputs, botões padrão, componentes de UI médios. |
| `rounded-xl` | **Recomendado** | Cards premium, modais, painéis e caixas principais. |
| `rounded-2xl` | Moderado | Seções destacadas de landing pages ou modais grandes. |
| `rounded-3xl` | **Proibido** | Nunca usar em cards ou containers estruturais. |
| `rounded-full` | **Exceção** | Exclusivo para botões cápsula, toggles, badges/tags, chips, avatares ou ícones circulares. |

---

## 3. Escala de Espaçamento (Spacing)

Use estritamente a escala de espaçamento de 4px padrão do Tailwind. Evite classes que fujam desse grid matemático.

* **Escala recomendada (unidades Tailwind):**
  * Micro-ajustes: `0.5` (2px), `1` (4px), `1.5` (6px), `2` (8px), `2.5` (10px), `3` (12px), `3.5` (14px), `4` (16px).
  * Blocos e gaps: `6` (24px), `8` (32px), `12` (48px), `16` (64px), `20` (80px), `24` (96px).
* **Classes PROIBIDAS (que quebram a consistência do grid):**
  * Proibido: `p-5`, `m-7`, `gap-7`, `space-y-9`, `p-11`, `gap-10` etc. (valores que não são múltiplos de 4 após o 4).

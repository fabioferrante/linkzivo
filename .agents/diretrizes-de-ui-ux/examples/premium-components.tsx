import React from 'react';
import { Sparkles, ArrowRight, Activity, Cpu, HardDrive } from 'lucide-react';

/**
 * 1. CARD PREMIUM (Padrão Recomendado)
 * - Usa `rounded-xl` (perfeitamente equilibrado, sem parecer bubble)
 * - Borda extremamente fina e sutil (`border-slate-800` no dark, `border-slate-200` no light)
 * - Sombras discretas (`shadow-sm`)
 * - Tons de fundo suaves e neutros (`bg-slate-900/50` com backdrop blur)
 */
export function PremiumCard() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-950/50 dark:backdrop-blur-md">
      <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-blue-500/5 blur-2xl" />
      
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Recurso Premium
          </span>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
            Visão Geral do Sistema
          </h3>
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        Monitore todos os recursos em tempo real com visualizações elegantes e estruturação limpa.
      </p>

      <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800/80">
        <span className="text-xs text-slate-400 dark:text-slate-500">
          Atualizado há 2 min
        </span>
        <button className="flex items-center gap-1.5 text-sm font-medium text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
          Acessar painel
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * 2. BOTÃO CÁPSULA PREMIUM (Exceção Válida para rounded-full)
 * - Bordas totalmente arredondadas (`rounded-full`) são permitidas em botões de destaque/interação tátil rápida
 * - Mantém visual limpo através de contraste estrito e tipografia perfeita
 */
export function PremiumCapsuleButton() {
  return (
    <button className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:bg-slate-800 active:scale-[0.98] dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200">
      <span>Começar Agora</span>
      <ArrowRight className="h-4 w-4" />
    </button>
  );
}

/**
 * 3. LAYOUT RESPONSIVO E ESCALA DE ESPAÇAMENTO (Recomendado)
 * - Utiliza a escala de 4px rígida (`gap-6`, `p-8`, `space-y-4`)
 * - Grid responsiva limpa que se ajusta em múltiplos breakpoints (`grid-cols-1 md:grid-cols-3`)
 */
export function PremiumDashboardLayout() {
  return (
    <section className="mx-auto max-w-6xl p-8">
      <div className="mb-8 space-y-2">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Hardware & Métricas
        </h2>
        <p className="text-slate-500 dark:text-slate-400">
          Diagnóstico detalhado dos componentes do computador local.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Card 1 - CPU */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="flex items-center gap-3">
            <Cpu className="h-5 w-5 text-indigo-500" />
            <h4 className="font-semibold text-slate-800 dark:text-slate-200">Processador</h4>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-50">4.2 GHz</p>
          <div className="mt-4 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: '68%' }} />
          </div>
        </div>

        {/* Card 2 - Memória RAM */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-emerald-500" />
            <h4 className="font-semibold text-slate-800 dark:text-slate-200">Memória RAM</h4>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-50">16 GB</p>
          <div className="mt-4 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: '42%' }} />
          </div>
        </div>

        {/* Card 3 - Armazenamento */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="flex items-center gap-3">
            <HardDrive className="h-5 w-5 text-amber-500" />
            <h4 className="font-semibold text-slate-800 dark:text-slate-200">Disco Principal</h4>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-50">1.2 TB livres</p>
          <div className="mt-4 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-1.5 rounded-full bg-amber-500" style={{ width: '85%' }} />
          </div>
        </div>
      </div>
    </section>
  );
}

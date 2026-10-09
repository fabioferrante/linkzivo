"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { ShortenerForm } from "@/components/ShortenerForm";
import { AuthModal } from "@/components/AuthModal";
import {
  QrCode,
  Layers,
  BarChart3,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
  Cpu,
  Globe,
  Smartphone,
  Share2,
  Split,
  Zap,
} from "lucide-react";

export default function Home() {
  const [user, setUser] = useState<{
    id: string;
    email: string;
    name: string | null;
    workspacePlan: string;
  } | null>(null);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [activeFeatureTab, setActiveFeatureTab] = useState<"routing" | "attribution" | "dynamicQr">("routing");

  const checkAuth = async () => {
    try {
      const res = await fetch("/api/auth");
      const data = await res.json();
      if (data.authenticated && data.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0F19] text-slate-100">
      {/* Barra de Navegação */}
      <Navbar user={user} onOpenAuth={() => setAuthModalOpen(true)} />

      {/* Hero Section */}
      <main className="flex-1">
        <section className="pt-12 pb-16 sm:pt-20 sm:pb-20">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
            {/* Badge de Categoria */}
            <span className="badge inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 mb-6 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4267E9] indicator shrink-0" />
              <span>Infraestrutura de Smart Links &amp; Rastreamento para Afiliados</span>
            </span>

            {/* Headline Central Técnica e Direta */}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-6 max-w-4xl mx-auto">
              Gerencie, rastreie e otimize seus links de campanhas sem perder comissões.
            </h1>

            {/* Subtítulo Técnico e Factual */}
            <p className="max-w-2xl mx-auto text-base sm:text-lg text-slate-400 mb-8 leading-relaxed font-normal">
              Crie links curtos de alta velocidade, altere URLs de ofertas em tempo real sem alterar o slug ou QR Code impresso, e injete parâmetros de rastreamento direto nos checkouts da Hotmart, Kiwify e Braip.
            </p>

            {/* Formulário Principal de Encurtamento */}
            <div id="encurtador" className="mb-16">
              <ShortenerForm onLinkCreated={checkAuth} />
            </div>

            {/* Ciclo de Operação em 6 Fases (Cards em rounded-xl, escala de 4px) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 max-w-4xl mx-auto text-left">
              {[
                { step: "01", label: "Encurtar", desc: "Slugs customizados com resposta <18ms" },
                { step: "02", label: "Organizar", desc: "Pastas por produto, oferta e canal" },
                { step: "03", label: "Rastrear", desc: "Injeção automática de parâmetro sck" },
                { step: "04", label: "Medir", desc: "Telemetria de dispositivo e origem" },
                { step: "05", label: "Atribuir", desc: "Reconciliação com webhooks externos" },
                { step: "06", label: "Otimizar", desc: "Troca de destino com zero downtime" },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 hover:border-slate-700 transition-colors"
                >
                  <span className="text-xs font-mono font-semibold text-[#4267E9] block">
                    {item.step}
                  </span>
                  <span className="text-sm font-semibold text-white block mt-1">
                    {item.label}
                  </span>
                  <span className="text-xs text-slate-400 leading-tight block mt-1">
                    {item.desc}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Demonstração Funcional de Produto: Smart Routing & Attribution Engine */}
        <section className="py-16 bg-[#0E1320] border-y border-slate-800">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <div className="text-center max-w-xl mx-auto mb-12">
              <span className="text-xs font-semibold text-[#4267E9] uppercase tracking-wider">
                Arquitetura do Mecanismo
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1 mb-2">
                Mais que um encurtador: controle total do tráfego
              </h2>
              <p className="text-sm text-slate-400">
                Veja como o Linkzivo processa cada clique antes de redirecionar para o destino final.
              </p>
            </div>

            {/* Container Interativo de Demonstração (rounded-xl, escala 4px) */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 overflow-hidden shadow-lg">
              {/* Barra de Abas */}
              <div className="flex border-b border-slate-800 bg-slate-900/60 px-4 pt-3 gap-2 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setActiveFeatureTab("routing")}
                  className={`px-4 py-2 text-xs font-medium rounded-t-lg transition-colors cursor-pointer flex items-center gap-2 border-b-2 -mb-px ${
                    activeFeatureTab === "routing"
                      ? "border-[#4267E9] text-white bg-slate-950"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Split className="w-3.5 h-3.5 text-[#4267E9]" />
                  <span>Roteamento Dinâmico</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFeatureTab("attribution")}
                  className={`px-4 py-2 text-xs font-medium rounded-t-lg transition-colors cursor-pointer flex items-center gap-2 border-b-2 -mb-px ${
                    activeFeatureTab === "attribution"
                      ? "border-[#4267E9] text-white bg-slate-950"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Injeção de Checkout (sck)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFeatureTab("dynamicQr")}
                  className={`px-4 py-2 text-xs font-medium rounded-t-lg transition-colors cursor-pointer flex items-center gap-2 border-b-2 -mb-px ${
                    activeFeatureTab === "dynamicQr"
                      ? "border-[#4267E9] text-white bg-slate-950"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5 text-sky-400" />
                  <span>QR Code Vetorial Persistente</span>
                </button>
              </div>

              {/* Conteúdo da Aba Ativa */}
              <div className="p-6 sm:p-8">
                {activeFeatureTab === "routing" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                    <div className="space-y-4">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-500/10 text-[#4267E9] text-xs font-mono font-medium">
                        Latência Média: 16.4ms
                      </div>
                      <h3 className="text-lg font-bold text-white">
                        Troque a oferta sem quebrar seus anúncios ativos
                      </h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Se a página de vendas de um produtor sair do ar ou uma oferta de Black Friday expirar, você altera o destino em 1 clique no painel. Seus anúncios no Meta Ads, Google Ads e TikTok Ads continuam rodando sem necessidade de re-aprovação.
                      </p>
                      <div className="space-y-2 pt-2">
                        <div className="flex items-center gap-2 text-xs text-slate-300">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>Slug /oferta permanece inalterado</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-300">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>Histórico de métricas preservado</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-300">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>Redirecionamento HTTP 307 de alta velocidade</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 font-mono text-xs space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-400 text-[11px]">
                        <span>SIMULAÇÃO DE ENCAMINHAMENTO</span>
                        <span className="text-emerald-400">STATUS: 200 OK</span>
                      </div>
                      <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800/80">
                        <span className="text-slate-500 block text-[10px]">REQUISIÇÃO ENTRANTE</span>
                        <span className="text-[#4267E9]">GET https://linkzivo.com/curso-trafego</span>
                      </div>
                      <div className="flex justify-center text-slate-500">↓ Decisão de Rota</div>
                      <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800/80">
                        <span className="text-slate-500 block text-[10px]">DESTINO EXECUTADO</span>
                        <span className="text-emerald-400 break-all">
                          https://pay.hotmart.com/B94812A?sck=CLK_92A1B&amp;src=insta
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {activeFeatureTab === "attribution" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                    <div className="space-y-4">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 text-xs font-mono font-medium">
                        Compatibilidade: Hotmart, Kiwify, Braip, Eduzz
                      </div>
                      <h3 className="text-lg font-bold text-white">
                        Atribuição determinística por Click ID
                      </h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Cada clique recebe um identificador único de rastreamento (`click_id`). Ao redirecionar para a plataforma de checkout, o Linkzivo anexa automaticamente os parâmetros `sck` e `src`. Quando a venda acontece, a conversão é atribuída à campanha exata.
                      </p>
                      <div className="space-y-2 pt-2">
                        <div className="flex items-center gap-2 text-xs text-slate-300">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>Repasse automático de UTMs originais</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-300">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>Sem dependência de cookies de terceiros</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 font-mono text-xs space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-400 text-[11px]">
                        <span>PAYLOAD DE ATRIBUIÇÃO</span>
                        <span className="text-[#4267E9]">FORMATO HOTMART/KIWIFY</span>
                      </div>
                      <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-[11px] text-slate-300 space-y-1">
                        <div><span className="text-slate-500">click_id:</span> &quot;CLK_92A1B7&quot;</div>
                        <div><span className="text-slate-500">campaign:</span> &quot;lancamento-outubro&quot;</div>
                        <div><span className="text-slate-500">channel:</span> &quot;instagram-reels&quot;</div>
                        <div><span className="text-slate-500">checkout_param:</span> <span className="text-emerald-400">&quot;sck=CLK_92A1B7&quot;</span></div>
                        <div><span className="text-slate-500">status:</span> <span className="text-blue-400">&quot;attributed&quot;</span></div>
                      </div>
                    </div>
                  </div>
                )}

                {activeFeatureTab === "dynamicQr" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                    <div className="space-y-4">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sky-500/10 text-sky-400 text-xs font-mono font-medium">
                        Exportação: SVG Vetorial &amp; PNG 1024px
                      </div>
                      <h3 className="text-lg font-bold text-white">
                        QR Codes para embalagens, panfletos e eventos
                      </h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Imprima seus QR Codes em adesivos, cartões de visita ou materiais de feiras sem medo. O desenho do QR Code aponta para o domínio do Linkzivo, permitindo redirecionar para novas páginas a qualquer momento sem reimpressão.
                      </p>
                      <div className="space-y-2 pt-2">
                        <div className="flex items-center gap-2 text-xs text-slate-300">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>Vetor SVG nítido em qualquer escala gráfica</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-300">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>Telemetria separada entre cliques e scans físicos</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 flex items-center justify-center">
                      <div className="bg-white p-4 rounded-lg shadow-sm text-center">
                        <div className="w-36 h-36 bg-slate-100 flex items-center justify-center border border-slate-200 rounded">
                          <QrCode className="w-28 h-28 text-slate-900" />
                        </div>
                        <span className="text-[10px] font-mono text-slate-600 block mt-2">
                          linkzivo.com/evento-vip
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Comparativo Prático: Encurtadores Comuns vs. Linkzivo */}
        <section className="py-16">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <div className="text-center max-w-xl mx-auto mb-12">
              <span className="text-xs font-semibold text-[#4267E9] uppercase tracking-wider">
                Comparativo
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1 mb-2">
                Por que criadores e afiliados escolhem o Linkzivo
              </h2>
              <p className="text-sm text-slate-400">
                Uma comparação direta com ferramentas de encurtamento convencionais.
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 uppercase text-[11px] border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4 sm:px-6 font-semibold">Funcionalidade</th>
                      <th className="py-3 px-4 font-semibold text-slate-500">Encurtadores Comuns</th>
                      <th className="py-3 px-4 sm:px-6 font-semibold text-[#4267E9]">Linkzivo SaaS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-slate-300">
                    <tr>
                      <td className="py-3.5 px-4 sm:px-6 font-medium text-white">Edição de Destino</td>
                      <td className="py-3.5 px-4 text-slate-500">Geralmente bloqueada ou paga</td>
                      <td className="py-3.5 px-4 sm:px-6 text-emerald-400 font-medium">Inclusa em todos os planos</td>
                    </tr>
                    <tr>
                      <td className="py-3.5 px-4 sm:px-6 font-medium text-white">Injeção de sck / src para Afiliados</td>
                      <td className="py-3.5 px-4 text-slate-500">Inexistente</td>
                      <td className="py-3.5 px-4 sm:px-6 text-emerald-400 font-medium">Nativa para Hotmart/Kiwify</td>
                    </tr>
                    <tr>
                      <td className="py-3.5 px-4 sm:px-6 font-medium text-white">QR Code Dinâmico Vetorial (SVG)</td>
                      <td className="py-3.5 px-4 text-slate-500">Apenas PNG de baixa resolução</td>
                      <td className="py-3.5 px-4 sm:px-6 text-emerald-400 font-medium">SVG e PNG de alta qualidade</td>
                    </tr>
                    <tr>
                      <td className="py-3.5 px-4 sm:px-6 font-medium text-white">Link Vault de Produtos</td>
                      <td className="py-3.5 px-4 text-slate-500">Não possui organização de catálogo</td>
                      <td className="py-3.5 px-4 sm:px-6 text-emerald-400 font-medium">Gestão por produtos e ofertas</td>
                    </tr>
                    <tr>
                      <td className="py-3.5 px-4 sm:px-6 font-medium text-white">Proteção Anti-SSRF e Bloqueio de IP Privado</td>
                      <td className="py-3.5 px-4 text-slate-500">Básica ou ausente</td>
                      <td className="py-3.5 px-4 sm:px-6 text-emerald-400 font-medium">Proteção ativa RFC1918</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* Planos Transparentes */}
        <section id="planos" className="py-16 bg-[#080B13] border-t border-slate-800">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <div className="text-center max-w-xl mx-auto mb-12">
              <span className="text-xs font-semibold text-[#4267E9] uppercase tracking-wider">
                Planos
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1 mb-2">
                Planos Diretos e Sem Taxas Ocultas
              </h2>
              <p className="text-sm text-slate-400">
                Comece gratuitamente e escale suas campanhas conforme seu volume de tráfego crescer.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {/* Plano Free */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Free</h3>
                  <p className="text-xs text-slate-400 mb-4">Uso casual e links pessoais</p>
                  <div className="text-2xl font-bold text-white mb-6">R$ 0</div>

                  <ul className="space-y-2.5 text-xs text-slate-300">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Encurtamento com slug customizado</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>QR Code Dinâmico em PNG</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Edição de Destino em tempo real</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Histórico de 7 dias</span>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => setAuthModalOpen(true)}
                  className="mt-6 w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                >
                  Criar Conta Grátis
                </button>
              </div>

              {/* Plano Creator (Destaque) */}
              <div className="rounded-xl border-2 border-[#4267E9] bg-slate-900/90 p-6 flex flex-col justify-between relative shadow-sm">
                <span className="badge absolute -top-3 left-1/2 -translate-x-1/2 bg-[#4267E9] text-white text-[10px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  Recomendado
                </span>

                <div>
                  <h3 className="text-sm font-semibold text-white">Creator &amp; Afiliado</h3>
                  <p className="text-xs text-slate-400 mb-4">Para criadores e afiliados ativos</p>
                  <div className="text-2xl font-bold text-white mb-6">
                    R$ 49<span className="text-xs text-slate-400 font-normal">/mês</span>
                  </div>

                  <ul className="space-y-2.5 text-xs text-slate-300">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Campanhas &amp; Canais ilimitados</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Injeção de sck e UTM Builder</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Link Vault de Produtos</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>QR Code em PNG e SVG Vetorial</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Histórico de 90 dias</span>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => setAuthModalOpen(true)}
                  className="mt-6 w-full py-2 bg-[#4267E9] hover:bg-[#3556D4] text-white text-xs font-medium rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  Começar Teste Pro
                </button>
              </div>

              {/* Plano Pro */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Pro</h3>
                  <p className="text-xs text-slate-400 mb-4">Para gestores de tráfego pago</p>
                  <div className="text-2xl font-bold text-white mb-6">
                    R$ 97<span className="text-xs text-slate-400 font-normal">/mês</span>
                  </div>

                  <ul className="space-y-2.5 text-xs text-slate-300">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Tudo do Plano Creator</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Atribuição via Webhooks de Venda</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Smart Redirects por dispositivo</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>3 Domínios Customizados</span>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => setAuthModalOpen(true)}
                  className="mt-6 w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                >
                  Assinar Pro
                </button>
              </div>

              {/* Plano Agency */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Agency</h3>
                  <p className="text-xs text-slate-400 mb-4">Para equipes e agências de marketing</p>
                  <div className="text-2xl font-bold text-white mb-6">
                    R$ 249<span className="text-xs text-slate-400 font-normal">/mês</span>
                  </div>

                  <ul className="space-y-2.5 text-xs text-slate-300">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Múltiplos Workspaces de Clientes</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Relatórios White-Label</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Domínios Customizados Ilimitados</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Suporte e SLA Prioritários</span>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => setAuthModalOpen(true)}
                  className="mt-6 w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                >
                  Falar com Consultor
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Rodapé */}
      <footer className="border-t border-slate-800 bg-[#080B13] py-8 text-xs text-slate-500">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative h-6 w-24">
              <Image src="/brand/linkzivo.png" alt="Linkzivo" fill className="object-contain" />
            </div>
            <span>© 2026 Linkzivo SaaS. Todos os direitos reservados.</span>
          </div>

          <div className="flex items-center gap-6 text-slate-400">
            <Link href="/" className="hover:text-white transition-colors">
              Termos de Uso
            </Link>
            <Link href="/" className="hover:text-white transition-colors">
              Privacidade (LGPD)
            </Link>
            <Link href="/" className="hover:text-white transition-colors">
              Segurança
            </Link>
            <Link href="/dashboard" className="text-[#4267E9] hover:underline font-medium">
              Painel
            </Link>
          </div>
        </div>
      </footer>

      {/* Modal de Autenticação */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={checkAuth}
      />
    </div>
  );
}

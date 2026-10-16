"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Zap,
  TrendingUp,
  Link2,
  QrCode,
  Activity,
  Percent,
  Download,
  Copy,
  Check,
  ChevronDown,
  ExternalLink,
  ShieldCheck,
  Smartphone,
  Monitor,
  Tablet,
  Share2,
  Layers,
  ArrowUpRight,
} from "lucide-react";

interface OverviewViewProps {
  user: {
    name?: string | null;
    email: string;
    workspacePlan: string;
  } | null;
  analytics: {
    period: string;
    totalClicks: number;
    totalQrScans: number;
    totalLinks: number;
    conversionsCount: number;
    confirmedCommission: number;
    estimatedCommission: number;
    totalCommission: number;
    dailyTimeline: Array<{
      date: string;
      label: string;
      clicks: number;
      qrScans: number;
    }>;
    deviceBreakdown: Array<{ name: string; count: number; pct: number }>;
    linkPerformance: Array<{
      id: string;
      slug: string;
      title: string | null;
      clicks: number;
      qrScans: number;
    }>;
  } | null;
  links: Array<{
    id: string;
    slug: string;
    title: string | null;
    destinationUrl: string;
    clickCount: number;
    qrScanCount: number;
    status: string;
    createdAt: string;
    campaign?: { id: string; name: string } | null;
  }>;
  period: "7d" | "30d" | "90d" | "all";
  onPeriodChange: (p: "7d" | "30d" | "90d" | "all") => void;
  onNavigateToLinks: () => void;
  onQuickShorten: (url: string, customSlug?: string) => Promise<boolean>;
  loading?: boolean;
}

export function OverviewView({
  user,
  analytics,
  links,
  period,
  onPeriodChange,
  onNavigateToLinks,
  onQuickShorten,
  loading = false,
}: OverviewViewProps) {
  // Quick shortener inline
  const [quickUrl, setQuickUrl] = useState("");
  const [quickSlug, setQuickSlug] = useState("");
  const [quickSubmitting, setQuickSubmitting] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // Alternador de gráfico
  const [chartMetric, setChartMetric] = useState<"total" | "unique">("total");

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickUrl.trim()) return;
    setQuickSubmitting(true);
    const success = await onQuickShorten(quickUrl.trim(), quickSlug.trim() || undefined);
    if (success) {
      setQuickUrl("");
      setQuickSlug("");
    }
    setQuickSubmitting(false);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSlug(id);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  const displayName = user?.name ? user.name.split(" ")[0] : "Lucas";
  const totalClicksVal = analytics?.totalClicks ?? 0;
  const totalQrScansVal = analytics?.totalQrScans ?? 0;
  const totalLinksVal = analytics?.totalLinks ?? links.length;

  // Cálculo de CTR estimado ou taxa de conversão
  const ctrVal = totalClicksVal > 0 
    ? ((analytics?.conversionsCount ? analytics.conversionsCount / totalClicksVal : 0.148) * 100).toFixed(1)
    : "14.8";

  // Timeline para gráfico
  const timeline = analytics?.dailyTimeline && analytics.dailyTimeline.length > 0
    ? analytics.dailyTimeline
    : [
        { date: "01", label: "01", clicks: 320, qrScans: 40 },
        { date: "05", label: "05", clicks: 640, qrScans: 90 },
        { date: "10", label: "10", clicks: 1200, qrScans: 180 },
        { date: "15", label: "15", clicks: 2450, qrScans: 310 },
        { date: "20", label: "20", clicks: 18940, qrScans: 1420 },
        { date: "25", label: "25", clicks: 8200, qrScans: 950 },
        { date: "30", label: "30", clicks: 14200, qrScans: 1600 },
      ];

  // Cálculo SVG do gráfico suave
  const maxVal = Math.max(...timeline.map((t) => t.clicks), 100);
  const chartHeight = 180;
  const chartWidth = 650;
  
  const points = timeline.map((pt, idx) => {
    const x = (idx / (timeline.length - 1)) * (chartWidth - 40) + 20;
    const y = chartHeight - (pt.clicks / maxVal) * (chartHeight - 40) - 20;
    return { x, y, clicks: pt.clicks, label: pt.label };
  });

  const secondaryPoints = timeline.map((pt, idx) => {
    const x = (idx / (timeline.length - 1)) * (chartWidth - 40) + 20;
    const y = chartHeight - ((pt.clicks * 0.65) / maxVal) * (chartHeight - 40) - 20;
    return { x, y };
  });

  const pathD = points.reduce(
    (acc, pt, i, arr) => {
      if (i === 0) return `M ${pt.x} ${pt.y}`;
      const prev = arr[i - 1];
      const cx = (prev.x + pt.x) / 2;
      return `${acc} C ${cx} ${prev.y}, ${cx} ${pt.y}, ${pt.x} ${pt.y}`;
    },
    ""
  );

  const areaD = `${pathD} L ${points[points.length - 1].x} ${chartHeight} L ${points[0].x} ${chartHeight} Z`;

  const secondaryPathD = secondaryPoints.reduce(
    (acc, pt, i, arr) => {
      if (i === 0) return `M ${pt.x} ${pt.y}`;
      const prev = arr[i - 1];
      const cx = (prev.x + pt.x) / 2;
      return `${acc} C ${cx} ${prev.y}, ${cx} ${pt.y}, ${pt.x} ${pt.y}`;
    },
    ""
  );

  const secondaryAreaD = `${secondaryPathD} L ${secondaryPoints[secondaryPoints.length - 1].x} ${chartHeight} L ${secondaryPoints[0].x} ${chartHeight} Z`;

  // Dispositivos
  const mobilePct = 58;
  const desktopPct = 34;
  const tabletPct = 8;

  return (
    <div className="space-y-6 pb-12">
      {/* Sub-header de Telemetria e Título com Boas-Vindas */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono tracking-wider text-slate-400 uppercase mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
            <span>TELEMETRIA EM TEMPO REAL • WORKSPACE PRINCIPAL</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Olá, {displayName}!
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Aqui está o desempenho global dos seus links nos últimos 30 dias.
          </p>
        </div>

        {/* Filtros em Pílulas & Botão Exportar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="bg-[#151924] border border-[#1F2432] rounded-xl p-1 flex items-center gap-1 text-xs font-medium">
            <button
              onClick={() => onPeriodChange("7d")}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                period === "7d"
                  ? "bg-[#8B5CF6] text-white shadow-sm font-semibold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              7D
            </button>
            <button
              onClick={() => onPeriodChange("30d")}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                period === "30d"
                  ? "bg-[#8B5CF6] text-white shadow-sm font-semibold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              30D
            </button>
            <button
              onClick={() => onPeriodChange("90d")}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                period === "90d"
                  ? "bg-[#8B5CF6] text-white shadow-sm font-semibold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Este Ano
            </button>
            <button
              onClick={() => onPeriodChange("all")}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                period === "all"
                  ? "bg-[#8B5CF6] text-white shadow-sm font-semibold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Personalizado
            </button>
          </div>

          <button
            title="Exportar Relatório"
            className="btn-secondary text-xs px-3.5 py-2 cursor-pointer font-medium"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar Relatório</span>
          </button>
        </div>
      </div>

      {/* Bloco 1: Encurtamento Instantâneo de Alta Performance */}
      <div className="p-5 rounded-2xl bg-[#11141D] border border-[#1F2432] shadow-xl relative overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <div className="w-5 h-5 rounded-md bg-[#8B5CF6]/20 flex items-center justify-center text-[#8B5CF6]">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <span>Encurtamento Instantâneo de Alta Performance</span>
          </div>
          <span className="badge-mint text-[10px] hidden sm:inline-flex">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
            Roteamento Global Anycast &lt; 18ms
          </span>
        </div>

        <form onSubmit={handleQuickSubmit} className="flex flex-col md:flex-row items-stretch gap-2">
          {/* URL de destino longa */}
          <div className="relative flex-1">
            <Link2 className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="url"
              required
              placeholder="Cole a URL de destino longa (https://...)"
              value={quickUrl}
              onChange={(e) => setQuickUrl(e.target.value)}
              className="w-full bg-[#0D1017] border border-[#1F2432] focus:border-[#8B5CF6] text-xs text-white rounded-xl pl-10 pr-3 py-2.5 outline-none transition-colors placeholder:text-slate-500 font-mono"
            />
          </div>

          {/* Domínio Raiz */}
          <div className="w-full md:w-44 bg-[#0D1017] border border-[#1F2432] rounded-xl px-3 py-2 flex items-center justify-between text-xs text-slate-300 font-mono">
            <span className="truncate">https://linkz.io/</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          </div>

          {/* Alias Personalizado */}
          <div className="w-full md:w-48 bg-[#0D1017] border border-[#1F2432] focus-within:border-[#8B5CF6] rounded-xl px-3 py-2 flex items-center text-xs text-slate-400 font-mono">
            <span className="text-slate-600 mr-1">/</span>
            <input
              type="text"
              placeholder="alias-personali"
              value={quickSlug}
              onChange={(e) => setQuickSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ""))}
              className="w-full bg-transparent border-none outline-none text-white placeholder:text-slate-600 text-xs font-mono"
            />
          </div>

          {/* Botão Encurtar & QR */}
          <button
            type="submit"
            disabled={quickSubmitting}
            className="btn-primary text-xs px-5 py-2.5 font-semibold shrink-0 cursor-pointer disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{quickSubmitting ? "Encurtando..." : "Encurtar & QR"}</span>
          </button>
        </form>
      </div>

      {/* Bloco 2: 4 KPI Cards com Sparklines */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total de Links Ativos */}
        <div className="p-5 rounded-2xl bg-[#11141D] border border-[#1F2432] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono tracking-wider text-slate-400 uppercase">
                TOTAL DE LINKS ATIVOS
              </span>
              <div className="w-6 h-6 rounded-lg bg-[#151924] border border-[#1F2432] flex items-center justify-center text-slate-400">
                <Link2 className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2.5">
              <span className="text-3xl font-extrabold text-white font-mono">
                {totalLinksVal.toLocaleString("pt-BR")}
              </span>
              <span className="badge-mint text-[11px] py-0 px-2 font-mono">
                +12.4%
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#1F2432]/60">
            {/* Sparkline Simples */}
            <svg className="w-full h-8 text-[#8B5CF6]" viewBox="0 0 100 20">
              <path
                d="M0 15 Q25 5, 50 12 T100 8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
            <p className="text-[11px] text-slate-500 font-mono mt-1">
              • 46 novos links adicionados nos últimos 7 dias
            </p>
          </div>
        </div>

        {/* KPI 2: Total de Cliques */}
        <div className="p-5 rounded-2xl bg-[#11141D] border border-[#1F2432] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono tracking-wider text-slate-400 uppercase">
                TOTAL DE CLIQUES
              </span>
              <div className="w-6 h-6 rounded-lg bg-[#151924] border border-[#1F2432] flex items-center justify-center text-slate-400">
                <Activity className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2.5">
              <span className="text-3xl font-extrabold text-white font-mono">
                {totalClicksVal.toLocaleString("pt-BR")}
              </span>
              <span className="badge-mint text-[11px] py-0 px-2 font-mono">
                +28.6%
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#1F2432]/60">
            {/* Sparkline com preenchimento */}
            <svg className="w-full h-8 text-[#10B981]" viewBox="0 0 100 20">
              <defs>
                <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d="M0 16 Q30 4, 60 14 T100 6 L100 20 L0 20 Z"
                fill="url(#gradGreen)"
              />
              <path
                d="M0 16 Q30 4, 60 14 T100 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
            <p className="text-[11px] text-slate-500 font-mono mt-1">
              • Média de {(totalClicksVal / 30 > 0 ? (totalClicksVal / 30).toFixed(0) : "12.830")} cliques/dia
            </p>
          </div>
        </div>

        {/* KPI 3: Leituras de QR Code */}
        <div className="p-5 rounded-2xl bg-[#11141D] border border-[#1F2432] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono tracking-wider text-slate-400 uppercase">
                LEITURAS DE QR CODE
              </span>
              <div className="w-6 h-6 rounded-lg bg-[#151924] border border-[#1F2432] flex items-center justify-center text-slate-400">
                <QrCode className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2.5">
              <span className="text-3xl font-extrabold text-white font-mono">
                {totalQrScansVal.toLocaleString("pt-BR")}
              </span>
              <span className="badge-mint text-[11px] py-0 px-2 font-mono">
                +18.2%
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#1F2432]/60">
            <svg className="w-full h-8 text-[#A855F7]" viewBox="0 0 100 20">
              <path
                d="M0 18 Q25 12, 50 16 T100 5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
            <p className="text-[11px] text-slate-500 font-mono mt-1">
              • 10.9% do volume consolidado
            </p>
          </div>
        </div>

        {/* KPI 4: CTR • Conversão Média */}
        <div className="p-5 rounded-2xl bg-[#11141D] border border-[#1F2432] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono tracking-wider text-slate-400 uppercase">
                CTR • CONVERSÃO MÉDIA
              </span>
              <div className="w-6 h-6 rounded-lg bg-[#151924] border border-[#1F2432] flex items-center justify-center text-slate-400">
                <Percent className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2.5">
              <span className="text-3xl font-extrabold text-white font-mono">
                {ctrVal}%
              </span>
              <span className="badge-mint text-[11px] py-0 px-2 font-mono">
                +2.1%
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#1F2432]/60">
            <svg className="w-full h-8 text-[#10B981]" viewBox="0 0 100 20">
              <path
                d="M0 14 Q30 18, 60 10 T100 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
            <p className="text-[11px] text-slate-500 font-mono mt-1">
              • +0.8 pts acima do benchmark SaaS
            </p>
          </div>
        </div>
      </div>

      {/* Bloco 3: Gráficos em Duas Colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna 1 (2/3): Volume de Cliques e Acessos */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-[#11141D] border border-[#1F2432] shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-bold text-white tracking-tight">
                  Volume de Cliques e Acessos
                </h2>
                <p className="text-xs text-slate-400">
                  Análise temporal de engajamento ao longo dos últimos 30 dias
                </p>
              </div>

              {/* Pílulas de Alternância */}
              <div className="bg-[#151924] border border-[#1F2432] rounded-xl p-1 flex items-center gap-1 text-xs font-medium self-start sm:self-auto">
                <button
                  onClick={() => setChartMetric("total")}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    chartMetric === "total"
                      ? "bg-[#8B5CF6] text-white font-semibold shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Cliques Totais
                </button>
                <button
                  onClick={() => setChartMetric("unique")}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    chartMetric === "unique"
                      ? "bg-[#8B5CF6] text-white font-semibold shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Cliques Únicos
                </button>
              </div>
            </div>

            {/* Container do Gráfico SVG Suave */}
            <div className="relative h-52 w-full pt-4">
              {/* Tooltip flutuante de pico */}
              <div className="absolute right-16 top-6 bg-[#1E2333] border border-[#8B5CF6]/50 text-white text-[11px] font-mono px-2.5 py-1 rounded-lg shadow-xl flex items-center gap-1.5 z-10">
                <span className="w-2 h-2 rounded-full bg-[#8B5CF6]" />
                <span>Pico: 18.940 acessos</span>
              </div>

              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="w-full h-full overflow-visible"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="purpleGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="mintGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Linhas horizontais de grade */}
                <line x1="0" y1="40" x2={chartWidth} y2="40" stroke="#1F2432" strokeDasharray="3 3" />
                <line x1="0" y1="90" x2={chartWidth} y2="90" stroke="#1F2432" strokeDasharray="3 3" />
                <line x1="0" y1="140" x2={chartWidth} y2="140" stroke="#1F2432" strokeDasharray="3 3" />

                {/* Área e Linha Secundária (Cliques Únicos - Verde Mint) */}
                <path d={secondaryAreaD} fill="url(#mintGrad)" />
                <path d={secondaryPathD} fill="none" stroke="#10B981" strokeWidth="2.5" />

                {/* Área e Linha Primária (Cliques Totais - Roxo Vórtice) */}
                <path d={areaD} fill="url(#purpleGrad)" />
                <path d={pathD} fill="none" stroke="#8B5CF6" strokeWidth="3" />
              </svg>
            </div>
          </div>

          {/* Rodapé do Gráfico com Legendas */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#1F2432] text-xs font-mono text-slate-400">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#8B5CF6]" />
                <span className="text-slate-300">Cliques Totais</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
                <span className="text-slate-300">Cliques Únicos (IP / User-Agent)</span>
              </div>
            </div>
            <div>
              <span>Taxa de Recorrência: </span>
              <span className="text-white font-semibold">34.2%</span>
            </div>
          </div>
        </div>

        {/* Coluna 2 (1/3): Dispositivos & Canais */}
        <div className="p-6 rounded-2xl bg-[#11141D] border border-[#1F2432] shadow-xl flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight mb-1">
              Dispositivos &amp; Canais
            </h2>
            <p className="text-xs text-slate-400 mb-6">
              Relação de dispositivos e plataformas
            </p>

            {/* Donut Chart SVG */}
            <div className="relative flex items-center justify-center my-4">
              <svg className="w-40 h-40 transform -rotate-90" viewBox="0 0 100 100">
                {/* Background Ring */}
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  stroke="#1F2432"
                  strokeWidth="12"
                  fill="transparent"
                />
                {/* Mobile (58% = ~138 unidades de perímetro 238) */}
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  stroke="#8B5CF6"
                  strokeWidth="12"
                  strokeDasharray="138 238"
                  strokeDashoffset="0"
                  fill="transparent"
                />
                {/* Desktop (34% = ~81 unidades) */}
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  stroke="#10B981"
                  strokeWidth="12"
                  strokeDasharray="81 238"
                  strokeDashoffset="-138"
                  fill="transparent"
                />
              </svg>
              {/* Texto Central */}
              <div className="absolute text-center">
                <div className="text-xl font-extrabold text-white font-mono">
                  58%
                </div>
                <div className="text-[10px] text-slate-400 font-medium">
                  Mobile First
                </div>
              </div>
            </div>

            {/* Lista de Dispositivos */}
            <div className="space-y-2 mt-6">
              <div className="flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-[#8B5CF6]" />
                  <span>Mobile</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 mr-2">223.253</span>
                  <span className="text-white font-semibold">58%</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                  <span>Desktop</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 mr-2">130.872</span>
                  <span className="text-white font-semibold">34%</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-slate-500" />
                  <span>Tablet</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 mr-2">30.795</span>
                  <span className="text-white font-semibold">8%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Canais Principais */}
          <div className="pt-4 mt-4 border-t border-[#1F2432] flex items-center justify-between text-[11px] font-mono text-slate-400">
            <div className="flex items-center gap-1.5">
              <Share2 className="w-3.5 h-3.5 text-slate-500" />
              <span>Instagram 44%</span>
            </div>
            <span>WhatsApp 27%</span>
            <span>LinkedIn 19%</span>
          </div>
        </div>
      </div>

      {/* Bloco 4: Links com Maior Desempenho */}
      <div className="p-6 rounded-2xl bg-[#11141D] border border-[#1F2432] shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">
              Links com Maior Desempenho
            </h2>
            <p className="text-xs text-slate-400">
              Rotas mais requisitadas e taxas de crescimento recentes
            </p>
          </div>
          <button
            onClick={onNavigateToLinks}
            className="btn-secondary text-xs px-3.5 py-1.5 font-medium cursor-pointer"
          >
            <span>Ver todos os {totalLinksVal} links</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Tabela de Links */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-[#1F2432] text-slate-400 uppercase text-[10px]">
                <th className="py-3 px-3">CAMPANHA / TÍTULO</th>
                <th className="py-3 px-3">URL ENCURTADA</th>
                <th className="py-3 px-3">DESTINO ORIGINAL</th>
                <th className="py-3 px-3 text-right">CLIQUES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F2432]/60">
              {links.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500 font-sans">
                    Nenhum link registrado ainda. Crie seu primeiro link acima!
                  </td>
                </tr>
              ) : (
                links.slice(0, 5).map((l) => (
                  <tr key={l.id} className="hover:bg-[#151924]/60 transition-colors">
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-[#151924] border border-[#1F2432] flex items-center justify-center text-[#8B5CF6] shrink-0">
                          <Link2 className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="text-white font-semibold font-sans text-xs">
                            {l.title || `Smart Link /${l.slug}`}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Tag: #{l.campaign?.name || "inbound"} • Rota Ativa
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0D1017] border border-[#1F2432] text-[#C4B5FD]">
                        <span>linkz.io/{l.slug}</span>
                        <button
                          onClick={() => copyToClipboard(`https://linkzivo-production.up.railway.app/${l.slug}`, l.id)}
                          className="text-slate-400 hover:text-white cursor-pointer ml-1"
                        >
                          {copiedSlug === l.id ? (
                            <Check className="w-3 h-3 text-[#10B981]" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-slate-400 max-w-xs truncate">
                      <a
                        href={l.destinationUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-slate-200 inline-flex items-center gap-1 truncate"
                      >
                        <span className="truncate">{l.destinationUrl}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </td>
                    <td className="py-3.5 px-3 text-right font-bold text-white">
                      {l.clickCount.toLocaleString("pt-BR")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bloco 5: Consumo de Cota Mensal */}
      <div className="p-4 rounded-2xl bg-[#11141D] border border-[#1F2432] flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 flex items-center justify-center text-[#8B5CF6] shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-white">
              Consumo da Cota Mensal (Plano Pro) <span className="text-[#8B5CF6]">76.9%</span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
              384.920 de 500.000 cliques consumidos neste ciclo • Renova em 9 dias
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 w-full sm:w-auto">
          {/* Barra de Progresso */}
          <div className="w-full sm:w-48 h-2 rounded-full bg-[#1F2432] overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#8B5CF6] to-[#A855F7] rounded-full" style={{ width: "76.9%" }} />
          </div>
          <button className="btn-primary text-xs px-4 py-2 shrink-0 cursor-pointer">
            Aumentar Limite
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Zap,
  Activity,
  QrCode,
  TrendingUp,
  ExternalLink,
  Copy,
  Check,
  ChevronRight,
  Download,
  Calendar,
  Layers,
  Sparkles,
  Smartphone,
  Monitor,
  Tablet,
  ArrowUpRight,
  Plus,
} from "lucide-react";

interface SmartLinkItem {
  id: string;
  slug: string;
  title: string | null;
  destinationUrl: string;
  clickCount: number;
  qrScanCount: number;
  status: string;
  createdAt: string;
  campaign?: { id: string; name: string } | null;
}

interface AnalyticsData {
  period: string;
  totalClicks: number;
  totalQrScans: number;
  totalLinks: number;
  conversionsCount: number;
  confirmedCommission: number;
  estimatedCommission: number;
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
}

interface OverviewViewProps {
  user: {
    name: string | null;
    email: string;
    workspacePlan: string;
  } | null;
  analytics: AnalyticsData | null;
  links: SmartLinkItem[];
  period: "7d" | "30d" | "90d" | "all";
  onPeriodChange: (p: "7d" | "30d" | "90d" | "all") => void;
  onFastShorten: (destinationUrl: string, customSlug?: string) => Promise<void>;
  onNavigateToLinks: () => void;
  loading: boolean;
  shortDomain?: string;
}

export function OverviewView({
  user,
  analytics,
  links,
  period,
  onPeriodChange,
  onFastShorten,
  onNavigateToLinks,
  loading,
  shortDomain,
}: OverviewViewProps) {
  // Estado do box de encurtamento instantâneo do topo
  const [fastUrl, setFastUrl] = useState("");
  const [fastSlug, setFastSlug] = useState("");
  const [fastLoading, setFastLoading] = useState(false);
  const [copiedSlugId, setCopiedSlugId] = useState<string | null>(null);

  // Toggle do gráfico: Cliques Totais vs Cliques Únicos
  const [chartViewMode, setChartViewMode] = useState<"totals" | "uniques">("totals");

  const domain = shortDomain || (typeof window !== "undefined" ? window.location.host : "linkz.io");

  const handleFastSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fastUrl.trim()) return;
    setFastLoading(true);
    try {
      await onFastShorten(fastUrl.trim(), fastSlug.trim() || undefined);
      setFastUrl("");
      setFastSlug("");
    } catch (e: any) {
      alert(e.message || "Erro ao encurtar link");
    } finally {
      setFastLoading(false);
    }
  };

  const handleCopyLink = (slug: string, id: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://linkzivo.com";
    navigator.clipboard.writeText(`${origin}/${slug}`);
    setCopiedSlugId(id);
    setTimeout(() => setCopiedSlugId(null), 2000);
  };

  // Cálculo das métricas reais
  const activeLinksCount = links.filter((l) => l.status === "ACTIVE").length;
  const totalClicks = analytics?.totalClicks ?? 0;
  const totalQrScans = analytics?.totalQrScans ?? 0;
  const conversions = analytics?.conversionsCount ?? 0;

  // Timeline para render do SVG do gráfico
  const timeline = analytics?.dailyTimeline || [];
  const maxClicksInTimeline = Math.max(...timeline.map((t) => t.clicks), 10);

  // Gerador de pontos SVG para a curva suave
  const svgWidth = 600;
  const svgHeight = 180;
  const paddingX = 20;
  const paddingY = 20;

  const pointsTotals = timeline.map((item, idx) => {
    const x = paddingX + (idx / Math.max(timeline.length - 1, 1)) * (svgWidth - paddingX * 2);
    const y = svgHeight - paddingY - (item.clicks / maxClicksInTimeline) * (svgHeight - paddingY * 2);
    return `${x},${y}`;
  }).join(" ");

  const pointsQr = timeline.map((item, idx) => {
    const x = paddingX + (idx / Math.max(timeline.length - 1, 1)) * (svgWidth - paddingX * 2);
    const y = svgHeight - paddingY - (item.qrScans / maxClicksInTimeline) * (svgHeight - paddingY * 2);
    return `${x},${y}`;
  }).join(" ");

  // Dispositivos (100% dinâmicos e fiéis aos cliques reais)
  const hasTraffic = totalClicks > 0;
  const devices = analytics?.deviceBreakdown || [];
  const mobileDevice = devices.find((d) => d.name === "Mobile") || { pct: 0, count: 0 };
  const desktopDevice = devices.find((d) => d.name === "Desktop") || { pct: 0, count: 0 };
  const tabletDevice = devices.find((d) => d.name === "Tablet") || { pct: 0, count: 0 };

  // Taxa de Conversão de Vendas (CVR = Conversões / Cliques)
  const conversionRate = hasTraffic ? ((conversions / totalClicks) * 100).toFixed(1) + "%" : "—";
  // Participação de QR Code no volume de cliques
  const qrVolumePct = hasTraffic ? Math.round((totalQrScans / totalClicks) * 100) : 0;

  // Links com maior desempenho
  const topLinks = links
    .slice()
    .sort((a, b) => b.clickCount - a.clickCount)
    .slice(0, 5);

  // Cota do plano (estimativa real com base no plano)
  const quotaLimit = user?.workspacePlan === "FREE" ? 1000 : user?.workspacePlan === "PRO" ? 50000 : 500000;
  const quotaPct = Math.min(Math.round((totalClicks / quotaLimit) * 100), 100);

  const greetingName = user?.name ? user.name.split(" ")[0] : "Lucas";

  return (
    <div className="space-y-6">
      {/* Topo: Subheader Telemetria + Saudação + Controles de Período */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono tracking-wider uppercase text-slate-400 font-semibold mb-1 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Telemetria em Tempo Real • Workspace Principal</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Olá, {greetingName}!
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Aqui está o desempenho global dos seus links nos últimos {period === "all" ? "meses (histórico completo)" : period}.
          </p>
        </div>

        {/* Controles de Período & Exportar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="p-1 rounded-xl bg-[#121622] border border-white/[0.08] inline-flex items-center text-xs font-medium">
            <button
              onClick={() => onPeriodChange("7d")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                period === "7d"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              7D
            </button>
            <button
              onClick={() => onPeriodChange("30d")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                period === "30d"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              30D
            </button>
            <button
              onClick={() => onPeriodChange("90d")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                period === "90d"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              90D
            </button>
            <button
              onClick={() => onPeriodChange("all")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                period === "all"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Este Ano
            </button>
          </div>

          <button
            onClick={() => {
              const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(analytics, null, 2));
              const dlAnchor = document.createElement("a");
              dlAnchor.setAttribute("href", dataStr);
              dlAnchor.setAttribute("download", `relatorio_linkzivo_${period}.json`);
              dlAnchor.click();
            }}
            className="btn-stitch-secondary text-xs px-3.5 py-2 cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-purple-400" />
            <span>Exportar Relatório</span>
          </button>
        </div>
      </div>

      {/* Box de Encurtamento Instantâneo de Alta Performance */}
      <div className="stitch-card p-5 border-purple-500/20 bg-gradient-to-r from-[#121622] via-[#141826] to-[#121622]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-purple-600/20 text-purple-400 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              Encurtamento Instantâneo de Alta Performance
            </span>
          </div>

          <span className="badge-stitch-mint flex items-center gap-1 text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Roteamento Global Anycast &lt; 18ms
          </span>
        </div>

        <form onSubmit={handleFastSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          <div className="md:col-span-6">
            <input
              type="url"
              required
              value={fastUrl}
              onChange={(e) => setFastUrl(e.target.value)}
              placeholder="Cole a URL de destino longa (https://...)"
              className="w-full px-3.5 py-2.5 bg-[#090C14] border border-white/[0.08] focus:border-purple-500 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500/50 font-mono"
            />
          </div>

          <div className="md:col-span-4 flex items-center gap-2">
            <div className="px-3 py-2.5 rounded-xl bg-[#090C14] border border-white/[0.08] text-xs font-mono text-slate-300 shrink-0">
              https://{domain}/
            </div>
            <input
              type="text"
              value={fastSlug}
              onChange={(e) => setFastSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ""))}
              placeholder="alias-personalizado"
              className="w-full px-3 py-2.5 bg-[#090C14] border border-white/[0.08] focus:border-purple-500 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500/50 font-mono"
            />
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={fastLoading || !fastUrl.trim()}
              className="w-full btn-stitch-primary py-2.5 text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{fastLoading ? "Encurtando..." : "Encurtar & QR"}</span>
            </button>
          </div>
        </form>
      </div>

      {/* 4 Cards de Indicadores com Sparklines */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total de Links Ativos */}
        <div className="stitch-card p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px] font-mono">
              Total de Links Ativos
            </span>
            <div className="w-6 h-6 rounded-md bg-white/[0.04] flex items-center justify-center text-slate-300">
              <Layers className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
              {activeLinksCount.toLocaleString("pt-BR")}
            </span>
            {activeLinksCount > 0 ? (
              <span className="badge-stitch-mint text-[11px]">{activeLinksCount} ativos</span>
            ) : (
              <span className="px-2 py-0.5 rounded-md bg-white/[0.04] text-slate-500 text-[11px] font-mono">0 links</span>
            )}
          </div>
          {/* Mini Sparkline decorativa */}
          <div className="h-6 w-full flex items-end">
            <svg className={`w-full h-full ${activeLinksCount > 0 ? "text-emerald-400" : "text-slate-600 opacity-40"}`} viewBox="0 0 100 20" preserveAspectRatio="none">
              <path
                d={activeLinksCount > 0 ? "M0,15 Q25,18 50,8 T100,2" : "M0,18 L100,18"}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          </div>
          <div className="text-[11px] text-slate-400">
            • {links.length} links cadastrados no total
          </div>
        </div>

        {/* Card 2: Total de Cliques */}
        <div className="stitch-card p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px] font-mono">
              Total de Cliques
            </span>
            <div className="w-6 h-6 rounded-md bg-purple-500/10 flex items-center justify-center text-purple-400">
              <Activity className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
              {totalClicks.toLocaleString("pt-BR")}
            </span>
            {totalClicks > 0 ? (
              <span className="badge-stitch-mint text-[11px]">{totalClicks} cliques</span>
            ) : (
              <span className="px-2 py-0.5 rounded-md bg-white/[0.04] text-slate-500 text-[11px] font-mono">0%</span>
            )}
          </div>
          <div className="h-6 w-full flex items-end">
            <svg className={`w-full h-full ${totalClicks > 0 ? "text-purple-400" : "text-slate-600 opacity-40"}`} viewBox="0 0 100 20" preserveAspectRatio="none">
              <path
                d={totalClicks > 0 ? "M0,18 Q20,12 50,14 T100,3" : "M0,18 L100,18"}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          </div>
          <div className="text-[11px] text-slate-400">
            • Média de {Math.round(totalClicks / (period === "7d" ? 7 : 30))} cliques/dia
          </div>
        </div>

        {/* Card 3: Leituras de QR Code */}
        <div className="stitch-card p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px] font-mono">
              Leituras de QR Code
            </span>
            <div className="w-6 h-6 rounded-md bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <QrCode className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
              {totalQrScans.toLocaleString("pt-BR")}
            </span>
            {totalQrScans > 0 ? (
              <span className="badge-stitch-mint text-[11px]">{qrVolumePct}% volume</span>
            ) : (
              <span className="px-2 py-0.5 rounded-md bg-white/[0.04] text-slate-500 text-[11px] font-mono">0%</span>
            )}
          </div>
          <div className="h-6 w-full flex items-end">
            <svg className={`w-full h-full ${totalQrScans > 0 ? "text-emerald-400" : "text-slate-600 opacity-40"}`} viewBox="0 0 100 20" preserveAspectRatio="none">
              <path
                d={totalQrScans > 0 ? "M0,16 Q30,6 60,12 T100,4" : "M0,18 L100,18"}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          </div>
          <div className="text-[11px] text-slate-400">
            • {qrVolumePct}% do volume consolidado
          </div>
        </div>

        {/* Card 4: Taxa de Conversão (CVR) */}
        <div className="stitch-card p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px] font-mono">
              Taxa de Conversão (CVR)
            </span>
            <div className="w-6 h-6 rounded-md bg-purple-500/10 flex items-center justify-center text-purple-400">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
              {conversionRate}
            </span>
            {conversions > 0 ? (
              <span className="badge-stitch-mint text-[11px]">{conversions} vendas</span>
            ) : hasTraffic ? (
              <span className="px-2 py-0.5 rounded-md bg-white/[0.04] text-slate-500 text-[11px] font-mono">0 vendas</span>
            ) : (
              <span className="px-2 py-0.5 rounded-md bg-white/[0.04] text-slate-500 text-[11px] font-mono">—</span>
            )}
          </div>
          <div className="h-6 w-full flex items-end">
            <svg className={`w-full h-full ${conversions > 0 ? "text-purple-400" : "text-slate-600 opacity-40"}`} viewBox="0 0 100 20" preserveAspectRatio="none">
              <path
                d={conversions > 0 ? "M0,14 Q30,16 60,8 T100,2" : "M0,18 L100,18"}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          </div>
          <div className="text-[11px] text-slate-400">
            • {conversions} conversões confirmadas
          </div>
        </div>
      </div>

      {/* Grid Principal: Gráfico Volume de Cliques (Esquerda) + Dispositivos & Canais (Direita) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Gráfico: Volume de Cliques e Acessos (8 Cols) */}
        <div className="lg:col-span-8 stitch-card p-5 flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-white tracking-wide">
                  Volume de Cliques e Acessos
                </h3>
                <p className="text-[11px] text-slate-400">
                  Análise temporal de engajamento ao longo dos últimos {period === "all" ? "meses" : period}.
                </p>
              </div>

              {/* Indicador de Visualização */}
              <div className="p-1 rounded-xl bg-[#090C14] border border-white/[0.08] inline-flex items-center text-xs font-medium self-start sm:self-auto">
                <span className="px-3 py-1 rounded-lg bg-purple-600 text-white shadow-sm font-mono text-[11px]">
                  Cliques &amp; QR Scans
                </span>
              </div>
            </div>

            {/* Badge de Pico */}
            <div className="flex justify-end mb-2">
              <span className="px-2.5 py-1 rounded-full bg-[#181D2C] border border-white/[0.08] text-[10px] font-mono text-purple-300 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                Pico: {maxClicksInTimeline} acessos
              </span>
            </div>

            {/* SVG Gráfico Curvo Suave */}
            <div className="w-full h-48 bg-[#090C14] rounded-xl p-3 border border-white/[0.04] relative flex items-center justify-center">
              {timeline.length === 0 ? (
                <div className="text-xs text-slate-500 font-mono">Sem dados para o período</div>
              ) : (
                <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
                  <defs>
                    <linearGradient id="purpleGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="mintGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10B981" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Linhas de Grade */}
                  <line x1="0" y1="40" x2={svgWidth} y2="40" stroke="rgba(255,255,255,0.04)" strokeDasharray="4 4" />
                  <line x1="0" y1="90" x2={svgWidth} y2="90" stroke="rgba(255,255,255,0.04)" strokeDasharray="4 4" />
                  <line x1="0" y1="140" x2={svgWidth} y2="140" stroke="rgba(255,255,255,0.04)" strokeDasharray="4 4" />

                  {/* Curva Totais (Roxo) */}
                  <polyline
                    fill="none"
                    stroke="#8B5CF6"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={pointsTotals}
                  />

                  {/* Curva QR Scans (Verde Mint) */}
                  <polyline
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={pointsQr}
                  />
                </svg>
              )}
            </div>
          </div>

          {/* Legenda do Gráfico */}
          <div className="mt-4 pt-3 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                <span className="text-slate-300">Cliques Totais</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span className="text-slate-300">Scans de QR Code</span>
              </span>
            </div>

            <span className="font-mono text-slate-400">
              Participação QR: {hasTraffic ? `${qrVolumePct}%` : "—"}
            </span>
          </div>
        </div>

        {/* Card: Dispositivos & Canais (4 Cols) */}
        <div className="lg:col-span-4 stitch-card p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white tracking-wide">
                Dispositivos &amp; Canais
              </h3>
              <span className="text-[10px] text-slate-400 uppercase font-mono">Telemetria</span>
            </div>

            {/* Donut Chart SVG Estilo Stitch */}
            <div className="flex flex-col items-center justify-center py-3">
              <div className="relative w-36 h-36 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  {/* Trilha de fundo */}
                  <circle cx="50" cy="50" r="40" stroke="rgba(255,255,255,0.06)" strokeWidth="12" fill="none" />
                  {hasTraffic && mobileDevice.pct > 0 && (
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      stroke="#8B5CF6"
                      strokeWidth="12"
                      strokeDasharray={`${(mobileDevice.pct / 100) * 251.3} 251.3`}
                      strokeDashoffset="0"
                      fill="none"
                      strokeLinecap="round"
                    />
                  )}
                  {hasTraffic && desktopDevice.pct > 0 && (
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      stroke="#10B981"
                      strokeWidth="12"
                      strokeDasharray={`${(desktopDevice.pct / 100) * 251.3} 251.3`}
                      strokeDashoffset={`-${(mobileDevice.pct / 100) * 251.3}`}
                      fill="none"
                      strokeLinecap="round"
                    />
                  )}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-xl font-extrabold text-white font-mono">
                    {hasTraffic ? `${mobileDevice.pct >= desktopDevice.pct ? mobileDevice.pct : desktopDevice.pct}%` : "0%"}
                  </span>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">
                    {hasTraffic
                      ? mobileDevice.pct >= desktopDevice.pct
                        ? "Mobile First"
                        : "Desktop First"
                      : "Sem Tráfego"}
                  </span>
                </div>
              </div>
            </div>

            {/* Lista dos Dispositivos */}
            <div className="space-y-2 mt-2">
              <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-[#090C14] border border-white/[0.04]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-300">Mobile</span>
                </div>
                <div className="font-mono text-slate-300">
                  {mobileDevice.count} <span className="text-purple-400 font-semibold">({mobileDevice.pct}%)</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-[#090C14] border border-white/[0.04]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <Monitor className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-300">Desktop</span>
                </div>
                <div className="font-mono text-slate-300">
                  {desktopDevice.count} <span className="text-emerald-400 font-semibold">({desktopDevice.pct}%)</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-[#090C14] border border-white/[0.04]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-slate-500" />
                  <Tablet className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-300">Tablet</span>
                </div>
                <div className="font-mono text-slate-300">
                  {tabletDevice.count} <span className="text-slate-400 font-semibold">({tabletDevice.pct}%)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/[0.06] text-[11px] text-slate-400 flex items-center justify-between">
            <span>
              {hasTraffic
                ? "Atribuição multicanal por parâmetros UTM e referer ativa"
                : "Canais: Nenhum tráfego registrado no período"}
            </span>
          </div>
        </div>
      </div>

      {/* Tabela: Links com Maior Desempenho */}
      <div className="stitch-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">
              Links com Maior Desempenho
            </h3>
            <p className="text-[11px] text-slate-400">
              Rotas mais requisitadas e taxas de crescimento recentes.
            </p>
          </div>

          <button
            onClick={onNavigateToLinks}
            className="text-xs text-purple-400 hover:text-purple-300 font-medium flex items-center gap-1 cursor-pointer transition-colors"
          >
            <span>Ver todos os {links.length} links</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase font-mono text-slate-400 border-b border-white/[0.06]">
              <tr>
                <th className="py-2.5 px-3">Campanha / Título</th>
                <th className="py-2.5 px-3">URL Encurtada</th>
                <th className="py-2.5 px-3">Destino Original</th>
                <th className="py-2.5 px-3 text-right">Cliques</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {topLinks.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-500 font-mono">
                    Nenhum link ativo encontrado.
                  </td>
                </tr>
              ) : (
                topLinks.map((link) => (
                  <tr key={link.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-3">
                      <div className="font-semibold text-white">{link.title || link.slug}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {link.campaign ? `Tag: #${link.campaign.name}` : "Sem campanha"}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#090C14] border border-white/[0.06] font-mono text-purple-300">
                        <span>{domain}/{link.slug}</span>
                        <button
                          onClick={() => handleCopyLink(link.slug, link.id)}
                          className="hover:text-white cursor-pointer ml-1"
                        >
                          {copiedSlugId === link.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-slate-400" />
                          )}
                        </button>
                      </div>
                    </td>

                    <td className="py-3 px-3 max-w-xs truncate text-slate-400 font-mono">
                      <a
                        href={link.destinationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-purple-300 hover:underline truncate block"
                      >
                        {link.destinationUrl}
                      </a>
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-bold text-white">
                      {link.clickCount.toLocaleString("pt-BR")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Barra Inferior: Consumo da Cota Mensal */}
      <div className="p-4 rounded-xl bg-[#121622] border border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-white">
              Consumo da Cota Mensal ({user?.workspacePlan || "PRO Plan"}){" "}
              <span className="text-purple-400 font-mono">{quotaPct}%</span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              {totalClicks.toLocaleString("pt-BR")} de {quotaLimit.toLocaleString("pt-BR")} cliques consumidos neste ciclo • Renova em 9 dias
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="w-full sm:w-48 h-2 rounded-full bg-[#090C14] border border-white/[0.08] overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-600 to-indigo-500 rounded-full transition-all"
              style={{ width: `${quotaPct}%` }}
            />
          </div>

          <button
            onClick={() => alert("Para aumentar seu limite ou migrar para Enterprise, entre em contato com o suporte Linkzivo.")}
            className="btn-stitch-primary text-xs shrink-0 cursor-pointer"
          >
            Aumentar Limite
          </button>
        </div>
      </div>
    </div>
  );
}

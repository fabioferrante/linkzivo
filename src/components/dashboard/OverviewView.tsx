"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  calculateScale,
  mapSeriesToPoints,
  generateMonotonePath,
  Point,
} from "@/lib/chart-utils";
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

interface CardSparklineProps {
  data: number[];
  color: string;
  gradientId: string;
  glowId: string;
}

function CardSparkline({ data, color, gradientId, glowId }: CardSparklineProps) {
  const width = 100;
  const height = 26;
  const paddingX = 2;
  const paddingY = 3;
  const bottomY = height - paddingY;

  const hasData = data && data.length > 0 && data.some((v) => v > 0);

  if (!hasData) {
    return (
      <div className="h-6 w-full flex items-end">
        <svg className="w-full h-full text-slate-700/60" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          <line
            x1="0"
            y1={bottomY}
            x2={width}
            y2={bottomY}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
        </svg>
      </div>
    );
  }

  const scale = calculateScale(data);
  const points = mapSeriesToPoints(data, width, height, paddingX, paddingY, scale.max);
  const { linePath, areaPath } = generateMonotonePath(points, bottomY);

  return (
    <div className="h-6 w-full flex items-end">
      <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="70%" stopColor={color} stopOpacity="0.08" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
          <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor={color} floodOpacity="0.35" />
          </filter>
        </defs>

        {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}

        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#${glowId})`}
          />
        )}
      </svg>
    </div>
  );
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
  const clicksSeries = timeline.map((t) => t.clicks);
  const qrSeries = timeline.map((t) => t.qrScans);

  // Escala global e detecção de pico com headroom
  const globalScale = calculateScale([...clicksSeries, ...qrSeries]);
  const realPeakClicks = globalScale.peak;

  // Dimensões e parâmetros para as curvas suaves do gráfico principal
  const svgWidth = 640;
  const svgHeight = 200;
  const paddingX = 24;
  const paddingY = 24;
  const bottomY = svgHeight - paddingY;

  const pointsTotalsData = mapSeriesToPoints(clicksSeries, svgWidth, svgHeight, paddingX, paddingY, globalScale.max);
  const pointsQrData = mapSeriesToPoints(qrSeries, svgWidth, svgHeight, paddingX, paddingY, globalScale.max);

  const totalsCurve = generateMonotonePath(pointsTotalsData, bottomY);
  const qrCurve = generateMonotonePath(pointsQrData, bottomY);

  // Coordenada do ponto de pico mais alto da série de cliques
  let peakPoint: Point | null = null;
  if (realPeakClicks > 0 && timeline.length > 0) {
    const peakIdx = clicksSeries.indexOf(realPeakClicks);
    if (peakIdx !== -1 && pointsTotalsData[peakIdx]) {
      peakPoint = pointsTotalsData[peakIdx];
    }
  }

  // Séries temporais dedicadas para os 4 cards superiores
  const linksCumulativeData = timeline.map((t) => {
    const tTime = new Date(t.date).getTime() + 86400000;
    return links.filter((l) => new Date(l.createdAt).getTime() <= tTime).length;
  });
  const sparkLinksData =
    linksCumulativeData.length > 0 && linksCumulativeData.some((v) => v > 0)
      ? linksCumulativeData
      : activeLinksCount > 0
      ? [Math.max(1, Math.round(activeLinksCount * 0.7)), Math.max(1, Math.round(activeLinksCount * 0.85)), activeLinksCount, activeLinksCount]
      : [];

  const sparkClicksData = clicksSeries;
  const sparkQrData = qrSeries;
  const sparkCvrData = timeline.map((t) => (t.clicks > 0 && conversions > 0 ? Math.round((conversions / Math.max(totalClicks, 1)) * 100) : 0));

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

  const greetingName = user?.name
    ? user.name.split(" ")[0]
    : user?.email
    ? user.email.split("@")[0]
    : "Afiliado";

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
          </div>
          {/* Mini Sparkline suave com degradê */}
          <CardSparkline
            data={sparkLinksData}
            color="#A78BFA"
            gradientId="sparkLinksGrad"
            glowId="sparkLinksGlow"
          />
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
          </div>
          {/* Mini Sparkline suave com degradê */}
          <CardSparkline
            data={sparkClicksData}
            color="#8B5CF6"
            gradientId="sparkClicksGrad"
            glowId="sparkClicksGlow"
          />
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
          {/* Mini Sparkline suave com degradê */}
          <CardSparkline
            data={sparkQrData}
            color="#10B981"
            gradientId="sparkQrGrad"
            glowId="sparkQrGlow"
          />
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
          {/* Mini Sparkline suave com degradê */}
          <CardSparkline
            data={sparkCvrData}
            color="#A78BFA"
            gradientId="sparkCvrGrad"
            glowId="sparkCvrGlow"
          />
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

              {/* Alternância de Visualização */}
              <div className="p-1 rounded-xl bg-[#090C14] border border-white/[0.08] inline-flex items-center text-xs font-medium self-start sm:self-auto">
                <button
                  onClick={() => setChartViewMode("totals")}
                  className={`px-3 py-1 rounded-lg font-mono text-[11px] transition-all cursor-pointer ${
                    chartViewMode === "totals"
                      ? "bg-purple-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Cliques &amp; QR Scans
                </button>
                <button
                  onClick={() => setChartViewMode("uniques")}
                  className={`px-3 py-1 rounded-lg font-mono text-[11px] transition-all cursor-pointer ${
                    chartViewMode === "uniques"
                      ? "bg-purple-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Apenas Cliques
                </button>
              </div>
            </div>

            {/* Badge de Pico - somente exibido se houver dados reais de acessos */}
            {realPeakClicks > 0 && (
              <div className="flex justify-end mb-2">
                <span className="px-2.5 py-1 rounded-full bg-[#181D2C] border border-white/[0.08] text-[10px] font-mono text-purple-300 flex items-center gap-1.5 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                  Pico: {realPeakClicks} {realPeakClicks === 1 ? "acesso" : "acessos"}
                </span>
              </div>
            )}

            {/* SVG Gráfico Curvo Suave Monotônico com Degradê */}
            <div className="w-full h-52 bg-[#090C14] rounded-xl p-3 border border-white/[0.04] relative flex items-center justify-center overflow-hidden">
              {timeline.length === 0 ? (
                <div className="text-xs text-slate-500 font-mono">Sem dados para o período</div>
              ) : (
                <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
                  <defs>
                    {/* Degradê Roxo Principal (Cliques Totais) */}
                    <linearGradient id="mainPurpleGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.40" />
                      <stop offset="65%" stopColor="#8B5CF6" stopOpacity="0.10" />
                      <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.0" />
                    </linearGradient>

                    {/* Degradê Verde Mint Principal (Scans de QR Code) */}
                    <linearGradient id="mainMintGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10B981" stopOpacity="0.32" />
                      <stop offset="65%" stopColor="#10B981" stopOpacity="0.08" />
                      <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                    </linearGradient>

                    {/* Sombra / Brilho Suave para Linha Roxa */}
                    <filter id="purpleLineGlow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="2.5" stdDeviation="3.5" floodColor="#8B5CF6" floodOpacity="0.45" />
                    </filter>

                    {/* Sombra / Brilho Suave para Linha Verde */}
                    <filter id="mintLineGlow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#10B981" floodOpacity="0.35" />
                    </filter>
                  </defs>

                  {/* Linhas de Grade Sutis e Proporcionais */}
                  <line x1={paddingX} y1={paddingY} x2={svgWidth - paddingX} y2={paddingY} stroke="rgba(255,255,255,0.03)" strokeDasharray="3 3" />
                  <line x1={paddingX} y1={paddingY + (bottomY - paddingY) * 0.33} x2={svgWidth - paddingX} y2={paddingY + (bottomY - paddingY) * 0.33} stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" />
                  <line x1={paddingX} y1={paddingY + (bottomY - paddingY) * 0.66} x2={svgWidth - paddingX} y2={paddingY + (bottomY - paddingY) * 0.66} stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" />
                  <line x1={paddingX} y1={bottomY} x2={svgWidth - paddingX} y2={bottomY} stroke="rgba(255,255,255,0.05)" />

                  {/* Rótulos discretos de datas da timeline no rodapé da grade */}
                  {timeline.length > 2 && (
                    <g className="text-[9px] font-mono fill-slate-500 select-none">
                      <text x={paddingX} y={svgHeight - 6} textAnchor="start">
                        {timeline[0].label}
                      </text>
                      <text x={svgWidth / 2} y={svgHeight - 6} textAnchor="middle">
                        {timeline[Math.floor(timeline.length / 2)].label}
                      </text>
                      <text x={svgWidth - paddingX} y={svgHeight - 6} textAnchor="end">
                        {timeline[timeline.length - 1].label}
                      </text>
                    </g>
                  )}

                  {/* Área em degradê suave sob a curva Totais */}
                  {totalsCurve.areaPath && (
                    <path
                      d={totalsCurve.areaPath}
                      fill="url(#mainPurpleGrad)"
                    />
                  )}

                  {/* Área em degradê suave sob a curva QR Scans */}
                  {chartViewMode === "totals" && qrCurve.areaPath && (
                    <path
                      d={qrCurve.areaPath}
                      fill="url(#mainMintGrad)"
                    />
                  )}

                  {/* Curva QR Scans Suave (Verde Mint) */}
                  {chartViewMode === "totals" && qrCurve.linePath && (
                    <path
                      d={qrCurve.linePath}
                      fill="none"
                      stroke="#10B981"
                      strokeWidth="2.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      filter="url(#mintLineGlow)"
                    />
                  )}

                  {/* Curva Totais Suave (Roxo) */}
                  {totalsCurve.linePath && (
                    <path
                      d={totalsCurve.linePath}
                      fill="none"
                      stroke="#8B5CF6"
                      strokeWidth="2.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      filter="url(#purpleLineGlow)"
                    />
                  )}

                  {/* Ponto indicador de pico destacado no topo */}
                  {peakPoint && realPeakClicks > 0 && (
                    <g className="transition-all duration-300">
                      <circle
                        cx={peakPoint.x}
                        cy={peakPoint.y}
                        r="6"
                        fill="rgba(139, 92, 246, 0.25)"
                      />
                      <circle
                        cx={peakPoint.x}
                        cy={peakPoint.y}
                        r="3.5"
                        fill="#C4B5FD"
                        stroke="#7C3AED"
                        strokeWidth="2"
                      />
                    </g>
                  )}
                </svg>
              )}
            </div>
          </div>

          {/* Legenda do Gráfico */}
          <div className="mt-4 pt-3 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-sm shadow-purple-500/50" />
                <span className="text-slate-300">Cliques Totais</span>
              </span>
              {chartViewMode === "totals" && (
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                  <span className="text-slate-300">Scans de QR Code</span>
                </span>
              )}
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
    </div>
  );
}

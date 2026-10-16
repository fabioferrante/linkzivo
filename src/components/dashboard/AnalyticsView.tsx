"use client";

import React from "react";
import {
  BarChart3,
  Activity,
  Globe,
  Smartphone,
  Monitor,
  Tablet,
  Calendar,
  RefreshCw,
  Clock,
  QrCode,
} from "lucide-react";
import { formatBrDateTime } from "@/lib/date";

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
  osBreakdown: Array<{ name: string; count: number; pct: number }>;
  browserBreakdown: Array<{ name: string; count: number; pct: number }>;
  recentClicks: Array<{
    id: string;
    slug: string;
    title: string | null;
    device: string | null;
    os: string | null;
    browser: string | null;
    country: string | null;
    isQrScan: boolean;
    timestamp: string;
  }>;
}

interface AnalyticsViewProps {
  analytics: AnalyticsData | null;
  period: "7d" | "30d" | "90d" | "all";
  onPeriodChange: (p: "7d" | "30d" | "90d" | "all") => void;
  loading: boolean;
}

export function AnalyticsView({
  analytics,
  period,
  onPeriodChange,
  loading,
}: AnalyticsViewProps) {
  const osBreakdown = analytics?.osBreakdown || [];
  const browserBreakdown = analytics?.browserBreakdown || [];
  const recentClicks = analytics?.recentClicks || [];

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono tracking-wider uppercase text-purple-400 font-semibold mb-1">
            Telemetria Detalhada • Auditoria de Tráfego e Cliques
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Estatísticas &amp; Analytics
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Auditoria em nível de evento com discriminação de sistemas operacionais, navegadores e deduplicação de tráfego.
          </p>
        </div>

        {/* Filtro de Janela Temporal */}
        <div className="p-1 rounded-xl bg-[#121622] border border-white/[0.08] inline-flex items-center text-xs font-medium self-start sm:self-auto">
          <button
            onClick={() => onPeriodChange("7d")}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              period === "7d"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            7 dias
          </button>
          <button
            onClick={() => onPeriodChange("30d")}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              period === "30d"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            30 dias
          </button>
          <button
            onClick={() => onPeriodChange("90d")}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              period === "90d"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            90 dias
          </button>
          <button
            onClick={() => onPeriodChange("all")}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              period === "all"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Histórico Completo
          </button>
        </div>
      </div>

      {/* Grid: Sistemas Operacionais & Navegadores */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Sistemas Operacionais */}
        <div className="stitch-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white tracking-wide">
              Sistemas Operacionais
            </h3>
            <span className="text-[10px] text-slate-400 uppercase font-mono">Dispositivos</span>
          </div>

          <div className="space-y-2.5">
            {osBreakdown.length === 0 ? (
              <div className="text-xs text-slate-500 font-mono py-4 text-center">
                Sem eventos de SO registrados no período.
              </div>
            ) : (
              osBreakdown.map((item, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300 font-medium">{item.name}</span>
                    <span className="font-mono text-purple-300 font-semibold">{item.pct}% ({item.count})</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[#090C14] overflow-hidden">
                    <div
                      className="h-full bg-purple-600 rounded-full"
                      style={{ width: `${item.pct}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Navegadores */}
        <div className="stitch-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white tracking-wide">
              Navegadores &amp; Clientes Web
            </h3>
            <span className="text-[10px] text-slate-400 uppercase font-mono">Browsers</span>
          </div>

          <div className="space-y-2.5">
            {browserBreakdown.length === 0 ? (
              <div className="text-xs text-slate-500 font-mono py-4 text-center">
                Sem eventos de navegadores registrados no período.
              </div>
            ) : (
              browserBreakdown.map((item, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300 font-medium">{item.name}</span>
                    <span className="font-mono text-emerald-400 font-semibold">{item.pct}% ({item.count})</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[#090C14] overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${item.pct}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Tabela de Cliques Recentes (Log em Tempo Real) */}
      <div className="stitch-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">
              Últimos Eventos de Tráfego Registrados
            </h3>
            <p className="text-[11px] text-slate-400">
              Auditoria de requisições de redirecionamento em tempo real com injeção de parâmetros de afiliados.
            </p>
          </div>
          <span className="badge-stitch-mint text-[11px] flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live Stream
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase font-mono text-slate-400 border-b border-white/[0.06]">
              <tr>
                <th className="py-2.5 px-3">Origem / Rota</th>
                <th className="py-2.5 px-3">Dispositivo / SO</th>
                <th className="py-2.5 px-3">Navegador</th>
                <th className="py-2.5 px-3">País</th>
                <th className="py-2.5 px-3 text-right">Data &amp; Hora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {recentClicks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 font-mono">
                    Nenhum clique registrado recentemente.
                  </td>
                </tr>
              ) : (
                recentClicks.map((click) => (
                  <tr key={click.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-3">
                      <div className="font-semibold text-white font-mono flex items-center gap-1.5">
                        {click.isQrScan ? (
                          <span className="badge-stitch-purple text-[9px] py-0.5">QR</span>
                        ) : (
                          <span className="badge-stitch-mint text-[9px] py-0.5">Link</span>
                        )}
                        <span>/{click.slug}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        ID: {click.id}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <span className="text-slate-200">{click.device || "Mobile"}</span>{" "}
                      <span className="text-slate-400 text-[11px]">({click.os || "Desconhecido"})</span>
                    </td>

                    <td className="py-3 px-3 text-slate-300">
                      {click.browser || "Navegador Web"}
                    </td>

                    <td className="py-3 px-3 text-slate-400 font-mono">
                      {click.country || "Brasil (BR)"}
                    </td>

                    <td className="py-3 px-3 text-right font-mono text-slate-400 text-[11px] whitespace-nowrap">
                      {formatBrDateTime(click.timestamp)}
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

"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Search,
  Filter,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  DollarSign,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  FileText,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  QrCode,
  Smartphone,
  Monitor,
  Tablet,
  Globe,
  Layers,
  ShoppingBag,
  Info,
  X,
} from "lucide-react";
import { formatBrDateTime } from "@/lib/date";

export interface ConversionListItem {
  id: string;
  externalConversionId: string;
  clickId: string | null;
  conversionType: string;
  status: "CONFIRMED" | "ESTIMATED" | "REFUNDED" | "CANCELED";
  amount: number;
  commissionAmount: number;
  currency: string;
  timestamp: string;
  platform: string;
  hasAttributionClick: boolean;
  smartLink: {
    id: string;
    slug: string;
    title: string | null;
    destinationUrl: string;
    domain: string | null;
  };
  campaign?: {
    id: string;
    name: string;
  } | null;
  product?: {
    id: string;
    name: string;
    platform: string | null;
    brand: string | null;
    imageUrl: string | null;
  } | null;
  offer?: {
    id: string;
    name: string;
  } | null;
  click?: {
    id: string;
    device: string | null;
    os: string | null;
    browser: string | null;
    country: string | null;
    isQrScan: boolean;
    timestamp: string;
  } | null;
}

export interface ConversionDetailedAudit {
  id: string;
  externalConversionId: string;
  conversionType: string;
  timestamp: string;
  financial: {
    status: string;
    amount: number;
    commissionAmount: number;
    currency: string;
  };
  technicalAudit: {
    platform: string;
    isPlatformGuaranteed: boolean;
    attributionModel: string;
    attributionTimeSeconds: number | null;
    originalEvent: string | null;
    transactionRef: string | null;
    notesOrReason: string | null;
    sanitizedRawPayload: any;
  };
  smartLink: {
    id: string;
    slug: string;
    title: string | null;
    destinationUrl: string;
    domain: string | null;
    createdAt: string;
  };
  campaign?: { id: string; name: string; status: string } | null;
  product?: { id: string; name: string; platform: string | null; brand: string | null } | null;
  offer?: { id: string; name: string; commissionType: string | null; commissionValue: number | null } | null;
  click?: {
    id: string;
    device: string | null;
    os: string | null;
    browser: string | null;
    country: string | null;
    city: string | null;
    referer: string | null;
    isQrScan: boolean;
    timestamp: string;
  } | null;
}

interface ConversionsViewProps {
  shortDomain?: string;
}

export function ConversionsView({ shortDomain }: ConversionsViewProps) {
  const [conversions, setConversions] = useState<ConversionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filtros
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [periodFilter, setPeriodFilter] = useState<string>("30d");
  const [searchInput, setSearchInput] = useState<string>("");
  const [activeSearch, setActiveSearch] = useState<string>("");

  // Paginação Server-side
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(20);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Sumário Financeiro
  const [summary, setSummary] = useState({
    totalConversions: 0,
    confirmed: { count: 0, salesAmount: 0, commission: 0 },
    estimated: { count: 0, commission: 0 },
    refunded: { count: 0, salesAmount: 0, commission: 0 },
    canceled: { count: 0 },
  });

  // Modal de Detalhes e Auditoria
  const [selectedConversionId, setSelectedConversionId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<ConversionDetailedAudit | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedPayload, setCopiedPayload] = useState(false);

  const fetchConversions = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        period: periodFilter,
      });

      if (statusFilter !== "ALL") {
        params.set("status", statusFilter);
      }
      if (activeSearch.trim()) {
        params.set("search", activeSearch.trim());
      }

      const res = await fetch(`/api/conversions?${params.toString()}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao consultar extrato de conversões.");
      }

      const data = await res.json();
      setConversions(data.conversions || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalCount(data.pagination?.total || 0);
      if (data.summary) {
        setSummary(data.summary);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Erro de conexão ao carregar conversões.");
    } finally {
      setLoading(false);
    }
  }, [page, limit, statusFilter, periodFilter, activeSearch]);

  useEffect(() => {
    fetchConversions();
  }, [fetchConversions]);

  // Carregar detalhes individuais da conversão
  const handleOpenDetail = async (id: string) => {
    setSelectedConversionId(id);
    setDetailData(null);
    setDetailLoading(true);

    try {
      const res = await fetch(`/api/conversions/${id}`);
      if (!res.ok) {
        throw new Error("Não foi possível carregar os detalhes desta conversão.");
      }
      const data = await res.json();
      setDetailData(data.conversion);
    } catch (err: any) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setActiveSearch(searchInput);
  };

  const handleClearFilters = () => {
    setStatusFilter("ALL");
    setPeriodFilter("30d");
    setSearchInput("");
    setActiveSearch("");
    setPage(1);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatCurrency = (val: number, cur = "BRL") => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: cur,
    }).format(val || 0);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header da Tela */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Extrato de Conversões</h1>
            <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 text-xs font-mono border border-purple-500/20">
              Postbacks Auditáveis
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Audite transações registradas, status financeiro, modelos de atribuição e integridade técnica dos webhooks.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchConversions()}
          disabled={loading}
          className="btn-stitch-secondary text-xs px-3 py-2 self-start sm:self-auto cursor-pointer flex items-center gap-1.5"
          title="Recarregar extrato"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-purple-400" : ""}`} />
          <span>Atualizar</span>
        </button>
      </div>

      {/* 2. Cards de Métricas Financeiras Consolidadas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Vendas Confirmadas */}
        <div className="stitch-card p-4 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase font-mono tracking-wider">Vendas Confirmadas</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {formatCurrency(summary.confirmed.salesAmount)}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <span className="text-emerald-400 font-semibold">{summary.confirmed.count} pedidos</span>
            <span>aprovados</span>
          </div>
        </div>

        {/* Comissões Confirmadas */}
        <div className="stitch-card p-4 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase font-mono tracking-wider">Comissões Confirmadas</span>
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold font-mono text-purple-300">
            {formatCurrency(summary.confirmed.commission)}
          </div>
          <div className="text-[11px] text-slate-400">
            Saldo líquido validado de afiliados
          </div>
        </div>

        {/* Comissões Estimadas */}
        <div className="stitch-card p-4 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase font-mono tracking-wider">Comissões Estimadas</span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold font-mono text-amber-300">
            {formatCurrency(summary.estimated.commission)}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <span className="text-amber-400 font-semibold">{summary.estimated.count} pendentes</span>
            <span>(boletos/pix aguardando)</span>
          </div>
        </div>

        {/* Reembolsos & Estornos */}
        <div className="stitch-card p-4 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase font-mono tracking-wider">Estornos &amp; Reembolsos</span>
            <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold font-mono text-rose-300">
            {formatCurrency(summary.refunded.commission)}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <span className="text-rose-400 font-semibold">{summary.refunded.count} reembolsados</span>
            <span className="text-slate-500">• {summary.canceled.count} cancelados</span>
          </div>
        </div>
      </div>

      {/* 3. Filtros e Busca */}
      <div className="p-4 rounded-xl bg-[#0F131F] border border-white/[0.08] space-y-3">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Campo de Busca */}
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por ID externo, slug, título ou produto..."
              className="w-full pl-9 pr-3 py-1.5 bg-[#090C14] border border-white/[0.08] rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          {/* Filtro de Status Financeiro */}
          <div className="md:col-span-3">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-1.5 bg-[#090C14] border border-white/[0.08] rounded-lg text-xs text-white focus:outline-none focus:border-purple-500 transition-colors cursor-pointer"
            >
              <option value="ALL">Status: Todos</option>
              <option value="CONFIRMED">Aprovadas / Confirmadas</option>
              <option value="ESTIMATED">Pendentes / Estimadas</option>
              <option value="REFUNDED">Reembolsadas / Estornos</option>
              <option value="CANCELED">Canceladas</option>
            </select>
          </div>

          {/* Filtro de Período */}
          <div className="md:col-span-2">
            <select
              value={periodFilter}
              onChange={(e) => {
                setPeriodFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-1.5 bg-[#090C14] border border-white/[0.08] rounded-lg text-xs text-white focus:outline-none focus:border-purple-500 transition-colors cursor-pointer"
            >
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="90d">Últimos 90 dias</option>
              <option value="all">Todo o Período</option>
            </select>
          </div>

          {/* Botões de Ação */}
          <div className="md:col-span-2 flex items-center gap-2">
            <button
              type="submit"
              className="btn-stitch-primary text-xs py-1.5 px-3 flex-1 justify-center cursor-pointer"
            >
              Buscar
            </button>
            {(statusFilter !== "ALL" || periodFilter !== "30d" || activeSearch) && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="btn-stitch-secondary text-xs py-1.5 px-2.5 cursor-pointer"
                title="Limpar Filtros"
              >
                Limpar
              </button>
            )}
          </div>
        </form>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 4. Tabela de Extrato de Conversões */}
      <div className="stitch-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#090C14] border-b border-white/[0.06] text-slate-400 font-mono uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Data &amp; Hora</th>
                <th className="py-3 px-4">ID Transação</th>
                <th className="py-3 px-4">Smart Link</th>
                <th className="py-3 px-4">Plataforma / Produto</th>
                <th className="py-3 px-4 text-right">Valor Venda</th>
                <th className="py-3 px-4 text-right">Comissão</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Atribuição</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {loading && conversions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-purple-400 mb-2" />
                    <span>Carregando extrato de conversões...</span>
                  </td>
                </tr>
              ) : conversions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500 space-y-1">
                    <DollarSign className="w-7 h-7 mx-auto text-slate-600 mb-1" />
                    <p className="font-medium text-slate-300">Nenhuma conversão registrada com os filtros atuais.</p>
                    <p className="text-[11px] text-slate-500">
                      Configure os webhooks em sua plataforma (Hotmart, Kiwify, etc.) para ingestão automática.
                    </p>
                  </td>
                </tr>
              ) : (
                conversions.map((conv) => {
                  return (
                    <tr
                      key={conv.id}
                      className="hover:bg-white/[0.02] transition-colors group cursor-pointer"
                      onClick={() => handleOpenDetail(conv.id)}
                    >
                      {/* Data & Hora */}
                      <td className="py-3 px-4 font-mono text-slate-300 whitespace-nowrap">
                        {formatBrDateTime(conv.timestamp)}
                      </td>

                      {/* ID da Transação com botão de copiar */}
                      <td className="py-3 px-4 font-mono text-white">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate max-w-[120px]" title={conv.externalConversionId}>
                            {conv.externalConversionId}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(conv.externalConversionId, conv.id);
                            }}
                            className="p-1 rounded text-slate-500 hover:text-white hover:bg-white/10"
                            title="Copiar ID da Transação"
                          >
                            {copiedId === conv.id ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Smart Link */}
                      <td className="py-3 px-4">
                        <div className="font-mono text-purple-300 font-medium truncate max-w-[140px]">
                          /{conv.smartLink.slug}
                        </div>
                        {conv.smartLink.title && (
                          <div className="text-[10px] text-slate-400 truncate max-w-[140px]">
                            {conv.smartLink.title}
                          </div>
                        )}
                      </td>

                      {/* Origem e Produto */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-[10px] font-mono text-slate-300 border border-white/[0.08]">
                            {conv.platform}
                          </span>
                        </div>
                        {conv.product?.name ? (
                          <div className="text-[11px] text-white font-medium truncate max-w-[160px] mt-0.5">
                            {conv.product.name}
                          </div>
                        ) : conv.campaign?.name ? (
                          <div className="text-[11px] text-slate-400 truncate max-w-[160px] mt-0.5">
                            Campanha: {conv.campaign.name}
                          </div>
                        ) : null}
                      </td>

                      {/* Valor da Venda */}
                      <td className="py-3 px-4 text-right font-mono text-slate-300 whitespace-nowrap">
                        {formatCurrency(conv.amount, conv.currency)}
                      </td>

                      {/* Comissão do Afiliado */}
                      <td className="py-3 px-4 text-right font-mono whitespace-nowrap">
                        <span
                          className={`font-semibold ${
                            conv.status === "CONFIRMED"
                              ? "text-emerald-400"
                              : conv.status === "ESTIMATED"
                              ? "text-amber-400"
                              : "text-slate-400 line-through"
                          }`}
                        >
                          {formatCurrency(conv.commissionAmount, conv.currency)}
                        </span>
                      </td>

                      {/* Status Financeiro */}
                      <td className="py-3 px-4 text-center">
                        {conv.status === "CONFIRMED" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Confirmado
                          </span>
                        )}
                        {conv.status === "ESTIMATED" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Pendente
                          </span>
                        )}
                        {conv.status === "REFUNDED" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            Reembolsado
                          </span>
                        )}
                        {conv.status === "CANCELED" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">
                            Cancelado
                          </span>
                        )}
                      </td>

                      {/* Atribuição */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {conv.hasAttributionClick ? (
                            <span
                              className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 text-[10px] font-mono border border-purple-500/20"
                              title="Atribuído a um clique com sck/linkzivo_click"
                            >
                              Clique (sck)
                            </span>
                          ) : (
                            <span
                              className="px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-400 text-[10px] font-mono border border-slate-500/20"
                              title="Atribuído por rota de fallback direto do slug"
                            >
                              Slug Direto
                            </span>
                          )}
                          {conv.click?.isQrScan && (
                            <span title="Origem: Escaneamento de QR Code">
                              <QrCode className="w-3.5 h-3.5 text-purple-400" />
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Ações */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDetail(conv.id);
                          }}
                          className="px-2.5 py-1 rounded bg-[#121622] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.06] transition-colors cursor-pointer text-[11px] inline-flex items-center gap-1"
                        >
                          <FileText className="w-3 h-3 text-purple-400" />
                          <span>Auditar</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 5. Paginação no Rodapé */}
        <div className="p-4 bg-[#090C14] border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div>
            Mostrando{" "}
            <span className="font-medium text-white">
              {conversions.length > 0 ? (page - 1) * limit + 1 : 0}
            </span>{" "}
            a{" "}
            <span className="font-medium text-white">
              {Math.min(page * limit, totalCount)}
            </span>{" "}
            de <span className="font-medium text-white">{totalCount}</span> conversões
          </div>

          <div className="flex items-center gap-2">
            <select
              value={limit}
              onChange={(e) => {
                setLimit(parseInt(e.target.value, 10));
                setPage(1);
              }}
              className="bg-[#121622] border border-white/[0.08] rounded px-2 py-1 text-xs text-white"
            >
              <option value="10">10 / pág</option>
              <option value="20">20 / pág</option>
              <option value="50">50 / pág</option>
            </select>

            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="p-1.5 rounded bg-[#121622] border border-white/[0.08] text-slate-300 hover:text-white disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="font-mono text-white text-xs px-2">
              {page} / {totalPages}
            </span>

            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="p-1.5 rounded bg-[#121622] border border-white/[0.08] text-slate-300 hover:text-white disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODAL DE AUDITORIA E DETALHAMENTO INDIVIDUAL DA CONVERSÃO */}
      {/* ======================================================== */}
      {selectedConversionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-2xl bg-[#0F131F] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-5 border-b border-white/[0.08] flex items-center justify-between bg-[#0B0E17]/60">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Auditoria de Conversão</span>
                    {detailData?.financial.status === "CONFIRMED" && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-mono border border-emerald-500/20">
                        Venda Confirmada
                      </span>
                    )}
                    {detailData?.financial.status === "REFUNDED" && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 text-[10px] font-mono border border-rose-500/20">
                        Reembolso
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    ID Externo: {detailData?.externalConversionId || "Carregando..."}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedConversionId(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo com Scroll */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {detailLoading || !detailData ? (
                <div className="py-12 text-center text-slate-500">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-purple-400 mb-2" />
                  <span className="text-xs font-mono">Carregando detalhes do postback...</span>
                </div>
              ) : (
                <>
                  {/* Bloco 1: Informações Financeiras */}
                  <div className="p-4 rounded-xl bg-[#090C14] border border-white/[0.06] space-y-3">
                    <span className="text-xs font-semibold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                      <DollarSign className="w-3.5 h-3.5 text-purple-400" />
                      <span>1. Estado Financeiro</span>
                    </span>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Valor da Venda</span>
                        <span className="text-sm font-bold font-mono text-white">
                          {formatCurrency(detailData.financial.amount, detailData.financial.currency)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Comissão</span>
                        <span
                          className={`text-sm font-bold font-mono ${
                            detailData.financial.status === "CONFIRMED"
                              ? "text-emerald-400"
                              : "text-amber-400"
                          }`}
                        >
                          {formatCurrency(detailData.financial.commissionAmount, detailData.financial.currency)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Tipo do Evento</span>
                        <span className="text-xs font-mono text-slate-200 uppercase">
                          {detailData.conversionType}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Data &amp; Hora</span>
                        <span className="text-xs font-mono text-slate-300">
                          {formatBrDateTime(detailData.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Bloco 2: Resultado Técnico do Processamento de Postback */}
                  <div className="p-4 rounded-xl bg-[#090C14] border border-white/[0.06] space-y-3">
                    <span className="text-xs font-semibold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>2. Resultado Técnico do Postback</span>
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Plataforma Detectada</span>
                        <span className="text-xs font-semibold text-white">
                          {detailData.technicalAudit.platform}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 block">Modelo de Atribuição</span>
                        <span className="text-xs font-mono text-purple-300">
                          {detailData.technicalAudit.attributionModel}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 block">Tempo até Conversão</span>
                        <span className="text-xs font-mono text-slate-300">
                          {detailData.technicalAudit.attributionTimeSeconds !== null
                            ? `${detailData.technicalAudit.attributionTimeSeconds} segundos`
                            : "Sem clique prévio"}
                        </span>
                      </div>
                    </div>

                    {detailData.technicalAudit.notesOrReason && (
                      <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-slate-300">
                        <span className="font-semibold text-slate-200">Nota Técnica:</span>{" "}
                        {detailData.technicalAudit.notesOrReason}
                      </div>
                    )}
                  </div>

                  {/* Bloco 3: Jornada do Clique (Atribuição) */}
                  {detailData.click ? (
                    <div className="p-4 rounded-xl bg-[#090C14] border border-white/[0.06] space-y-3">
                      <span className="text-xs font-semibold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5 text-blue-400" />
                        <span>3. Metadados do Clique Original</span>
                      </span>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Dispositivo</span>
                          <span className="text-white font-medium">
                            {detailData.click.device || "Desconhecido"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Sistema Operacional</span>
                          <span className="text-white font-medium">{detailData.click.os || "N/A"}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Navegador</span>
                          <span className="text-white font-medium">{detailData.click.browser || "N/A"}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Canal / QR</span>
                          <span className="text-purple-300 font-mono">
                            {detailData.click.isQrScan ? "Escaneamento QR" : "Link Web"}
                          </span>
                        </div>
                      </div>

                      {detailData.click.referer && (
                        <div className="text-[11px] text-slate-400 truncate pt-1">
                          <span className="text-slate-500">Referer:</span> {detailData.click.referer}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs text-slate-400 flex items-center gap-2">
                      <Info className="w-4 h-4 text-slate-500 shrink-0" />
                      <span>
                        Conversão atribuída diretamente ao Smart Link por slug (sem identificador de clique sck).
                      </span>
                    </div>
                  )}

                  {/* Bloco 4: Payload Bruto Sanitizado (Audit Log) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-purple-400" />
                        <span>Payload Bruto do Webhook (Sanitizado)</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            JSON.stringify(detailData.technicalAudit.sanitizedRawPayload, null, 2)
                          );
                          setCopiedPayload(true);
                          setTimeout(() => setCopiedPayload(false), 2000);
                        }}
                        className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                      >
                        {copiedPayload ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedPayload ? "Copiado!" : "Copiar JSON"}</span>
                      </button>
                    </div>

                    <pre className="p-3 rounded-xl bg-[#06080F] border border-white/[0.06] text-[11px] font-mono text-slate-300 max-h-48 overflow-y-auto whitespace-pre-wrap break-all shadow-inner">
                      {detailData.technicalAudit.sanitizedRawPayload
                        ? JSON.stringify(detailData.technicalAudit.sanitizedRawPayload, null, 2)
                        : "Nenhum payload bruto armazenado para esta conversão."}
                    </pre>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-[#0B0E17] border-t border-white/[0.08] flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedConversionId(null)}
                className="btn-stitch-secondary text-xs px-4 py-2 cursor-pointer"
              >
                Fechar Auditoria
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

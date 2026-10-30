"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Search,
  Plus,
  Download,
  Filter,
  Check,
  Minus,
  Copy,
  ExternalLink,
  Edit3,
  History,
  Trash2,
  Pause,
  Play,
  QrCode,
  Layers,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Activity,
  FileSpreadsheet,
  X,
  MoreVertical,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { formatBrDateTime } from "@/lib/date";

export interface SmartLinkItem {
  id: string;
  slug: string;
  title: string | null;
  destinationUrl: string;
  clickCount: number;
  qrScanCount: number;
  status: string;
  createdAt: string;
  campaign?: { id: string; name: string } | null;
  product?: { id: string; name: string } | null;
  offer?: { id: string; name: string } | null;
  qrCode?: {
    id: string;
    style: string;
    fgColor: string;
    bgColor: string;
    logoUrl?: string | null;
    scanCount: number;
  } | null;
}

interface LinksListViewProps {
  links: SmartLinkItem[];
  onOpenCreate: () => void;
  onEditLink: (link: SmartLinkItem) => void;
  onOpenHistory: (link: SmartLinkItem) => void;
  onOpenQr: (link: SmartLinkItem) => void;
  onTogglePause: (link: SmartLinkItem) => Promise<void>;
  onDeleteLink: (id: string) => Promise<void>;
  onRefresh?: () => void;
  loading: boolean;
  shortDomain?: string;
}

export function LinksListView({
  links,
  onOpenCreate,
  onEditLink,
  onOpenHistory,
  onOpenQr,
  onTogglePause,
  onDeleteLink,
  onRefresh,
  loading,
  shortDomain,
}: LinksListViewProps) {
  const [internalSearch, setInternalSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "ACTIVE" | "PAUSED">("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Seleção múltipla
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchFeedback, setBatchFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Modal de Confirmação de Exclusão em Lote
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);

  // Menu de ações secundárias (3 pontos)
  const [secondaryMenuOpen, setSecondaryMenuOpen] = useState(false);
  const secondaryMenuRef = useRef<HTMLDivElement>(null);

  const domain = shortDomain || (typeof window !== "undefined" ? window.location.host : "linkz.io");

  // Fechar menu ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (secondaryMenuRef.current && !secondaryMenuRef.current.contains(event.target as Node)) {
        setSecondaryMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Lista única de campanhas para o dropdown
  const uniqueCampaigns = useMemo(() => {
    const map = new Map<string, string>();
    links.forEach((l) => {
      if (l.campaign) map.set(l.campaign.id, l.campaign.name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [links]);

  // Filtragem
  const filteredLinks = useMemo(() => {
    return links.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (campaignFilter !== "all" && l.campaign?.id !== campaignFilter) return false;

      if (internalSearch.trim()) {
        const q = internalSearch.toLowerCase();
        const matchesSlug = l.slug.toLowerCase().includes(q);
        const matchesTitle = l.title?.toLowerCase().includes(q) ?? false;
        const matchesDest = l.destinationUrl.toLowerCase().includes(q);
        const matchesCamp = l.campaign?.name.toLowerCase().includes(q) ?? false;
        if (!matchesSlug && !matchesTitle && !matchesDest && !matchesCamp) return false;
      }
      return true;
    });
  }, [links, statusFilter, campaignFilter, internalSearch]);

  // Paginação
  const totalPages = Math.max(1, Math.ceil(filteredLinks.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedLinks = filteredLinks.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage);

  const handleCopy = (slug: string, id: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://linkzivo.com";
    navigator.clipboard.writeText(`${origin}/${slug}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.size === paginatedLinks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedLinks.map((l) => l.id)));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // Execução de ação em lote
  const handleExecuteBatchAction = async (action: "pause" | "resume" | "delete") => {
    if (selectedIds.size === 0) return;
    setBatchLoading(true);
    setBatchFeedback(null);

    try {
      const res = await fetch("/api/links/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          linkIds: Array.from(selectedIds),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao processar ação em lote.");
      }

      setBatchFeedback({
        type: "success",
        message: data.message || "Operação realizada com sucesso.",
      });
      setSelectedIds(new Set());
      setShowBatchDeleteModal(false);

      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      setBatchFeedback({
        type: "error",
        message: err.message || "Falha na comunicação com o servidor.",
      });
    } finally {
      setBatchLoading(false);
      setTimeout(() => setBatchFeedback(null), 4000);
    }
  };

  const totalClicksAll = useMemo(() => links.reduce((acc, curr) => acc + curr.clickCount, 0), [links]);
  const totalQrScansAll = useMemo(() => links.reduce((acc, curr) => acc + curr.qrScanCount, 0), [links]);
  const activeLinksCount = useMemo(() => links.filter((l) => l.status === "ACTIVE").length, [links]);
  const qrShareRate = totalClicksAll > 0 ? ((totalQrScansAll / totalClicksAll) * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-6">
      {/* Subheader & Título & Botão Principal + Menu 3 Pontos */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Meus Links
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Gerencie, monitore e edite seus links curtos, parâmetros UTM e códigos QR.
          </p>
        </div>

        {/* Grupo de Ações: Botão Principal Único + Menu Secundário de 3 Pontos */}
        <div className="flex items-center gap-2">
          {/* Botão de Criação Principal Único (sem duplo +) */}
          <button
            onClick={onOpenCreate}
            className="btn-stitch-primary text-xs font-semibold px-4 py-2 cursor-pointer shadow-md shadow-purple-600/25"
          >
            <Plus className="w-4 h-4" />
            <span>Criar Novo Link</span>
          </button>

          {/* Menu Secundário com Botão de 3 Pontos */}
          <div className="relative" ref={secondaryMenuRef}>
            <button
              onClick={() => setSecondaryMenuOpen(!secondaryMenuOpen)}
              className="p-2 rounded-md bg-[#121622] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Mais ações"
              aria-label="Mais ações"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {secondaryMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-52 p-1.5 rounded-md bg-[#161B2B] border border-white/10 shadow-2xl z-40 text-xs">
                <button
                  onClick={() => {
                    setSecondaryMenuOpen(false);
                    alert("Criação em lote via CSV: funcionalidade em sincronização com o módulo de importação em massa.");
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer text-left"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-purple-400" />
                  <span>Criação em lote (CSV)</span>
                </button>

                <button
                  onClick={() => {
                    setSecondaryMenuOpen(false);
                    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(links, null, 2));
                    const a = document.createElement("a");
                    a.href = dataStr;
                    a.download = "meus_links_linkzivo.json";
                    a.click();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer text-left mt-0.5"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Exportar links</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Feedback de Ações em Lote */}
      {batchFeedback && (
        <div
          className={`p-3 rounded-md text-xs border flex items-center justify-between ${
            batchFeedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/10 border-rose-500/30 text-rose-300"
          }`}
        >
          <span>{batchFeedback.message}</span>
          <button
            onClick={() => setBatchFeedback(null)}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3 Cards de Indicadores Sem Etiquetas Redundantes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Links Registrados */}
        <div className="stitch-card p-5 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px] font-mono">
              Links Registrados
            </span>
            <Layers className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
              {links.length.toLocaleString("pt-BR")}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 pt-1">
            • {activeLinksCount} ativos atualmente
          </div>
        </div>

        {/* Card 2: Cliques Consolidados */}
        <div className="stitch-card p-5 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px] font-mono">
              Cliques Consolidados
            </span>
            <Activity className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
              {totalClicksAll.toLocaleString("pt-BR")}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 pt-1">
            • Volume total de redirecionamentos
          </div>
        </div>

        {/* Card 3: Participação de QR Code */}
        <div className="stitch-card p-5 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px] font-mono">
              Participação de QR Code
            </span>
            <QrCode className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
              {totalClicksAll > 0 ? `${qrShareRate}%` : "—"}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 pt-1">
            • {totalQrScansAll.toLocaleString("pt-BR")} leituras diretas via câmera
          </div>
        </div>
      </div>

      {/* Barra de Busca e Filtro de Status Alinhados em Uma Única Linha no Desktop */}
      <div className="stitch-card p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Campo de Busca Consolidado */}
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={internalSearch}
              onChange={(e) => setInternalSearch(e.target.value)}
              placeholder="Buscar por título, slug, tags ou destino..."
              className="w-full pl-9 pr-4 py-2 bg-[#090C14] border border-white/[0.08] focus:border-purple-500 rounded-md text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
            />
          </div>

          {/* Filtro de Status Imediatamente à Direita */}
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 rounded-md bg-[#090C14] border border-white/[0.08] text-xs text-white focus:outline-none cursor-pointer h-[34px]"
            >
              <option value="all">Todos os Status</option>
              <option value="ACTIVE">Ativos</option>
              <option value="PAUSED">Pausados</option>
            </select>

            {uniqueCampaigns.length > 0 && (
              <select
                value={campaignFilter}
                onChange={(e) => setCampaignFilter(e.target.value)}
                className="px-3 py-2 rounded-md bg-[#090C14] border border-white/[0.08] text-xs text-white focus:outline-none cursor-pointer max-w-[160px] truncate h-[34px]"
              >
                <option value="all">Todas as Campanhas</option>
                {uniqueCampaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}

            {(statusFilter !== "all" || campaignFilter !== "all" || internalSearch.trim()) && (
              <button
                onClick={() => {
                  setStatusFilter("all");
                  setCampaignFilter("all");
                  setInternalSearch("");
                }}
                className="p-2 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                title="Limpar filtros"
                aria-label="Limpar filtros"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Barra de Ações em Lote (Quando itens estiverem selecionados) */}
      {selectedIds.size > 0 && (
        <div className="stitch-card p-3 bg-purple-950/20 border-purple-500/30 flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2 text-xs text-purple-200">
            <span className="font-semibold px-2 py-0.5 rounded bg-purple-500/20 text-[#A78BFA] font-mono">
              {selectedIds.size}
            </span>
            <span>link(s) selecionado(s)</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Pausar selecionados */}
            <button
              disabled={batchLoading}
              onClick={() => handleExecuteBatchAction("pause")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Pausar</span>
            </button>

            {/* Reativar selecionados */}
            <button
              disabled={batchLoading}
              onClick={() => handleExecuteBatchAction("resume")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Reativar</span>
            </button>

            {/* Excluir selecionados */}
            <button
              disabled={batchLoading}
              onClick={() => setShowBatchDeleteModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Excluir</span>
            </button>

            <button
              onClick={() => setSelectedIds(new Set())}
              className="p-1.5 rounded-md text-slate-400 hover:text-white cursor-pointer ml-1"
              title="Cancelar seleção"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão em Lote */}
      {showBatchDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-[#0F131F] border border-rose-500/30 rounded-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2 rounded-md bg-rose-500/10 border border-rose-500/20">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
              </div>
              <h3 className="text-base font-bold text-white">Exclusão em Lote</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Você está prestes a excluir <strong className="text-white">{selectedIds.size} link(s)</strong> permanentemente. Essa ação é destrutiva, removerá as métricas associadas e não pode ser desfeita.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBatchDeleteModal(false)}
                className="px-3 py-1.5 rounded-md text-xs text-slate-300 hover:text-white bg-[#121622] border border-white/[0.08] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={batchLoading}
                onClick={() => handleExecuteBatchAction("delete")}
                className="px-4 py-1.5 rounded-md text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {batchLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirmar Exclusão</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabela de Links */}
      <div className="stitch-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase font-mono text-slate-400 bg-[#090C14] border-b border-white/[0.06]">
              <tr>
                <th className="py-3 px-3 w-8">
                  <label className="relative inline-flex items-center justify-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={paginatedLinks.length > 0 && selectedIds.size === paginatedLinks.length}
                      ref={(el) => {
                        if (el) {
                          el.indeterminate = selectedIds.size > 0 && selectedIds.size < paginatedLinks.length;
                        }
                      }}
                      onChange={handleToggleSelectAll}
                      aria-label="Selecionar todos os links da página"
                      className="sr-only peer"
                    />
                    <div
                      className={`w-4 h-4 rounded-[3px] border transition-colors flex items-center justify-center ${
                        paginatedLinks.length > 0 && selectedIds.size === paginatedLinks.length
                          ? "bg-purple-600 border-purple-500 text-white"
                          : selectedIds.size > 0
                          ? "bg-purple-600/40 border-purple-500 text-purple-200"
                          : "bg-[#090C14] border-white/20 hover:border-white/40 text-transparent"
                      } peer-focus-visible:ring-1 peer-focus-visible:ring-purple-400 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-[#090C14]`}
                    >
                      {paginatedLinks.length > 0 && selectedIds.size === paginatedLinks.length && (
                        <Check className="w-3 h-3 stroke-[3]" />
                      )}
                      {selectedIds.size > 0 && selectedIds.size < paginatedLinks.length && (
                        <Minus className="w-3 h-3 stroke-[3]" />
                      )}
                    </div>
                  </label>
                </th>
                <th className="py-3 px-2 w-12 text-center">Status</th>
                <th className="py-3 px-2 w-10 text-center">QR</th>
                <th className="py-3 px-3">Título / Campanha</th>
                <th className="py-3 px-3">URL Curta</th>
                <th className="py-3 px-3">Destino Original</th>
                <th className="py-3 px-3 text-right">Cliques</th>
                <th className="py-3 px-3 text-right">Scans</th>
                <th className="py-3 px-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {paginatedLinks.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-500 font-mono">
                    {loading ? "Carregando links..." : "Nenhum link encontrado para os filtros aplicados."}
                  </td>
                </tr>
              ) : (
                paginatedLinks.map((link) => {
                  const isSelected = selectedIds.has(link.id);
                  const isPaused = link.status === "PAUSED";

                  return (
                    <tr
                      key={link.id}
                      className={`hover:bg-white/[0.02] transition-colors ${
                        isSelected ? "bg-purple-500/[0.04]" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-3">
                        <label className="relative inline-flex items-center justify-center cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectOne(link.id)}
                            aria-label={`Selecionar link ${link.title || link.slug}`}
                            className="sr-only peer"
                          />
                          <div
                            className={`w-4 h-4 rounded-[3px] border transition-colors flex items-center justify-center ${
                              isSelected
                                ? "bg-purple-600 border-purple-500 text-white"
                                : "bg-[#090C14] border-white/20 hover:border-white/40 text-transparent"
                            } peer-focus-visible:ring-1 peer-focus-visible:ring-purple-400 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-[#090C14]`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                        </label>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-2 text-center">
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${
                            isPaused ? "bg-amber-400" : "bg-emerald-400"
                          }`}
                          title={isPaused ? "Pausado" : "Ativo"}
                        />
                      </td>

                      {/* Botão Ver QR Code */}
                      <td className="py-3 px-2 text-center">
                        <button
                          onClick={() => onOpenQr(link)}
                          className="p-1 rounded text-slate-400 hover:text-purple-300 hover:bg-white/[0.06] transition-colors cursor-pointer"
                          title="Visualizar QR Code"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                        </button>
                      </td>

                      {/* Título, Campanha e Data de Criação */}
                      <td className="py-3 px-3">
                        <div className="font-semibold text-white truncate max-w-[200px]">
                          {link.title || link.slug}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5 flex-wrap mt-0.5">
                          {link.campaign ? (
                            <span className="text-purple-300">#{link.campaign.name}</span>
                          ) : (
                            <span className="text-slate-500">Sem campanha</span>
                          )}
                          <span className="text-slate-600">•</span>
                          <span className="text-slate-400" title="Data e hora de criação">
                            {formatBrDateTime(link.createdAt)}
                          </span>
                        </div>
                      </td>

                      {/* URL Curta com Copiar */}
                      <td className="py-3 px-3">
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#090C14] border border-white/[0.06] font-mono text-purple-300 text-xs">
                          <span className="truncate max-w-[130px]">{link.slug}</span>
                          <button
                            onClick={() => handleCopy(link.slug, link.id)}
                            className="hover:text-white cursor-pointer ml-0.5"
                            title="Copiar link curto"
                          >
                            {copiedId === link.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Destino Original */}
                      <td className="py-3 px-3 max-w-[220px] truncate text-slate-400 font-mono">
                        <a
                          href={link.destinationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-purple-300 hover:underline truncate block"
                          title={link.destinationUrl}
                        >
                          {link.destinationUrl}
                        </a>
                      </td>

                      {/* Cliques */}
                      <td className="py-3 px-3 text-right font-mono font-bold text-white">
                        {link.clickCount.toLocaleString("pt-BR")}
                      </td>

                      {/* QR Scans */}
                      <td className="py-3 px-3 text-right font-mono text-emerald-400">
                        {link.qrScanCount.toLocaleString("pt-BR")}
                      </td>

                      {/* Ações na linha */}
                      <td className="py-3 px-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          {/* Editar */}
                          <button
                            onClick={() => onEditLink(link)}
                            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                            title="Editar destino"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {/* Histórico */}
                          <button
                            onClick={() => onOpenHistory(link)}
                            className="p-1.5 rounded text-slate-400 hover:text-purple-300 hover:bg-white/[0.08] transition-colors cursor-pointer"
                            title="Histórico de alterações"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>

                          {/* Pausar / Reativar */}
                          <button
                            onClick={() => onTogglePause(link)}
                            className={`p-1.5 rounded transition-colors cursor-pointer ${
                              isPaused
                                ? "text-emerald-400 hover:bg-emerald-500/10"
                                : "text-amber-400 hover:bg-amber-500/10"
                            }`}
                            title={isPaused ? "Reativar Smart Link" : "Pausar Smart Link"}
                          >
                            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                          </button>

                          {/* Excluir Individual */}
                          <button
                            onClick={() => onDeleteLink(link.id)}
                            className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            title="Excluir link"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé da Tabela: Paginação */}
        <div className="p-3 sm:p-4 bg-[#090C14] border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div>
            Mostrando{" "}
            <span className="font-mono text-white font-semibold">
              {filteredLinks.length === 0 ? 0 : (safePage - 1) * rowsPerPage + 1}
            </span>{" "}
            a{" "}
            <span className="font-mono text-white font-semibold">
              {Math.min(safePage * rowsPerPage, filteredLinks.length)}
            </span>{" "}
            de{" "}
            <span className="font-mono text-white font-semibold">
              {filteredLinks.length}
            </span>{" "}
            links
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span>Linhas por página:</span>
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 rounded bg-[#121622] border border-white/[0.08] text-white focus:outline-none cursor-pointer"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>

            {/* Controles de Página */}
            <div className="flex items-center gap-1">
              <button
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded border border-white/[0.08] text-slate-400 hover:text-white disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="px-3 py-1 rounded bg-purple-600 text-white font-mono font-bold text-xs">
                {safePage}
              </span>

              <button
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded border border-white/[0.08] text-slate-400 hover:text-white disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

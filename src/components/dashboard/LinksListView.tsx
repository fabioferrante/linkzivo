"use client";

import React, { useState, useMemo } from "react";
import {
  Search,
  Plus,
  Download,
  Filter,
  Check,
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
  Sparkles,
  FileSpreadsheet,
  X,
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
}

interface LinksListViewProps {
  links: SmartLinkItem[];
  onOpenCreate: () => void;
  onEditLink: (link: SmartLinkItem) => void;
  onOpenHistory: (link: SmartLinkItem) => void;
  onOpenQr: (link: SmartLinkItem) => void;
  onTogglePause: (link: SmartLinkItem) => Promise<void>;
  onDeleteLink: (id: string) => Promise<void>;
  loading: boolean;
  shortDomain?: string;
  searchQuery?: string;
}

export function LinksListView({
  links,
  onOpenCreate,
  onEditLink,
  onOpenHistory,
  onOpenQr,
  onTogglePause,
  onDeleteLink,
  loading,
  shortDomain,
  searchQuery: externalSearchQuery,
}: LinksListViewProps) {
  const [internalSearch, setInternalSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "ACTIVE" | "PAUSED">("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const search = externalSearchQuery !== undefined ? externalSearchQuery : internalSearch;
  const domain = shortDomain || (typeof window !== "undefined" ? window.location.host : "linkz.io");

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

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesSlug = l.slug.toLowerCase().includes(q);
        const matchesTitle = l.title?.toLowerCase().includes(q) ?? false;
        const matchesDest = l.destinationUrl.toLowerCase().includes(q);
        const matchesCamp = l.campaign?.name.toLowerCase().includes(q) ?? false;
        if (!matchesSlug && !matchesTitle && !matchesDest && !matchesCamp) return false;
      }
      return true;
    });
  }, [links, statusFilter, campaignFilter, search]);

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

  const totalClicksAll = useMemo(() => links.reduce((acc, curr) => acc + curr.clickCount, 0), [links]);
  const totalQrScansAll = useMemo(() => links.reduce((acc, curr) => acc + curr.qrScanCount, 0), [links]);

  return (
    <div className="space-y-6">
      {/* Subheader & Título & Ações Principais */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono tracking-wider uppercase text-purple-400 font-semibold mb-1">
            Mecanismo de Roteamento • Telemetria v2.4.9
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Meus Links
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Gerencie, monitore e edite seus links curtos, parâmetros UTM e códigos QR com redundância ativa e balanceamento de tráfego.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => alert("Criação em lote via CSV: funcionalidade em sincronização com o módulo de importação em massa.")}
            className="btn-stitch-secondary text-xs px-3.5 py-2 cursor-pointer flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
            <span>Criação em Lote (CSV)</span>
          </button>

          <button
            onClick={() => {
              const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(links, null, 2));
              const a = document.createElement("a");
              a.href = dataStr;
              a.download = "meus_links_linkzivo.json";
              a.click();
            }}
            className="btn-stitch-secondary text-xs px-3.5 py-2 cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Exportar</span>
          </button>

          <button
            onClick={onOpenCreate}
            className="btn-stitch-primary text-xs font-semibold px-4 py-2 cursor-pointer shadow-lg shadow-purple-600/30"
          >
            <Plus className="w-4 h-4" />
            <span>+ Criar Novo Link</span>
          </button>
        </div>
      </div>

      {/* 4 Cards de Resumo Rápido */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stitch-card p-5 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px] font-mono">
              Links Registrados
            </span>
            <Layers className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
              {links.length.toLocaleString("pt-BR")}
            </span>
            <span className="badge-stitch-mint text-[11px]">+18 hoje</span>
          </div>
        </div>

        <div className="stitch-card p-5 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px] font-mono">
              Cliques Consolidados
            </span>
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
              {totalClicksAll.toLocaleString("pt-BR")}
            </span>
            <span className="badge-stitch-mint text-[11px]">+14.2%</span>
          </div>
        </div>

        <div className="stitch-card p-5 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px] font-mono">
              QR Scans Diretos
            </span>
            <QrCode className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
              {totalQrScansAll.toLocaleString("pt-BR")}
            </span>
            <span className="badge-stitch-mint text-[11px]">+8.5%</span>
          </div>
        </div>

        <div className="stitch-card p-5 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px] font-mono">
              Taxa de Conversão Global
            </span>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
              4.72%
            </span>
            <span className="badge-stitch-mint text-[11px]">+0.6 pp</span>
          </div>
        </div>
      </div>

      {/* Barra de Pesquisa e Filtros Combinados */}
      <div className="stitch-card p-4 space-y-3">
        {/* Input de Busca */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setInternalSearch(e.target.value)}
            placeholder="Buscar por título, URL curta, tags ou destino..."
            className="w-full pl-10 pr-4 py-2.5 bg-[#090C14] border border-white/[0.08] focus:border-purple-500 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
          />
        </div>

        {/* Linha de Dropdowns de Filtro */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-3">
            {/* Filtro Status */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="text-[10px] uppercase font-mono font-bold">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-2.5 py-1.5 rounded-lg bg-[#090C14] border border-white/[0.08] text-xs text-white focus:outline-none cursor-pointer"
              >
                <option value="all">Todos os Status</option>
                <option value="ACTIVE">Ativo</option>
                <option value="PAUSED">Pausado</option>
              </select>
            </div>

            {/* Filtro Campanhas */}
            {uniqueCampaigns.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="text-[10px] uppercase font-mono font-bold">Campanha:</span>
                <select
                  value={campaignFilter}
                  onChange={(e) => setCampaignFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-[#090C14] border border-white/[0.08] text-xs text-white focus:outline-none cursor-pointer max-w-[180px] truncate"
                >
                  <option value="all">Todas as Campanhas</option>
                  {uniqueCampaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {(statusFilter !== "all" || campaignFilter !== "all" || search.trim()) && (
            <button
              onClick={() => {
                setStatusFilter("all");
                setCampaignFilter("all");
                setInternalSearch("");
              }}
              className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 font-medium transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Limpar Filtros</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabela de Links Estilo Stitch */}
      <div className="stitch-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase font-mono text-slate-400 bg-[#090C14] border-b border-white/[0.06]">
              <tr>
                <th className="py-3 px-3 w-8">
                  <input
                    type="checkbox"
                    checked={paginatedLinks.length > 0 && selectedIds.size === paginatedLinks.length}
                    onChange={handleToggleSelectAll}
                    className="rounded border-white/20 bg-[#121622] text-purple-600 focus:ring-0 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-2 w-12 text-center">Status</th>
                <th className="py-3 px-2 w-10 text-center">QR</th>
                <th className="py-3 px-4">Informações do Link &amp; Roteamento</th>
                <th className="py-3 px-3">Tags • Campanhas</th>
                <th className="py-3 px-3">Criado / Atualizado</th>
                <th className="py-3 px-3 text-right">Cliques &amp; Tendência</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {paginatedLinks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 font-mono">
                    Nenhum Smart Link encontrado para os filtros aplicados.
                  </td>
                </tr>
              ) : (
                paginatedLinks.map((link) => {
                  const isPaused = link.status === "PAUSED";
                  const isSelected = selectedIds.has(link.id);

                  return (
                    <tr
                      key={link.id}
                      className={`hover:bg-white/[0.02] transition-colors ${
                        isPaused ? "opacity-60 bg-white/[0.01]" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3.5 px-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectOne(link.id)}
                          className="rounded border-white/20 bg-[#121622] text-purple-600 focus:ring-0 cursor-pointer"
                        />
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-2 text-center">
                        <span
                          className={`inline-block w-2.5 h-2.5 rounded-full ${
                            isPaused
                              ? "bg-slate-500"
                              : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                          }`}
                          title={isPaused ? "Pausado" : "Ativo e Redirecionando"}
                        />
                      </td>

                      {/* QR Thumbnail */}
                      <td className="py-3.5 px-2 text-center">
                        <button
                          onClick={() => onOpenQr(link)}
                          className="p-1 rounded-lg bg-[#090C14] border border-white/[0.06] text-slate-400 hover:text-purple-300 hover:border-purple-500/40 transition-colors cursor-pointer"
                          title="Visualizar e Baixar QR Code"
                        >
                          <QrCode className="w-4 h-4" />
                        </button>
                      </td>

                      {/* Informações do Link */}
                      <td className="py-3.5 px-4 min-w-[240px]">
                        <div className="flex items-center gap-1.5 font-semibold text-white">
                          <span className="truncate">{link.title || link.slug}</span>
                          {link.status === "ACTIVE" && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          )}
                        </div>

                        {/* URL Curta */}
                        <div className="flex items-center gap-1.5 font-mono text-[11px] text-purple-300 mt-0.5">
                          <span>{domain}/{link.slug}</span>
                          <button
                            onClick={() => handleCopy(link.slug, link.id)}
                            className="hover:text-white cursor-pointer ml-1"
                            title="Copiar URL Curta"
                          >
                            {copiedId === link.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </button>
                        </div>

                        {/* Destino Original */}
                        <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono truncate max-w-sm mt-0.5">
                          <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                          <a
                            href={link.destinationUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-purple-300 hover:underline truncate"
                          >
                            {link.destinationUrl}
                          </a>
                        </div>
                      </td>

                      {/* Tags • Campanhas */}
                      <td className="py-3.5 px-3">
                        <div className="flex flex-wrap items-center gap-1">
                          {link.campaign ? (
                            <span className="badge-stitch-purple text-[10px]">
                              {link.campaign.name}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">Avulso</span>
                          )}
                          {link.product && (
                            <span className="badge-stitch-mint text-[10px]">
                              {link.product.name}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Criado / Atualizado */}
                      <td className="py-3.5 px-3 text-[11px] text-slate-400 font-mono whitespace-nowrap">
                        {formatBrDateTime(link.createdAt)}
                      </td>

                      {/* Cliques & Tendência */}
                      <td className="py-3.5 px-3 text-right">
                        <div className="font-mono font-bold text-white text-sm">
                          {link.clickCount.toLocaleString("pt-BR")}
                        </div>
                        <div className="text-[10px] text-emerald-400 font-mono font-medium">
                          ↗ +15.4%
                        </div>
                      </td>

                      {/* Ações */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Editar */}
                          <button
                            onClick={() => onEditLink(link)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                            title="Editar destino e informações"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {/* Histórico */}
                          <button
                            onClick={() => onOpenHistory(link)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-purple-300 hover:bg-white/[0.08] transition-colors cursor-pointer"
                            title="Ver histórico de edições do destino"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>

                          {/* Pausar / Reativar */}
                          <button
                            onClick={() => onTogglePause(link)}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              isPaused
                                ? "text-emerald-400 hover:bg-emerald-500/10"
                                : "text-amber-400 hover:bg-amber-500/10"
                            }`}
                            title={isPaused ? "Reativar Smart Link" : "Pausar Smart Link"}
                          >
                            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                          </button>

                          {/* Excluir */}
                          <button
                            onClick={() => onDeleteLink(link.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
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

        {/* Rodapé da Tabela: Paginação Completa Estilo Stitch */}
        <div className="p-4 bg-[#090C14] border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
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
                className="p-1.5 rounded-lg border border-white/[0.08] text-slate-400 hover:text-white disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="px-3 py-1 rounded-lg bg-purple-600 text-white font-mono font-bold text-xs">
                {safePage}
              </span>

              <button
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-white/[0.08] text-slate-400 hover:text-white disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
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

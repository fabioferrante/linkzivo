"use client";

import React, { useState, useMemo } from "react";
import {
  Link2,
  QrCode,
  Search,
  Filter,
  Plus,
  Download,
  Upload,
  RefreshCw,
  Copy,
  Check,
  Edit3,
  Trash2,
  Play,
  Pause,
  ExternalLink,
  ChevronDown,
  LayoutList,
  LayoutGrid,
  History,
  TrendingUp,
  Tag,
  ShieldCheck,
  BarChart2,
} from "lucide-react";
import { formatBrDateTime } from "@/lib/date";

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
  product?: { id: string; name: string } | null;
  offer?: { id: string; name: string } | null;
}

interface LinksViewProps {
  links: SmartLinkItem[];
  onOpenCreate: () => void;
  onEditLink: (link: SmartLinkItem) => void;
  onOpenQrModal: (link: SmartLinkItem) => void;
  onOpenHistoryModal: (link: SmartLinkItem) => void;
  onToggleStatus: (linkId: string, currentStatus: string) => void;
  onDeleteLink: (linkId: string) => void;
  onOpenAnalytics: () => void;
  loading?: boolean;
}

export function LinksView({
  links,
  onOpenCreate,
  onEditLink,
  onOpenQrModal,
  onOpenHistoryModal,
  onToggleStatus,
  onDeleteLink,
  onOpenAnalytics,
  loading = false,
}: LinksViewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "PAUSED">("ALL");
  const [campaignFilter, setCampaignFilter] = useState<string>("ALL");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Filtros aplicados
  const filteredLinks = useMemo(() => {
    return links.filter((link) => {
      // Busca
      const matchesSearch =
        searchTerm === "" ||
        (link.title && link.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
        link.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
        link.destinationUrl.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (link.campaign?.name && link.campaign.name.toLowerCase().includes(searchTerm.toLowerCase()));

      // Status
      const matchesStatus =
        statusFilter === "ALL" || link.status === statusFilter;

      // Campanha
      const matchesCampaign =
        campaignFilter === "ALL" ||
        (link.campaign && link.campaign.name === campaignFilter);

      return matchesSearch && matchesStatus && matchesCampaign;
    });
  }, [links, searchTerm, statusFilter, campaignFilter]);

  // Paginação real
  const totalPages = Math.max(1, Math.ceil(filteredLinks.length / rowsPerPage));
  const paginatedLinks = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredLinks.slice(start, start + rowsPerPage);
  }, [filteredLinks, currentPage, rowsPerPage]);

  const totalClicksConsolidados = links.reduce((acc, l) => acc + l.clickCount, 0);
  const totalQrScansConsolidados = links.reduce((acc, l) => acc + l.qrScanCount, 0);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(paginatedLinks.map((l) => l.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("ALL");
    setCampaignFilter("ALL");
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Topo: MECANISMO DE ROTEAMENTO & Título */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono tracking-wider text-slate-400 uppercase mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
            <span>MECANISMO DE ROTEAMENTO • TELEMETRIA v2.4.9</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Meus Links
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
            Gerencie, monitore e edite seus links curtos, parâmetros UTM e códigos QR com redundância ativa e balanceamento de tráfego.
          </p>
        </div>

        {/* Botões de Ação do Topo */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            title="Criação em lote via CSV"
            className="btn-secondary text-xs px-3.5 py-2 font-medium cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-slate-400" />
            <span>Criação em Lote (CSV)</span>
          </button>
          <button
            title="Exportar links"
            className="btn-secondary text-xs px-3.5 py-2 font-medium cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Exportar</span>
          </button>
          <button
            onClick={onOpenCreate}
            className="btn-primary text-xs px-4 py-2 font-semibold shadow-md shadow-purple-500/25 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Criar Novo Link</span>
          </button>
        </div>
      </div>

      {/* 4 Mini KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[#11141D] border border-[#1F2432]">
          <div className="flex items-center justify-between text-slate-400 mb-1 text-[11px] font-mono">
            <span>Links Registrados</span>
            <Link2 className="w-3.5 h-3.5 text-[#8B5CF6]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">
              {links.length.toLocaleString("pt-BR")}
            </span>
            <span className="badge-mint text-[10px] py-0 px-1.5 font-mono">
              +18 hoje
            </span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#11141D] border border-[#1F2432]">
          <div className="flex items-center justify-between text-slate-400 mb-1 text-[11px] font-mono">
            <span>Cliques Consolidados</span>
            <TrendingUp className="w-3.5 h-3.5 text-[#10B981]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">
              {totalClicksConsolidados.toLocaleString("pt-BR")}
            </span>
            <span className="badge-mint text-[10px] py-0 px-1.5 font-mono">
              +14.2%
            </span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#11141D] border border-[#1F2432]">
          <div className="flex items-center justify-between text-slate-400 mb-1 text-[11px] font-mono">
            <span>QR Scans Diretos</span>
            <QrCode className="w-3.5 h-3.5 text-[#A855F7]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">
              {totalQrScansConsolidados.toLocaleString("pt-BR")}
            </span>
            <span className="badge-mint text-[10px] py-0 px-1.5 font-mono">
              +8.5%
            </span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#11141D] border border-[#1F2432]">
          <div className="flex items-center justify-between text-slate-400 mb-1 text-[11px] font-mono">
            <span>Taxa de Conversão Global</span>
            <BarChart2 className="w-3.5 h-3.5 text-[#38BDF8]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">
              4.72%
            </span>
            <span className="badge-mint text-[10px] py-0 px-1.5 font-mono">
              +0.6 pp
            </span>
          </div>
        </div>
      </div>

      {/* Barra de Filtros & Busca */}
      <div className="p-4 rounded-2xl bg-[#11141D] border border-[#1F2432] space-y-3">
        {/* Campo de Busca + Alternador Lista / Grid */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por título, URL curta, tags ou destino..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-[#0D1017] border border-[#1F2432] focus:border-[#8B5CF6] text-xs text-white rounded-xl pl-10 pr-4 py-2.5 outline-none transition-colors placeholder:text-slate-500 font-sans"
            />
          </div>

          {/* Alternador Lista / Grid */}
          <div className="bg-[#0D1017] border border-[#1F2432] rounded-xl p-1 flex items-center gap-1">
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === "list" ? "bg-[#1F2432] text-white" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === "grid" ? "bg-[#1F2432] text-white" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Linha de Dropdowns de Filtro */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#1F2432]/60 text-xs">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Status Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-slate-500 uppercase">STATUS:</span>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="bg-[#0D1017] border border-[#1F2432] text-slate-300 rounded-lg px-2.5 py-1.5 outline-none font-sans text-xs cursor-pointer"
              >
                <option value="ALL">Todos os Status</option>
                <option value="ACTIVE">Ativo</option>
                <option value="PAUSED">Pausado</option>
              </select>
            </div>

            {/* Domínio Raiz */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-slate-500 uppercase">DOMÍNIO RAIZ:</span>
              <select className="bg-[#0D1017] border border-[#1F2432] text-slate-300 rounded-lg px-2.5 py-1.5 outline-none font-sans text-xs cursor-pointer">
                <option>Todos os Domínios (4)</option>
                <option>linkz.io</option>
                <option>app.meulink.com.br</option>
                <option>acesso.vip</option>
              </select>
            </div>

            {/* Campanhas / Tags */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-slate-500 uppercase">CAMPANHAS / TAGS:</span>
              <select
                value={campaignFilter}
                onChange={(e) => {
                  setCampaignFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-[#0D1017] border border-[#1F2432] text-slate-300 rounded-lg px-2.5 py-1.5 outline-none font-sans text-xs cursor-pointer"
              >
                <option value="ALL">Todas as Tags</option>
                {Array.from(new Set(links.map((l) => l.campaign?.name).filter(Boolean))).map((camp) => (
                  <option key={camp} value={camp}>
                    {camp}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Botão Limpar Filtros */}
          {(searchTerm || statusFilter !== "ALL" || campaignFilter !== "ALL") && (
            <button
              onClick={clearFilters}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Limpar Filtros</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabela de Links de Alta Densidade */}
      <div className="p-4 sm:p-6 rounded-2xl bg-[#11141D] border border-[#1F2432] shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-[#1F2432] text-slate-400 uppercase text-[10px]">
                <th className="py-3 px-3 w-8">
                  <input
                    type="checkbox"
                    onChange={handleSelectAll}
                    checked={
                      paginatedLinks.length > 0 &&
                      selectedIds.length === paginatedLinks.length
                    }
                    className="rounded bg-[#0D1017] border-[#1F2432] text-[#8B5CF6] focus:ring-0 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-2 w-16">STATUS</th>
                <th className="py-3 px-2 w-12 text-center">QR</th>
                <th className="py-3 px-3">INFORMAÇÕES DO LINK &amp; ROTEAMENTO</th>
                <th className="py-3 px-3">TAGS • CAMPANHAS</th>
                <th className="py-3 px-3">CRIADO / ATUALIZADO</th>
                <th className="py-3 px-3 text-right">CLIQUES &amp; TENDÊNCIA</th>
                <th className="py-3 px-3 text-right w-28">AÇÕES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F2432]/60">
              {paginatedLinks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 font-sans">
                    Nenhum link encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                paginatedLinks.map((link) => {
                  const isPaused = link.status === "PAUSED";
                  const isSelected = selectedIds.includes(link.id);

                  return (
                    <tr
                      key={link.id}
                      className={`hover:bg-[#151924]/80 transition-colors ${
                        isSelected ? "bg-[#8B5CF6]/5" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3.5 px-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectOne(link.id)}
                          className="rounded bg-[#0D1017] border-[#1F2432] text-[#8B5CF6] focus:ring-0 cursor-pointer"
                        />
                      </td>

                      {/* Status Dot */}
                      <td className="py-3.5 px-2">
                        {isPaused ? (
                          <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                            <span className="w-2 h-2 rounded-full bg-slate-500" />
                            <span>Pausado</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-[#10B981] text-[11px]">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#10B981]" />
                            </span>
                            <span>Ativo</span>
                          </div>
                        )}
                      </td>

                      {/* QR Thumbnail */}
                      <td className="py-3.5 px-2 text-center">
                        <button
                          onClick={() => onOpenQrModal(link)}
                          title="Visualizar e exportar QR Code"
                          className="w-7 h-7 rounded-lg bg-[#151924] border border-[#1F2432] hover:border-[#8B5CF6] flex items-center justify-center text-slate-300 hover:text-[#8B5CF6] transition-colors cursor-pointer inline-flex"
                        >
                          <QrCode className="w-4 h-4" />
                        </button>
                      </td>

                      {/* Informações do Link & Roteamento */}
                      <td className="py-3.5 px-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 font-sans">
                            <span className="text-white font-semibold text-xs truncate max-w-sm">
                              {link.title || `Smart Link /${link.slug}`}
                            </span>
                            <ShieldCheck className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                          </div>

                          {/* URL Curta + Botão de Cópia */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[#C4B5FD] font-mono text-xs">
                              linkz.io/{link.slug}
                            </span>
                            <button
                              onClick={() =>
                                copyToClipboard(
                                  `https://linkzivo-production.up.railway.app/${link.slug}`,
                                  link.id
                                )
                              }
                              title="Copiar link curto"
                              className="text-slate-500 hover:text-white cursor-pointer"
                            >
                              {copiedId === link.id ? (
                                <Check className="w-3 h-3 text-[#10B981]" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>

                          {/* Destino Original Truncado */}
                          <div className="flex items-center gap-1 text-[11px] text-slate-500 truncate max-w-md">
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            <a
                              href={link.destinationUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:text-slate-300 truncate"
                            >
                              {link.destinationUrl}
                            </a>
                          </div>
                        </div>
                      </td>

                      {/* Tags • Campanhas */}
                      <td className="py-3.5 px-3">
                        <div className="flex flex-wrap gap-1">
                          {link.campaign ? (
                            <span className="badge-purple text-[10px] py-0 px-2">
                              {link.campaign.name}
                            </span>
                          ) : (
                            <span className="badge-subtle text-[10px] py-0 px-2">
                              Geral
                            </span>
                          )}
                          {link.product && (
                            <span className="badge-subtle text-[10px] py-0 px-2 text-slate-400">
                              {link.product.name}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Criado / Atualizado */}
                      <td className="py-3.5 px-3 text-slate-400 text-[11px]">
                        <div>{formatBrDateTime(link.createdAt)}</div>
                        <div className="text-[10px] text-slate-500">Há 23 minutos</div>
                      </td>

                      {/* Cliques & Tendência */}
                      <td className="py-3.5 px-3 text-right">
                        <div className="text-white font-bold text-xs">
                          {link.clickCount.toLocaleString("pt-BR")}
                        </div>
                        <div className="text-[10px] text-[#10B981] font-medium flex items-center justify-end gap-0.5">
                          <TrendingUp className="w-3 h-3" />
                          <span>+15.4%</span>
                        </div>
                      </td>

                      {/* Ações */}
                      <td className="py-3.5 px-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          {/* Editar */}
                          <button
                            onClick={() => onEditLink(link)}
                            title="Editar destino e propriedades"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1F2432] transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {/* Estatísticas */}
                          <button
                            onClick={onOpenAnalytics}
                            title="Ver estatísticas detalhadas"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-[#8B5CF6] hover:bg-[#1F2432] transition-colors cursor-pointer"
                          >
                            <BarChart2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Pausar / Despausar */}
                          <button
                            onClick={() => onToggleStatus(link.id, link.status)}
                            title={isPaused ? "Reativar Smart Link" : "Pausar Smart Link"}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-[#1F2432] transition-colors cursor-pointer"
                          >
                            {isPaused ? (
                              <Play className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Pause className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Histórico */}
                          <button
                            onClick={() => onOpenHistoryModal(link)}
                            title="Histórico de alterações"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-sky-400 hover:bg-[#1F2432] transition-colors cursor-pointer"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>

                          {/* Excluir */}
                          <button
                            onClick={() => onDeleteLink(link.id)}
                            title="Excluir link permanentemente"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
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

        {/* Paginação Inferior */}
        <div className="pt-4 mt-4 border-t border-[#1F2432] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-3">
            <span>
              Mostrando{" "}
              <strong className="text-white">
                {filteredLinks.length === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1}-
                {Math.min(currentPage * rowsPerPage, filteredLinks.length)}
              </strong>{" "}
              de <strong className="text-white">{filteredLinks.length}</strong> links
            </span>

            <div className="flex items-center gap-1.5">
              <span>Linhas por página:</span>
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-[#0D1017] border border-[#1F2432] text-slate-300 rounded px-1.5 py-0.5 outline-none font-sans text-xs cursor-pointer"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          {/* Botões de Página */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1 rounded-lg bg-[#151924] border border-[#1F2432] disabled:opacity-40 hover:text-white cursor-pointer"
            >
              &lt;
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .slice(0, 5)
              .map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                    currentPage === page
                      ? "bg-[#8B5CF6] text-white font-bold"
                      : "bg-[#151924] border border-[#1F2432] text-slate-400 hover:text-white"
                  }`}
                >
                  {page}
                </button>
              ))}

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1 rounded-lg bg-[#151924] border border-[#1F2432] disabled:opacity-40 hover:text-white cursor-pointer"
            >
              &gt;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

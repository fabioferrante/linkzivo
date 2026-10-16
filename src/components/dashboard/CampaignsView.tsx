"use client";

import React, { useState } from "react";
import {
  Layers,
  Plus,
  Play,
  Pause,
  Edit3,
  Trash2,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Activity,
  ShoppingBag,
  Link2,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

export interface CampaignItem {
  id: string;
  name: string;
  status: string;
  description: string | null;
  budget?: number | null;
  smartLinks?: Array<{
    id: string;
    slug: string;
    title: string | null;
    clickCount: number;
  }>;
  campaignProducts?: Array<{
    product: {
      id: string;
      name: string;
      platform: string;
      status: string;
    };
  }>;
  _count?: {
    smartLinks: number;
    conversions: number;
    campaignProducts?: number;
  };
}

interface CampaignsViewProps {
  campaigns: CampaignItem[];
  onOpenCreate: () => void;
  onEditCampaign: (camp: CampaignItem) => void;
  onOpenDetails: (id: string) => void;
  onToggleStatus: (id: string, currentStatus: string) => Promise<void>;
  onDeleteCampaign: (id: string) => Promise<void>;
  actionLoading: string | null;
}

export function CampaignsView({
  campaigns,
  onOpenCreate,
  onEditCampaign,
  onOpenDetails,
  onToggleStatus,
  onDeleteCampaign,
  actionLoading,
}: CampaignsViewProps) {
  const [filter, setFilter] = useState<"all" | "ACTIVE" | "ENDED">("all");

  const filteredCampaigns = campaigns.filter((c) => {
    if (filter === "all") return true;
    return c.status === filter;
  });

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono tracking-wider uppercase text-purple-400 font-semibold mb-1">
            Gestão Estratégica de Tráfego • Relacionamentos N:N
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Campanhas
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Agrupe múltiplos produtos e Smart Links em iniciativas unificadas para monitorar cliques e comissões.
          </p>
        </div>

        <button
          onClick={onOpenCreate}
          className="btn-stitch-primary text-xs font-semibold px-4 py-2.5 cursor-pointer shadow-lg shadow-purple-600/30 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>+ Nova Campanha</span>
        </button>
      </div>

      {/* Barra de Filtros por Ciclo de Vida */}
      <div className="stitch-card p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              filter === "all"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Todas ({campaigns.length})
          </button>
          <button
            onClick={() => setFilter("ACTIVE")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              filter === "ACTIVE"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Ativas ({campaigns.filter((c) => c.status === "ACTIVE").length})
          </button>
          <button
            onClick={() => setFilter("ENDED")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              filter === "ENDED"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Encerradas ({campaigns.filter((c) => c.status === "ENDED").length})
          </button>
        </div>
      </div>

      {/* Grid de Cards de Campanha */}
      {filteredCampaigns.length === 0 ? (
        <div className="stitch-card p-12 text-center text-slate-500 font-mono text-xs">
          Nenhuma campanha encontrada com o filtro selecionado.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCampaigns.map((camp) => {
            const isEnded = camp.status === "ENDED";
            const productsCount = camp.campaignProducts?.length || camp._count?.campaignProducts || 0;
            const linksCount = camp.smartLinks?.length || camp._count?.smartLinks || 0;

            return (
              <div
                key={camp.id}
                className={`stitch-card stitch-card-hover p-5 flex flex-col justify-between space-y-4 ${
                  isEnded ? "opacity-70" : ""
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full border ${
                        isEnded
                          ? "bg-slate-700/20 text-slate-400 border-slate-700"
                          : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      }`}
                    >
                      {isEnded ? "Encerrada" : "Ativa"}
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onEditCampaign(camp)}
                        className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                        title="Editar campanha e produtos vinculados"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onToggleStatus(camp.id, camp.status)}
                        disabled={actionLoading === camp.id}
                        className={`p-1 rounded-lg transition-colors cursor-pointer ${
                          isEnded
                            ? "text-emerald-400 hover:bg-emerald-500/10"
                            : "text-amber-400 hover:bg-amber-500/10"
                        }`}
                        title={isEnded ? "Reativar campanha" : "Encerrar campanha"}
                      >
                        {isEnded ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => onDeleteCampaign(camp.id)}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Excluir campanha"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-white tracking-tight truncate">
                    {camp.name}
                  </h3>
                  {camp.description && (
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                      {camp.description}
                    </p>
                  )}
                </div>

                {/* Métricas e Vínculos */}
                <div className="pt-3 border-t border-white/[0.06] space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-lg bg-[#090C14] border border-white/[0.04]">
                      <div className="text-[10px] text-slate-400 font-mono">Produtos (N:N)</div>
                      <div className="text-sm font-bold text-white font-mono">{productsCount}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-[#090C14] border border-white/[0.04]">
                      <div className="text-[10px] text-slate-400 font-mono">Smart Links</div>
                      <div className="text-sm font-bold text-purple-300 font-mono">{linksCount}</div>
                    </div>
                  </div>

                  <button
                    onClick={() => onOpenDetails(camp.id)}
                    className="w-full btn-stitch-secondary py-2 text-xs justify-between cursor-pointer"
                  >
                    <span>Auditar Métricas Consolidadas</span>
                    <ChevronRight className="w-4 h-4 text-purple-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

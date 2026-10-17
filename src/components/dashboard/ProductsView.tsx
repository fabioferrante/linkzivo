"use client";

import React, { useState } from "react";
import {
  ShoppingBag,
  Plus,
  Play,
  Pause,
  Edit3,
  Trash2,
  ExternalLink,
  ChevronRight,
  Tag,
  DollarSign,
  Percent,
} from "lucide-react";

export interface ProductOffer {
  id: string;
  productId: string;
  name: string;
  affiliateUrl: string;
  commissionType: string | null;
  commissionValue: number | null;
  currency: string;
  status: string;
}

export interface ProductItem {
  id: string;
  name: string;
  platform: string;
  status: string;
  description?: string | null;
  offers?: ProductOffer[];
  _count?: {
    campaigns?: number;
    smartLinks: number;
  };
}

interface ProductsViewProps {
  products: ProductItem[];
  onOpenCreate: () => void;
  onEditProduct: (product: ProductItem) => void;
  onOpenAddOffer: (productId: string) => void;
  onOpenDetails: (productId: string) => void;
  onToggleStatus: (productId: string, currentStatus: string) => Promise<void>;
  onDeleteProduct: (productId: string) => Promise<void>;
  actionLoading: string | null;
}

export function ProductsView({
  products,
  onOpenCreate,
  onEditProduct,
  onOpenAddOffer,
  onOpenDetails,
  onToggleStatus,
  onDeleteProduct,
  actionLoading,
}: ProductsViewProps) {
  const [filter, setFilter] = useState<"all" | "ACTIVE" | "INACTIVE">("all");

  const filteredProducts = products.filter((p) => {
    if (filter === "all") return true;
    return p.status === filter;
  });

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono tracking-wider uppercase text-purple-400 font-semibold mb-1">
            Link Vault • Catálogo de Produtos &amp; Ofertas de Afiliados
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Produtos &amp; Ofertas
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Cadastre os produtos que você promove (Hotmart, Kiwify, Eduzz) e configure ofertas múltiplas com comissões.
          </p>
        </div>

        <button
          onClick={onOpenCreate}
          className="btn-stitch-primary text-xs font-semibold px-4 py-2.5 cursor-pointer shadow-md shadow-purple-600/25 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Produto</span>
        </button>
      </div>

      {/* Barra de Filtros */}
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
            Todos ({products.length})
          </button>
          <button
            onClick={() => setFilter("ACTIVE")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              filter === "ACTIVE"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Ativos ({products.filter((p) => p.status === "ACTIVE").length})
          </button>
          <button
            onClick={() => setFilter("INACTIVE")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              filter === "INACTIVE"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Desativados ({products.filter((p) => p.status === "INACTIVE").length})
          </button>
        </div>
      </div>

      {/* Grid de Produtos */}
      {filteredProducts.length === 0 ? (
        <div className="stitch-card p-12 text-center text-slate-500 font-mono text-xs">
          Nenhum produto cadastrado com o filtro selecionado.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProducts.map((prod) => {
            const isInactive = prod.status === "INACTIVE";
            const offers = prod.offers || [];

            return (
              <div
                key={prod.id}
                className={`stitch-card stitch-card-hover p-5 flex flex-col justify-between space-y-4 ${
                  isInactive ? "opacity-70" : ""
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="badge-stitch-purple text-[10px] font-mono">
                      {prod.platform}
                    </span>

                    <div className="flex items-center gap-1">
                      {/* Botão de Edição do Produto */}
                      <button
                        onClick={() => onEditProduct(prod)}
                        className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                        title="Editar produto"
                        aria-label="Editar produto"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => onToggleStatus(prod.id, prod.status)}
                        disabled={actionLoading === prod.id}
                        className={`p-1 rounded transition-colors cursor-pointer ${
                          isInactive
                            ? "text-emerald-400 hover:bg-emerald-500/10"
                            : "text-amber-400 hover:bg-amber-500/10"
                        }`}
                        title={isInactive ? "Reativar produto" : "Desativar produto"}
                      >
                        {isInactive ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => onDeleteProduct(prod.id)}
                        className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Excluir produto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-white tracking-tight truncate">
                    {prod.name}
                  </h3>
                </div>

                {/* Lista de Ofertas */}
                <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-mono text-[10px] uppercase">
                      Ofertas Cadastradas ({offers.length})
                    </span>
                    <button
                      onClick={() => onOpenAddOffer(prod.id)}
                      className="text-purple-400 hover:text-purple-300 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Nova Oferta</span>
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {offers.length === 0 ? (
                      <div className="text-[11px] text-slate-500 font-mono py-2 text-center bg-[#090C14] rounded-lg">
                        Nenhuma oferta configurada.
                      </div>
                    ) : (
                      offers.map((off) => (
                        <div
                          key={off.id}
                          className="p-2 rounded-lg bg-[#090C14] border border-white/[0.04] flex items-center justify-between text-xs"
                        >
                          <div className="min-w-0 pr-2">
                            <div className="text-white font-medium truncate">{off.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono truncate max-w-[160px]">
                              {off.affiliateUrl}
                            </div>
                          </div>
                          <div className="text-right shrink-0 font-mono text-emerald-400 text-[11px] font-semibold">
                            {off.commissionValue ? `R$ ${off.commissionValue}` : "Comissão N/D"}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Botão de Auditoria */}
                <button
                  onClick={() => onOpenDetails(prod.id)}
                  className="w-full btn-stitch-secondary py-2 text-xs justify-between cursor-pointer pt-3 border-t border-white/[0.06]"
                >
                  <span>Métricas &amp; Desempenho do Produto</span>
                  <ChevronRight className="w-4 h-4 text-purple-400" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

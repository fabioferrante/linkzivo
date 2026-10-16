"use client";

import React from "react";
import {
  Search,
  Bell,
  Plus,
  ChevronRight,
} from "lucide-react";

interface HeaderProps {
  currentTab: string;
  onOpenCreate: () => void;
  user?: {
    name?: string | null;
    email: string;
  } | null;
  onSearch?: (query: string) => void;
}

export function DashboardHeader({
  currentTab,
  onOpenCreate,
  user,
  onSearch,
}: HeaderProps) {
  const getTabLabel = (tab: string) => {
    switch (tab) {
      case "overview":
        return "Painel";
      case "links":
        return "Meus Links";
      case "create":
        return "Criar Link";
      case "campaigns":
        return "Campanhas";
      case "products":
        return "Produtos & Ofertas";
      case "analytics":
        return "Analytics";
      default:
        return "Painel";
    }
  };

  const displayName = user?.name || "Lucas Andrade";
  const userInitials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  return (
    <header className="h-16 border-b border-[#1F2432] bg-[#0E1118]/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-40">
      {/* Breadcrumbs & Busca */}
      <div className="flex items-center gap-6 flex-1">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
          <span className="hover:text-slate-200 cursor-pointer">App</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
          <span className="text-white font-semibold">{getTabLabel(currentTab)}</span>
        </div>

        {/* Barra de Busca Global com atalho ⌘K */}
        <div className="relative max-w-md w-full hidden md:block">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar links, tags ou encurtar URL..."
            onChange={(e) => onSearch && onSearch(e.target.value)}
            className="w-full bg-[#151924] border border-[#1F2432] focus:border-[#8B5CF6] text-xs text-white rounded-xl pl-9 pr-14 py-2 outline-none transition-colors placeholder:text-slate-500"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono bg-[#1E2333] border border-[#2B3247] text-slate-400 px-1.5 py-0.5 rounded">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Ações da Direita */}
      <div className="flex items-center gap-3.5">
        {/* Badge de Status dos Sistemas Operacionais */}
        <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#10B981]/10 border border-[#10B981]/25 text-[#10B981] text-xs font-medium">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#10B981]" />
          </span>
          <span>Sistemas operacionais</span>
        </div>

        {/* Sino de Notificações */}
        <button
          title="Notificações"
          className="relative p-2 rounded-xl bg-[#151924] border border-[#1F2432] text-slate-400 hover:text-white hover:border-slate-600 transition-colors cursor-pointer"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#8B5CF6]" />
        </button>

        {/* Botão Primário: + Novo Link */}
        <button
          onClick={onOpenCreate}
          className="btn-primary text-xs px-3.5 py-2 font-semibold shadow-md shadow-purple-500/20 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Link</span>
        </button>

        {/* Avatar Compacto */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#8B5CF6] to-[#06B6D4] flex items-center justify-center text-white text-xs font-bold shrink-0 border border-purple-500/30">
          {userInitials}
        </div>
      </div>
    </header>
  );
}

"use client";

import React from "react";
import {
  Search,
  Bell,
  Plus,
  Menu,
  ChevronRight,
  ExternalLink,
} from "lucide-react";

interface HeaderProps {
  activeTabTitle: string;
  onOpenCreateModal: () => void;
  onOpenMobileSidebar: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  user: {
    name: string | null;
    email: string;
    workspacePlan: string;
  } | null;
}

export function Header({
  activeTabTitle,
  onOpenCreateModal,
  onOpenMobileSidebar,
  searchQuery,
  onSearchChange,
  user,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 h-16 w-full bg-[#0B0E17]/90 backdrop-blur-md border-b border-white/[0.07] px-4 sm:px-6 flex items-center justify-between gap-4">
      {/* Lado Esquerdo: Botão mobile + Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMobileSidebar}
          className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-xs font-medium text-slate-400 min-w-0">
          <span className="text-slate-400 hover:text-slate-300">App</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-white font-semibold truncate">{activeTabTitle}</span>
        </div>
      </div>

      {/* Centro: Barra de Busca Global Estilo Stitch */}
      <div className="flex-1 max-w-md hidden md:block">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar links, tags ou encurtar URL..."
            className="w-full pl-9 pr-14 py-2 bg-[#121622] border border-white/[0.08] hover:border-white/[0.14] focus:border-purple-500 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500/50 transition-all font-sans"
          />
          <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-[#1A1F2E] border border-white/[0.08] rounded">
              ⌘K
            </kbd>
          </div>
        </div>
      </div>

      {/* Lado Direito: Status Sistemas Operacionais + Sino + Botão Novo Link */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Status operacional estilo Stitch */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#121622] border border-white/[0.07] text-xs">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
          </span>
          <span className="text-slate-300 font-medium text-[11px]">Sistemas operacionais</span>
        </div>

        {/* Notificações */}
        <button
          onClick={() => alert("Central de Notificações: Telemetria e webhooks operando com 100% de integridade.")}
          className="relative p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          title="Notificações do sistema"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-purple-500" />
        </button>

        {/* Botão Novo Link Roxo Vibrante */}
        <button
          onClick={onOpenCreateModal}
          className="btn-stitch-primary text-xs font-semibold px-3.5 py-2 cursor-pointer shadow-lg shadow-purple-600/30"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Novo Link</span>
        </button>
      </div>
    </header>
  );
}

"use client";

import React from "react";
import {
  Menu,
  ChevronRight,
  LogOut,
  Bell,
} from "lucide-react";

interface HeaderProps {
  activeTabTitle: string;
  onToggleMobileSidebar: () => void;
  onLogout: () => void;
  user: {
    name: string | null;
    email: string;
    workspacePlan: string;
  } | null;
}

export function Header({
  activeTabTitle,
  onToggleMobileSidebar,
  onLogout,
  user,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 h-16 w-full bg-[#0B0E17]/95 backdrop-blur-md border-b border-white/[0.07] px-4 sm:px-6 flex items-center justify-between gap-4">
      {/* Lado Esquerdo: Botão mobile de alternar sidebar + Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onToggleMobileSidebar}
          className="lg:hidden p-2 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          title="Alternar menu lateral"
          aria-label="Alternar menu lateral"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-xs font-medium text-slate-400 min-w-0">
          <span className="text-slate-400">Linkzivo</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-white font-semibold truncate">{activeTabTitle}</span>
        </div>
      </div>

      {/* Lado Direito: Status operacional + Notificações + Ação Sair da Conta (Logout Funcional) */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Status operacional discreto */}
        <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#121622] border border-white/[0.07] text-xs">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
          </span>
          <span className="text-slate-300 font-medium text-[11px]">Sistemas operacionais</span>
        </div>

        {/* Notificações */}
        <button
          onClick={() => alert("Central de Notificações: Redirecionamentos e telemetria operando com 100% de integridade.")}
          className="relative p-2 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          title="Notificações do sistema"
          aria-label="Notificações do sistema"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-purple-500" />
        </button>

        <div className="h-4 w-px bg-white/[0.08] hidden sm:block" />

        {/* Ação de Sair da Conta na Barra Superior */}
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-slate-300 hover:text-rose-300 bg-[#121622] hover:bg-rose-500/10 border border-white/[0.08] hover:border-rose-500/30 transition-all cursor-pointer"
          title="Encerrar sessão"
          aria-label="Encerrar sessão"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">Sair</span>
        </button>
      </div>
    </header>
  );
}

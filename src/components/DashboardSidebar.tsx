"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Link2,
  PlusCircle,
  QrCode,
  BarChart3,
  Globe,
  Settings,
  ChevronDown,
  MoreVertical,
  LogOut,
  Layers,
  ShoppingBag,
  ExternalLink,
} from "lucide-react";

interface SidebarProps {
  activeTab: "overview" | "links" | "create" | "campaigns" | "products" | "analytics";
  onTabChange: (tab: "overview" | "links" | "create" | "campaigns" | "products" | "analytics") => void;
  linksCount?: number;
  campaignsCount?: number;
  productsCount?: number;
  user?: {
    name?: string | null;
    email: string;
    workspacePlan?: string;
  } | null;
  onLogout?: () => void;
}

export function DashboardSidebar({
  activeTab,
  onTabChange,
  linksCount = 0,
  campaignsCount = 0,
  productsCount = 0,
  user,
  onLogout,
}: SidebarProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const displayName = user?.name || "Lucas Andrade";
  const displayEmail = user?.email || "lucas@linkzivo.io";
  const userInitials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  return (
    <aside className="w-64 bg-[#0E1118] border-r border-[#1F2432] flex flex-col justify-between shrink-0 min-h-screen text-slate-300 select-none">
      {/* Topo da Sidebar */}
      <div>
        {/* Logo & Badge PRO */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-[#1F2432]">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#8B5CF6] to-[#7C3AED] flex items-center justify-center text-white shadow-md shadow-purple-500/20">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M10.59 13.41c.41.39.41 1.03 0 1.42-.39.39-1.03.39-1.42 0a5.003 5.003 0 0 1 0-7.07l3.54-3.54a5.003 5.003 0 0 1 7.07 0 5.003 5.003 0 0 1 0 7.07l-1.49 1.49c.01-.82-.12-1.64-.4-2.42l.47-.48a2.982 2.982 0 0 0 0-4.24 2.982 2.982 0 0 0-4.24 0l-3.53 3.53a2.982 2.982 0 0 0 0 4.24zm2.82-2.82c-.41-.39-.41-1.03 0-1.42.39-.39 1.03-.39 1.42 0a5.003 5.003 0 0 1 0 7.07l-3.54 3.54a5.003 5.003 0 0 1-7.07 0 5.003 5.003 0 0 1 0-7.07l1.49-1.49c-.01.82.12 1.64.4 2.43l-.47.47a2.982 2.982 0 0 0 0 4.24 2.982 2.982 0 0 0 4.24 0l3.53-3.53a2.982 2.982 0 0 0 0-4.24z" />
              </svg>
            </div>
            <span className="font-bold text-white tracking-wider text-base font-sans">
              LINKZIVO
            </span>
          </Link>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-[#8B5CF6]/30 to-[#7C3AED]/30 text-[#C4B5FD] border border-[#8B5CF6]/40 uppercase tracking-wide">
            PRO
          </span>
        </div>

        {/* Workspace Switcher */}
        <div className="p-3">
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#151924] border border-[#1F2432] hover:border-slate-700 transition-colors cursor-pointer">
            <div className="flex items-center gap-2.5 truncate">
              <div className="w-8 h-8 rounded-lg bg-[#1E2333] border border-[#2B3247] flex items-center justify-center text-slate-300 shrink-0">
                <Layers className="w-4 h-4 text-[#8B5CF6]" />
              </div>
              <div className="truncate text-left">
                <div className="text-xs font-semibold text-white truncate">
                  Workspace Principal
                </div>
                <div className="text-[10px] text-slate-400 font-mono truncate">
                  Pro Plan • 12/20 seats
                </div>
              </div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </div>
        </div>

        {/* Lista de Navegação */}
        <nav className="px-3 pt-2 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider font-mono">
            Navegação
          </div>

          {/* Visão Geral */}
          <button
            onClick={() => onTabChange("overview")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
              activeTab === "overview"
                ? "bg-[#8B5CF6] text-white shadow-lg shadow-purple-500/25 font-semibold"
                : "text-slate-400 hover:text-white hover:bg-[#151924]"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <LayoutDashboard className="w-4 h-4" />
              <span>Visão Geral</span>
            </div>
          </button>

          {/* Meus Links */}
          <button
            onClick={() => onTabChange("links")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
              activeTab === "links"
                ? "bg-[#8B5CF6] text-white shadow-lg shadow-purple-500/25 font-semibold"
                : "text-slate-400 hover:text-white hover:bg-[#151924]"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Link2 className="w-4 h-4" />
              <span>Meus Links</span>
            </div>
            {linksCount > 0 && (
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                  activeTab === "links"
                    ? "bg-white/20 text-white"
                    : "bg-[#1F2432] text-slate-300"
                }`}
              >
                {linksCount > 999 ? `${(linksCount / 1000).toFixed(1)}k` : linksCount}
              </span>
            )}
          </button>

          {/* Criar Link */}
          <button
            onClick={() => onTabChange("create")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
              activeTab === "create"
                ? "bg-[#8B5CF6] text-white shadow-lg shadow-purple-500/25 font-semibold"
                : "text-slate-400 hover:text-white hover:bg-[#151924]"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <PlusCircle className="w-4 h-4" />
              <span>Criar Link</span>
            </div>
          </button>

          {/* Campanhas */}
          <button
            onClick={() => onTabChange("campaigns")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
              activeTab === "campaigns"
                ? "bg-[#8B5CF6] text-white shadow-lg shadow-purple-500/25 font-semibold"
                : "text-slate-400 hover:text-white hover:bg-[#151924]"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Layers className="w-4 h-4" />
              <span>Campanhas</span>
            </div>
            {campaignsCount > 0 && (
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                  activeTab === "campaigns"
                    ? "bg-white/20 text-white"
                    : "bg-[#1F2432] text-slate-300"
                }`}
              >
                {campaignsCount}
              </span>
            )}
          </button>

          {/* Produtos & Ofertas */}
          <button
            onClick={() => onTabChange("products")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
              activeTab === "products"
                ? "bg-[#8B5CF6] text-white shadow-lg shadow-purple-500/25 font-semibold"
                : "text-slate-400 hover:text-white hover:bg-[#151924]"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <ShoppingBag className="w-4 h-4" />
              <span>Produtos &amp; Ofertas</span>
            </div>
            {productsCount > 0 && (
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                  activeTab === "products"
                    ? "bg-white/20 text-white"
                    : "bg-[#1F2432] text-slate-300"
                }`}
              >
                {productsCount}
              </span>
            )}
          </button>

          {/* Estatísticas & Analytics */}
          <button
            onClick={() => onTabChange("analytics")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
              activeTab === "analytics"
                ? "bg-[#8B5CF6] text-white shadow-lg shadow-purple-500/25 font-semibold"
                : "text-slate-400 hover:text-white hover:bg-[#151924]"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <BarChart3 className="w-4 h-4" />
              <span>Estatísticas &amp; Analytics</span>
            </div>
          </button>

          {/* Domínios Customizados */}
          <div className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-400 cursor-not-allowed">
            <div className="flex items-center gap-2.5">
              <Globe className="w-4 h-4" />
              <span>Domínios Customizados</span>
            </div>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400">
              Em breve
            </span>
          </div>

          {/* Configurações */}
          <div className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-400 cursor-not-allowed">
            <div className="flex items-center gap-2.5">
              <Settings className="w-4 h-4" />
              <span>Configurações</span>
            </div>
          </div>
        </nav>
      </div>

      {/* Rodapé da Sidebar - Perfil do Usuário */}
      <div className="p-3 border-t border-[#1F2432] relative">
        {userMenuOpen && (
          <div className="absolute bottom-16 left-3 right-3 bg-[#151924] border border-[#1F2432] rounded-xl shadow-xl p-2 z-50">
            <div className="px-2 py-1.5 text-xs text-slate-400 font-mono border-b border-[#1F2432] mb-1">
              {displayEmail}
            </div>
            <button
              onClick={() => {
                setUserMenuOpen(false);
                if (onLogout) onLogout();
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair da conta</span>
            </button>
          </div>
        )}

        <div
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          className="flex items-center justify-between p-2 rounded-xl bg-[#151924]/60 hover:bg-[#151924] border border-[#1F2432] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5 truncate">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#8B5CF6] to-[#06B6D4] flex items-center justify-center text-white text-xs font-bold shrink-0">
                {userInitials}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#10B981] border-2 border-[#0E1118]" />
            </div>
            <div className="truncate text-left">
              <div className="text-xs font-semibold text-white truncate">
                {displayName}
              </div>
              <div className="text-[10px] text-slate-400 font-mono truncate">
                {displayEmail}
              </div>
            </div>
          </div>
          <MoreVertical className="w-4 h-4 text-slate-400 shrink-0" />
        </div>
      </div>
    </aside>
  );
}

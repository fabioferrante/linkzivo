"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  LayoutGrid,
  Link2,
  Layers,
  ShoppingBag,
  BarChart3,
  DollarSign,
  LogOut,
  ChevronRight,
  ChevronLeft,
  MoreVertical,
  Radio,
} from "lucide-react";

export type DashboardTab = "overview" | "links" | "campaigns" | "products" | "channels" | "analytics" | "conversions";

interface SidebarProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  linkCount: number;
  user: {
    id: string;
    email: string;
    name: string | null;
    workspacePlan: string;
  } | null;
  onLogout: () => void;
  isMobileExpanded: boolean;
  onToggleMobileExpanded: () => void;
}

export function Sidebar({
  activeTab,
  onTabChange,
  linkCount,
  user,
  onLogout,
  isMobileExpanded,
  onToggleMobileExpanded,
}: SidebarProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const formattedLinkCount =
    linkCount >= 1000
      ? `${(linkCount / 1000).toFixed(1).replace(".0", "")}k`
      : `${linkCount}`;

  // Lista de navegação estrita conforme diretrizes: sem "Criar Link" solto, sem seções redundantes
  const navItems = [
    {
      id: "overview" as const,
      label: "Visão Geral",
      icon: LayoutGrid,
      badge: null,
    },
    {
      id: "links" as const,
      label: "Meus Links",
      icon: Link2,
      badge: formattedLinkCount,
    },
    {
      id: "campaigns" as const,
      label: "Campanhas",
      icon: Layers,
      badge: null,
    },
    {
      id: "products" as const,
      label: "Produtos & Ofertas",
      icon: ShoppingBag,
      badge: null,
    },
    {
      id: "channels" as const,
      label: "Canais",
      icon: Radio,
      badge: null,
    },
    {
      id: "analytics" as const,
      label: "Estatísticas & Analytics",
      icon: BarChart3,
      badge: null,
    },
    {
      id: "conversions" as const,
      label: "Conversões",
      icon: DollarSign,
      badge: null,
    },
  ];

  return (
    <>
      {/* Backdrop transparente ou sutil quando expandido em mobile para permitir toque de fechamento */}
      {isMobileExpanded && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-xs z-30 lg:hidden"
          onClick={onToggleMobileExpanded}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 h-screen bg-[#0D1019] border-r border-white/[0.07] flex flex-col justify-between transition-all duration-200 ease-in-out ${
          isMobileExpanded
            ? "w-64"
            : "w-16 lg:w-64"
        }`}
        aria-label="Menu Lateral"
      >
        {/* Topo da Sidebar: Logo LINKZIVO + Badge do Plano (Sem múltiplos workspaces) */}
        <div className="h-16 px-3 lg:px-4 flex items-center justify-between border-b border-white/[0.07] shrink-0">
          <Link
            href="/"
            className="flex items-center gap-2 min-w-0"
            title="Linkzivo Home"
          >
            {/* Modo Expandido (ou Desktop) */}
            <div className={`items-center gap-2 ${isMobileExpanded ? "flex" : "hidden lg:flex"}`}>
              <div className="relative h-7 w-28 shrink-0">
                <Image
                  src="/brand/linkzivo.png"
                  alt="LINKZIVO"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
              <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-[#A78BFA] text-[10px] font-bold tracking-wider uppercase border border-purple-500/30">
                {user?.workspacePlan && ["FREE", "CREATOR", "PRO", "AGENCY"].includes(user.workspacePlan.toUpperCase())
                  ? user.workspacePlan.toUpperCase()
                  : "FREE"}
              </span>
            </div>

            {/* Modo Recolhido Mobile: ícone compacto */}
            <div className={`w-10 h-10 rounded-md bg-purple-600/20 border border-purple-500/30 flex items-center justify-center font-bold text-sm text-[#A78BFA] mx-auto ${isMobileExpanded ? "hidden" : "flex lg:hidden"}`}>
              LZ
            </div>
          </Link>

          {/* Botão de Toggle Expandir / Recolher em Mobile */}
          <button
            onClick={onToggleMobileExpanded}
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors lg:hidden cursor-pointer"
            title={isMobileExpanded ? "Recolher menu lateral" : "Expandir menu lateral"}
            aria-label={isMobileExpanded ? "Recolher menu lateral" : "Expandir menu lateral"}
          >
            {isMobileExpanded ? (
              <ChevronLeft className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Área Central: Navegação Rolável */}
        <div className="flex-1 overflow-y-auto px-2 lg:px-3 py-4 space-y-1">
          <div className={`px-2 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 font-mono ${isMobileExpanded ? "block" : "hidden lg:block"}`}>
            Menu
          </div>
          <nav className="space-y-1" role="navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isItemActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onTabChange(item.id);
                    if (isMobileExpanded) {
                      onToggleMobileExpanded();
                    }
                  }}
                  title={item.label}
                  aria-label={item.label}
                  className={`w-full flex items-center rounded-md text-xs font-medium transition-all cursor-pointer group ${
                    isMobileExpanded
                      ? "px-3 py-2.5 justify-between"
                      : "px-2 py-2.5 justify-center lg:px-3 lg:justify-between"
                  } ${
                    isItemActive
                      ? "bg-[#1B1F30] text-purple-300 border border-purple-500/30 shadow-inner"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isItemActive
                          ? "text-[#A78BFA]"
                          : "text-slate-400 group-hover:text-slate-300"
                      }`}
                    />
                    <span
                      className={`truncate ${
                        isMobileExpanded ? "inline" : "hidden lg:inline"
                      }`}
                    >
                      {item.label}
                    </span>
                  </div>

                  {item.badge && (
                    <span
                      className={`px-1.5 py-0.5 rounded bg-[#161B2B] text-slate-400 font-mono text-[10px] border border-white/[0.06] group-hover:text-slate-200 ${
                        isMobileExpanded ? "inline-block" : "hidden lg:inline-block"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Rodapé da Sidebar: Fixo no final da viewport, independente da altura do conteúdo principal */}
        <div className="shrink-0 p-2 lg:p-3 border-t border-white/[0.07] bg-[#0A0D14]">
          <div className="relative">
            {/* Card Expandido (ou Desktop) */}
            <div
              className={`items-center justify-between p-2 rounded-md bg-[#121622] border border-white/[0.06] ${
                isMobileExpanded ? "flex" : "hidden lg:flex"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-500 p-0.5 shrink-0">
                  <div className="w-full h-full rounded-full bg-[#121622] flex items-center justify-center text-xs font-bold text-white overflow-hidden">
                    {user?.name ? user.name.slice(0, 2).toUpperCase() : "LZ"}
                  </div>
                  <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-400 border border-[#0A0D14]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-white truncate">
                    {user?.name || "Minha Conta"}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate font-mono">
                    {user?.email || "usuario@linkzivo.com"}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                title="Opções da conta"
                aria-label="Opções da conta"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            </div>

            {/* Card Recolhido Mobile: Apenas o Avatar com clique para abrir menu */}
            <div
              className={`justify-center p-1 ${
                isMobileExpanded ? "hidden" : "flex lg:hidden"
              }`}
            >
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="relative w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-500 p-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-purple-400"
                title={user?.email || "Minha Conta"}
                aria-label="Opções da conta"
              >
                <div className="w-full h-full rounded-full bg-[#121622] flex items-center justify-center text-xs font-bold text-white overflow-hidden">
                  {user?.name ? user.name.slice(0, 2).toUpperCase() : "LZ"}
                </div>
                <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-400 border border-[#0A0D14]" />
              </button>
            </div>

            {/* Menu Popover de Opções e Logout */}
            {userMenuOpen && (
              <div
                className={`absolute bottom-full mb-2 p-1.5 rounded-md bg-[#161B2B] border border-white/10 shadow-2xl z-50 text-xs ${
                  isMobileExpanded ? "left-0 right-0" : "left-0 w-48 lg:right-0 lg:w-auto"
                }`}
              >
                <div className="px-3 py-2 border-b border-white/[0.06]">
                  <div className="text-slate-200 font-medium truncate">
                    {user?.name || "Conta Linkzivo"}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate font-mono">
                    {user?.email}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    onLogout();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded text-rose-400 hover:text-rose-200 hover:bg-rose-500/10 transition-colors cursor-pointer font-medium mt-1 text-left"
                >
                  <LogOut className="w-3.5 h-3.5 shrink-0" />
                  <span>Sair da conta</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

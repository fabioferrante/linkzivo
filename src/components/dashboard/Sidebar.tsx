"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  LayoutGrid,
  Link2,
  Zap,
  QrCode,
  BarChart3,
  Layers,
  ShoppingBag,
  Globe,
  Settings,
  ChevronDown,
  LogOut,
  MoreVertical,
  ShieldCheck,
  Check,
} from "lucide-react";

interface SidebarProps {
  activeTab: "overview" | "links" | "campaigns" | "products" | "analytics";
  onTabChange: (tab: "overview" | "links" | "campaigns" | "products" | "analytics") => void;
  onOpenCreateModal: () => void;
  linkCount: number;
  user: {
    id: string;
    email: string;
    name: string | null;
    workspacePlan: string;
  } | null;
  onLogout: () => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({
  activeTab,
  onTabChange,
  onOpenCreateModal,
  linkCount,
  user,
  onLogout,
  isOpenMobile,
  onCloseMobile,
}: SidebarProps) {
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const formattedLinkCount = linkCount >= 1000 
    ? `${(linkCount / 1000).toFixed(1).replace(".0", "")}k` 
    : `${linkCount}`;

  const navItems = [
    {
      id: "overview" as const,
      label: "Visão Geral",
      icon: LayoutGrid,
      badge: null,
      isAction: false,
    },
    {
      id: "links" as const,
      label: "Meus Links",
      icon: Link2,
      badge: formattedLinkCount,
      isAction: false,
    },
    {
      id: "create" as const,
      label: "Criar Link",
      icon: Zap,
      badge: null,
      isAction: true,
      action: onOpenCreateModal,
      highlight: true,
    },
    {
      id: "campaigns" as const,
      label: "Campanhas",
      icon: Layers,
      badge: null,
      isAction: false,
    },
    {
      id: "products" as const,
      label: "Produtos & Ofertas",
      icon: ShoppingBag,
      badge: null,
      isAction: false,
    },
    {
      id: "analytics" as const,
      label: "Estatísticas & Analytics",
      icon: BarChart3,
      badge: null,
      isAction: false,
    },
  ];

  const secondaryNavItems = [
    {
      label: "Domínios Customizados",
      icon: Globe,
      onClick: () => {
        alert("Domínios Customizados: Módulo disponível para contas Pro/Enterprise. Seu domínio padrão atual é: " + (typeof window !== "undefined" ? window.location.host : "linkzivo.com"));
      },
    },
    {
      label: "Configurações",
      icon: Settings,
      onClick: () => {
        alert("Configurações do Workspace: Plano atual " + (user?.workspacePlan || "PRO") + ". Para gerenciar assinaturas ou equipe, consulte seu administrador.");
      },
    },
  ];

  return (
    <>
      {/* Backdrop para mobile */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-[#0D1019] border-r border-white/[0.07] flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Topo da Sidebar: Logo LINKZIVO + Badge PRO */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-white/[0.07]">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="relative h-7 w-28">
              <Image
                src="/brand/linkzivo.png"
                alt="LINKZIVO"
                fill
                className="object-contain"
                priority
              />
            </div>
            <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-[#A78BFA] text-[10px] font-bold tracking-wider uppercase border border-purple-500/30">
              PRO
            </span>
          </Link>
        </div>

        {/* Seletor de Workspace */}
        <div className="p-3">
          <div className="relative">
            <button
              onClick={() => setWorkspaceMenuOpen(!workspaceMenuOpen)}
              className="w-full flex items-center justify-between p-2.5 rounded-xl bg-[#131724] border border-white/[0.06] hover:border-purple-500/30 transition-all text-left group cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0 text-[#A78BFA]">
                  <Layers className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-white truncate group-hover:text-purple-300 transition-colors">
                    Workspace Principal
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {user?.workspacePlan || "PRO"} Plan • 12/20 seats
                  </div>
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-transform shrink-0" />
            </button>

            {workspaceMenuOpen && (
              <div className="absolute top-full left-0 right-0 mt-1.5 p-1 rounded-xl bg-[#161B2B] border border-white/10 shadow-2xl z-50 text-xs">
                <div className="px-3 py-2 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Workspaces Ativos
                </div>
                <button
                  onClick={() => setWorkspaceMenuOpen(false)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-purple-500/15 text-purple-200 font-medium cursor-pointer"
                >
                  <span>Workspace Principal</span>
                  <Check className="w-3.5 h-3.5 text-purple-400" />
                </button>
                <div className="my-1 border-t border-white/[0.06]" />
                <button
                  onClick={() => {
                    setWorkspaceMenuOpen(false);
                    alert("Criação de múltiplos workspaces disponível no plano Enterprise.");
                  }}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer text-[11px]"
                >
                  + Adicionar novo Workspace
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Seção NAVEGAÇÃO Principal */}
        <div className="flex-1 px-3 py-2 overflow-y-auto space-y-6">
          <div>
            <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
              Navegação
            </div>
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isItemActive = !item.isAction && activeTab === item.id;

                if (item.isAction) {
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        item.action?.();
                        onCloseMobile?.();
                      }}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium text-xs shadow-md shadow-purple-600/20 hover:from-purple-500 hover:to-indigo-500 transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="w-4 h-4 text-purple-200" />
                        <span>{item.label}</span>
                      </div>
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    </button>
                  );
                }

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (!item.isAction) {
                        onTabChange(item.id as "overview" | "links" | "campaigns" | "products" | "analytics");
                      }
                      onCloseMobile?.();
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer group ${
                      isItemActive
                        ? "bg-[#1B1F30] text-purple-300 border border-purple-500/30 shadow-inner"
                        : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon
                        className={`w-4 h-4 transition-colors ${
                          isItemActive
                            ? "text-[#A78BFA]"
                            : "text-slate-400 group-hover:text-slate-300"
                        }`}
                      />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="px-2 py-0.5 rounded-md bg-[#161B2B] text-slate-400 font-mono text-[10px] border border-white/[0.06] group-hover:text-slate-200">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div>
            <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
              Sistema & Recursos
            </div>
            <nav className="space-y-1">
              {secondaryNavItems.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <button
                    key={idx}
                    onClick={item.onClick}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-all cursor-pointer group"
                  >
                    <Icon className="w-4 h-4 text-slate-400 group-hover:text-slate-300" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Rodapé da Sidebar: Perfil do Usuário com Logout */}
        <div className="p-3 border-t border-white/[0.07] bg-[#0A0D14]">
          <div className="relative">
            <div className="flex items-center justify-between p-2 rounded-xl bg-[#121622] border border-white/[0.06]">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-500 p-0.5 shrink-0">
                  <div className="w-full h-full rounded-full bg-[#121622] flex items-center justify-center text-xs font-bold text-white overflow-hidden">
                    {user?.name ? user.name.slice(0, 2).toUpperCase() : "LZ"}
                  </div>
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#0A0D14]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-white truncate">
                    {user?.name || "Lucas Andrade"}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate font-mono">
                    {user?.email || "lucas@linkzivo.io"}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                title="Opções da conta"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            </div>

            {userMenuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-2 p-1 rounded-xl bg-[#161B2B] border border-white/10 shadow-2xl z-50 text-xs">
                <div className="px-3 py-2 border-b border-white/[0.06]">
                  <div className="text-slate-300 font-medium truncate">{user?.name || "Conta Linkzivo"}</div>
                  <div className="text-[10px] text-slate-400 truncate font-mono">{user?.email}</div>
                </div>
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    onLogout();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-rose-400 hover:text-rose-200 hover:bg-rose-500/10 transition-colors cursor-pointer font-medium mt-1"
                >
                  <LogOut className="w-4 h-4" />
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

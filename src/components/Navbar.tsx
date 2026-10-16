"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Link2, BarChart3, Layers, Sparkles, UserCheck, LogOut } from "lucide-react";

interface NavbarUser {
  name?: string | null;
  email: string;
  workspacePlan: string;
}

interface NavbarProps {
  user?: NavbarUser | null;
  onOpenAuth?: () => void;
  onLogout?: () => void;
  onNavigateTab?: (tab: "overview" | "campaigns" | "analytics") => void;
}

export function Navbar({ user: propUser, onOpenAuth, onLogout, onNavigateTab }: NavbarProps) {
  // Estado local para garantir sincronia imediata caso a prop ainda não tenha resolvido
  const [currentUser, setCurrentUser] = useState<NavbarUser | null | undefined>(propUser);

  useEffect(() => {
    setCurrentUser(propUser);
  }, [propUser]);

  // Sempre verifica a sessão no /api/auth com no-store na montagem ou quando a prop não estiver definida
  useEffect(() => {
    let isMounted = true;
    fetch("/api/auth", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          if (data.authenticated && data.user) {
            setCurrentUser(data.user);
          } else if (propUser === undefined || propUser === null) {
            setCurrentUser(null);
          }
        }
      })
      .catch(() => {
        if (isMounted && !propUser) setCurrentUser(null);
      });
    return () => {
      isMounted = false;
    };
  }, [propUser]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      setCurrentUser(null);
      if (onLogout) {
        onLogout();
      }
    } catch (e) {
      console.error(e);
    } finally {
      window.location.href = "/";
    }
  };

  const user = currentUser ?? propUser;

  // Destinos condicionais: abas do dashboard para logados, ou URL de planos para conversão de visitantes
  const plansTarget = "https://linkzivo-production.up.railway.app/#planos";
  const campaignsHref = user ? "/dashboard?tab=campaigns" : plansTarget;
  const analyticsHref = user ? "/dashboard?tab=analytics" : plansTarget;

  const handleTabClick = (e: React.MouseEvent, tab: "overview" | "campaigns" | "analytics") => {
    if (user && onNavigateTab) {
      e.preventDefault();
      onNavigateTab(tab);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-800/80 bg-[#0B0F19]/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logotipo Oficial */}
        <div className="flex items-center gap-4 sm:gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="relative h-8 w-36 sm:w-40">
              <Image
                src="/brand/linkzivo.png"
                alt="Linkzivo"
                fill
                className="object-contain"
                priority
              />
            </div>
          </Link>

          {/* Badge de Status do Sistema com Animação de Pulso Intermitente */}
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-xs text-slate-400 shadow-sm">
            <span className="relative flex h-2.5 w-2.5 items-center justify-center">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse" />
            </span>
            <span className="text-slate-300 font-medium">SaaS Operacional</span>
            <span className="text-slate-600 hidden md:inline">•</span>
            <span className="text-emerald-400 font-mono text-[11px] hidden md:inline">&lt; 18ms</span>
          </div>
        </div>

        {/* Navegação Principal */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
          <Link
            href="/#encurtador"
            className="flex items-center gap-1.5 hover:text-white transition-colors"
          >
            <Link2 className="w-4 h-4 text-[#4267E9]" />
            <span>Encurtador</span>
          </Link>
          <Link
            href={campaignsHref}
            onClick={(e) => handleTabClick(e, "campaigns")}
            title={
              user
                ? "Ir para aba de Campanhas no Painel"
                : "Contrate um plano para gerenciar campanhas e canais"
            }
            className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer"
          >
            <Layers className="w-4 h-4 text-emerald-400" />
            <span>Campanhas</span>
          </Link>
          <Link
            href={analyticsHref}
            onClick={(e) => handleTabClick(e, "analytics")}
            title={
              user
                ? "Ir para aba de Analytics Detalhado no Painel"
                : "Contrate um plano para desbloquear telemetria e Analytics em tempo real"
            }
            className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer"
          >
            <BarChart3 className="w-4 h-4 text-sky-400" />
            <span>Analytics</span>
          </Link>
          <Link
            href="/#planos"
            className="flex items-center gap-1.5 hover:text-white transition-colors"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Planos</span>
          </Link>
        </nav>

        {/* Ações */}
        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard"
                onClick={(e) => handleTabClick(e, "overview")}
                className="flex items-center gap-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-white text-xs font-medium px-3.5 py-2 rounded-lg transition-colors cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 indicator shrink-0 animate-pulse" />
                <span>Painel</span>
                <span className="px-2 py-0.5 rounded bg-[#4267E9]/20 text-[#4267E9] font-mono text-[11px] font-semibold">
                  {user.workspacePlan}
                </span>
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 bg-slate-950 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 text-xs font-medium px-3 py-2 rounded-lg transition-colors cursor-pointer"
                title="Encerrar sessão"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sair</span>
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              id="btn-entrar-navbar"
              className="inline-flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-medium px-4 py-2 rounded-lg shadow-md shadow-purple-600/20 transition-all cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Entrar / Criar Conta</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

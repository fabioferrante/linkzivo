"use client";

import Link from "next/link";
import Image from "next/image";
import { Link2, BarChart3, Layers, Sparkles, UserCheck, LogOut } from "lucide-react";

interface NavbarProps {
  user?: { name?: string | null; email: string; workspacePlan: string } | null;
  onOpenAuth?: () => void;
  onLogout?: () => void;
}

export function Navbar({ user, onOpenAuth, onLogout }: NavbarProps) {
  const handleLogout = async () => {
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      if (onLogout) {
        onLogout();
      }
    } catch (e) {
      console.error(e);
    } finally {
      window.location.href = "/";
    }
  };
  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-800/80 bg-[#0B0F19]/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logotipo Oficial */}
        <div className="flex items-center gap-6">
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

          {/* Badge de Status do Sistema */}
          <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-xs text-slate-400">
            <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="text-slate-300 font-medium">SaaS Operacional</span>
            <span className="text-slate-600">•</span>
            <span className="text-emerald-400 font-mono text-[11px]">&lt; 18ms</span>
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
            href="/dashboard"
            className="flex items-center gap-1.5 hover:text-white transition-colors"
          >
            <Layers className="w-4 h-4 text-emerald-400" />
            <span>Campanhas</span>
          </Link>
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 hover:text-white transition-colors"
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
                className="flex items-center gap-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-white text-xs font-medium px-3.5 py-2 rounded-lg transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 indicator shrink-0" />
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
              className="inline-flex items-center gap-1.5 bg-[#4267E9] hover:bg-[#3556D4] text-white text-xs font-medium px-4 py-2 rounded-lg shadow-sm transition-colors cursor-pointer"
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

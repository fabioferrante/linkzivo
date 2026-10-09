"use client";

import { useState } from "react";
import Image from "next/image";
import { Lock, Mail, User, AlertCircle, X, CheckCircle2, Zap } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: isRegister ? "register" : "login",
          name: isRegister ? name : undefined,
          email,
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Falha na autenticação.");
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#111625] border border-slate-800 rounded-xl p-6 sm:p-8 max-w-md w-full shadow-xl relative animate-fade-in-up">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1.5 rounded-lg bg-slate-900 border border-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Cabeçalho */}
        <div className="text-center mb-6">
          <div className="relative h-8 w-36 mx-auto mb-3">
            <Image
              src="/brand/linkzivo.png"
              alt="Linkzivo"
              fill
              className="object-contain"
            />
          </div>
          <h2 className="text-lg font-bold text-white">
            {isRegister ? "Criar Conta de Afiliado" : "Acessar Painel"}
          </h2>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            {isRegister
              ? "Gerencie e rastreie suas campanhas com latência sub-18ms"
              : "Entre para visualizar seus links, métricas e comissões"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Nome Completo
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-2.5 text-slate-500 pointer-events-none">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome ou marca"
                  className="w-full pl-8 pr-3 py-2.5 bg-slate-950 border border-slate-800 focus:border-[#4267E9] rounded-lg text-xs text-white placeholder-slate-600 outline-none transition-colors"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              E-mail
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-2.5 text-slate-500 pointer-events-none">
                <Mail className="w-4 h-4" />
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seuemail@exemplo.com"
                className="w-full pl-8 pr-3 py-2.5 bg-slate-950 border border-slate-800 focus:border-[#4267E9] rounded-lg text-xs text-white placeholder-slate-600 outline-none transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Senha
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-2.5 text-slate-500 pointer-events-none">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo de 6 caracteres"
                className="w-full pl-8 pr-3 py-2.5 bg-slate-950 border border-slate-800 focus:border-[#4267E9] rounded-lg text-xs text-white placeholder-slate-600 outline-none transition-colors"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-[#4267E9] hover:bg-[#3556D4] text-white font-medium rounded-lg text-xs shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : isRegister ? (
              "Cadastrar e Começar"
            ) : (
              "Entrar na Plataforma"
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-800 text-center">
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setError(null);
            }}
            className="text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            {isRegister ? (
              <>
                Já possui conta? <span className="text-[#4267E9] font-medium">Faça login</span>
              </>
            ) : (
              <>
                Novo no Linkzivo?{" "}
                <span className="text-[#4267E9] font-medium">Cadastre-se grátis</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

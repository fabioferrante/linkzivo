import Link from "next/link";
import Image from "next/image";
import { PauseCircle, Home } from "lucide-react";

export default function PausedLinkPage() {
  return (
    <div className="min-h-screen bg-[#0B0F19] flex items-center justify-center p-4">
      <div className="bg-[#111625] border border-slate-800 rounded-xl p-8 max-w-md w-full text-center shadow-lg">
        <div className="relative h-8 w-36 mx-auto mb-6">
          <Image src="/brand/linkzivo.png" alt="Linkzivo" fill className="object-contain" priority />
        </div>

        <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto mb-4 border border-amber-500/20">
          <PauseCircle className="w-6 h-6" />
        </div>

        <h1 className="text-xl font-bold text-white mb-2">Smart Link Temporariamente Pausado</h1>
        <p className="text-xs text-slate-400 leading-relaxed mb-6">
          Este link foi pausado temporariamente pelo anunciante ou gestor da campanha. O redirecionamento será restabelecido assim que o link for reativado.
        </p>

        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#4267E9] hover:bg-[#3556D4] text-white text-xs font-medium rounded-lg transition-colors shadow-sm cursor-pointer"
        >
          <Home className="w-4 h-4" />
          <span>Voltar à Página Inicial</span>
        </Link>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Link2,
  Copy,
  Check,
  QrCode as QrIcon,
  SlidersHorizontal,
  ArrowRight,
  ExternalLink,
  Edit3,
  BarChart2,
  Download,
  AlertCircle,
  Tag,
  Target,
  Sparkles,
  Compass,
} from "lucide-react";

interface CreatedLinkData {
  id: string;
  slug: string;
  destinationUrl: string;
  shortUrl: string;
  qrDataUrl: string;
  title: string | null;
}

export function ShortenerForm({
  onLinkCreated,
  user: propUser,
}: {
  onLinkCreated?: () => void;
  user?: { email?: string; id?: string; workspacePlan?: string } | null;
}) {
  const [currentUser, setCurrentUser] = useState(propUser);

  useEffect(() => {
    setCurrentUser(propUser);
  }, [propUser]);

  useEffect(() => {
    if (propUser === undefined) {
      let isMounted = true;
      fetch("/api/auth", { cache: "no-store" })
        .then((res) => res.json())
        .then((data) => {
          if (isMounted) {
            setCurrentUser(data.authenticated && data.user ? data.user : null);
          }
        })
        .catch(() => {
          if (isMounted) setCurrentUser(null);
        });
      return () => {
        isMounted = false;
      };
    }
  }, [propUser]);

  const [url, setUrl] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Parâmetros de Campanha / UTM
  const [utmSource, setUtmSource] = useState("");
  const [utmMedium, setUtmMedium] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [utmContent, setUtmContent] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<CreatedLinkData | null>(null);
  const [copied, setCopied] = useState(false);

  // Modais
  const [showQrModal, setShowQrModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [newDestination, setNewDestination] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editSuccess, setEditSuccess] = useState(false);

  const applyChannelPreset = (source: string, medium: string) => {
    setUtmSource(source);
    setUtmMedium(medium);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setCopied(false);

    try {
      const res = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          customSlug: customSlug.trim() || undefined,
          utmSource: utmSource.trim() || undefined,
          utmMedium: utmMedium.trim() || undefined,
          utmCampaign: utmCampaign.trim() || undefined,
          utmContent: utmContent.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Falha ao gerar link curto.");
      }

      setCreatedLink({
        id: data.link.id,
        slug: data.link.slug,
        destinationUrl: data.link.destinationUrl,
        shortUrl: data.shortUrl,
        qrDataUrl: data.qrDataUrl,
        title: data.link.title,
      });

      setNewDestination(data.link.destinationUrl);
      if (onLinkCreated) onLinkCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUpdateDestination = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createdLink || !newDestination.trim()) return;

    setEditLoading(true);
    setError(null);
    setEditSuccess(false);

    try {
      const res = await fetch(`/api/links/${createdLink.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinationUrl: newDestination.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Falha ao atualizar o destino.");
      }

      setCreatedLink((prev) =>
        prev
          ? {
              ...prev,
              destinationUrl: data.link.destinationUrl,
            }
          : null
      );
      setEditSuccess(true);
      setTimeout(() => setShowEditModal(false), 1200);
      if (onLinkCreated) onLinkCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar destino.");
    } finally {
      setEditLoading(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Card Principal: Padrão SOP (rounded-xl, border-slate-800, p-6 / p-8) */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 backdrop-blur-md shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-slate-500">
                <Link2 className="w-5 h-5 text-[#4267E9]" />
              </div>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Cole sua URL longa ou link de afiliado aqui..."
                required
                className="w-full pl-12 pr-4 py-3 bg-slate-950 border border-slate-800 focus:border-[#4267E9] focus:ring-1 focus:ring-[#4267E9] rounded-lg text-sm text-slate-100 placeholder-slate-500 outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="px-6 py-3 bg-[#4267E9] hover:bg-[#3556D4] disabled:opacity-50 text-white font-medium text-sm rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer shrink-0"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Encurtar Link</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          {/* Opções Avançadas */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs font-medium text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#4267E9]" />
              <span>
                {showAdvanced
                  ? "Ocultar opções de campanha"
                  : "Personalizar slug, parâmetros UTM e canal"}
              </span>
            </button>
            <span className="text-xs text-slate-500 hidden sm:inline">
              QR Code dinâmico incluso
            </span>
          </div>

          {/* Painel Expansível de Afiliados */}
          {showAdvanced && (
            <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-4">
              {/* Presets Rápidos de Canal */}
              <div>
                <span className="text-xs text-slate-400 block mb-2 font-medium">
                  Preenchimento rápido de canal:
                </span>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "Instagram Stories", s: "instagram", m: "stories" },
                    { label: "Instagram Bio", s: "instagram", m: "bio" },
                    { label: "TikTok", s: "tiktok", m: "social-video" },
                    { label: "WhatsApp", s: "whatsapp", m: "direct" },
                    { label: "YouTube", s: "youtube", m: "description" },
                  ].map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => applyChannelPreset(preset.s, preset.m)}
                      className="px-2.5 py-1 rounded-md bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-xs text-slate-300 transition-colors cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid de Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-950/60 p-4 rounded-lg border border-slate-800/60">
                <div>
                  <label className="block text-xs text-slate-300 mb-1 flex items-center gap-1">
                    <Tag className="w-3 h-3 text-[#4267E9]" />
                    Slug Customizado
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-xs text-slate-500 font-mono">
                      /
                    </span>
                    <input
                      type="text"
                      value={customSlug}
                      onChange={(e) => setCustomSlug(e.target.value)}
                      placeholder="minha-oferta"
                      className="w-full pl-6 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-xs text-slate-100 placeholder-slate-600 focus:border-[#4267E9] outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1 flex items-center gap-1">
                    <Target className="w-3 h-3 text-emerald-400" />
                    utm_source
                  </label>
                  <input
                    type="text"
                    value={utmSource}
                    onChange={(e) => setUtmSource(e.target.value)}
                    placeholder="instagram"
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-xs text-slate-100 placeholder-slate-600 focus:border-[#4267E9] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1 flex items-center gap-1">
                    <Compass className="w-3 h-3 text-sky-400" />
                    utm_medium
                  </label>
                  <input
                    type="text"
                    value={utmMedium}
                    onChange={(e) => setUtmMedium(e.target.value)}
                    placeholder="stories"
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-xs text-slate-100 placeholder-slate-600 focus:border-[#4267E9] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    utm_campaign
                  </label>
                  <input
                    type="text"
                    value={utmCampaign}
                    onChange={(e) => setUtmCampaign(e.target.value)}
                    placeholder="promocao-natal"
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-xs text-slate-100 placeholder-slate-600 focus:border-[#4267E9] outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </form>

        {/* Card de Resultado do Link Gerado */}
        {createdLink && (
          <div className="mt-6 pt-6 border-t border-slate-800">
            <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Link Curto Gerado com Sucesso
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Slug: /{createdLink.slug}
                </span>
              </div>

              {/* Caixa da URL */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 p-3 rounded-lg mb-3">
                <div className="font-mono text-sm sm:text-base font-semibold text-slate-100 truncate">
                  {createdLink.shortUrl}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => copyToClipboard(createdLink.shortUrl)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4267E9] hover:bg-[#3556D4] text-white text-xs font-medium rounded-md transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? "Copiado" : "Copiar"}</span>
                  </button>

                  <a
                    href={createdLink.shortUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-md border border-slate-700 transition-colors"
                    title="Testar Redirecionamento"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Destino atual */}
              <div className="text-xs text-slate-400 truncate mb-4">
                <span className="text-slate-500 font-medium">Destino atual:</span>{" "}
                <span className="text-slate-300 font-mono underline">{createdLink.destinationUrl}</span>
              </div>

              {/* Botões de Ação */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/60">
                <button
                  type="button"
                  onClick={() => copyToClipboard(createdLink.shortUrl)}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-medium rounded-lg border border-slate-800 transition-colors cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5 text-[#4267E9]" />
                  <span>Copiar</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowQrModal(true)}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-medium rounded-lg border border-slate-800 transition-colors cursor-pointer"
                >
                  <QrIcon className="w-3.5 h-3.5 text-sky-400" />
                  <span>QR Code</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setNewDestination(createdLink.destinationUrl);
                    setShowEditModal(true);
                  }}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-medium rounded-lg border border-slate-800 transition-colors cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Editar Destino</span>
                </button>

                <Link
                  href={currentUser ? "/dashboard?tab=analytics" : "/#planos"}
                  title={
                    currentUser
                      ? "Ver telemetria e conversões no Painel"
                      : "Contrate um plano para acompanhar métricas e Analytics em tempo real"
                  }
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-medium rounded-lg border border-slate-800 transition-colors cursor-pointer"
                >
                  <BarChart2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Analytics</span>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal: QR Code */}
      {showQrModal && createdLink && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 max-w-sm w-full text-center shadow-lg">
            <h3 className="text-base font-semibold text-white mb-1">QR Code Dinâmico</h3>
            <p className="text-xs text-slate-400 mb-4 font-mono">
              /{createdLink.slug}
            </p>

            <div className="bg-white p-4 rounded-lg inline-block mb-4 shadow-sm">
              <Image
                src={createdLink.qrDataUrl}
                alt={`QR Code para ${createdLink.slug}`}
                width={180}
                height={180}
                className="w-44 h-44"
              />
            </div>

            <div className="flex gap-2 mb-4">
              <a
                href={createdLink.qrDataUrl}
                download={`linkzivo-qr-${createdLink.slug}.png`}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-[#4267E9] hover:bg-[#3556D4] text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar PNG
              </a>

              <a
                href={`/api/links/${createdLink.id}/qr?format=svg`}
                download
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar SVG
              </a>
            </div>

            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-2 text-slate-400 hover:text-white text-xs font-medium cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Modal: Editar Destino */}
      {showEditModal && createdLink && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 max-w-md w-full shadow-lg">
            <h3 className="text-base font-semibold text-white mb-1">
              Editar Destino do Link
            </h3>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              O link curto <span className="text-[#4267E9] font-mono">/{createdLink.slug}</span> e o QR Code
              continuam funcionando perfeitamente. Apenas o destino será atualizado.
            </p>

            <form onSubmit={handleUpdateDestination} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nova URL de Destino
                </label>
                <input
                  type="text"
                  value={newDestination}
                  onChange={(e) => setNewDestination(e.target.value)}
                  required
                  placeholder="https://exemplo.com/nova-pagina"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-[#4267E9] rounded-lg text-xs text-slate-100 outline-none"
                />
              </div>

              {editSuccess && (
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  <span>Destino alterado com sucesso!</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editLoading || !newDestination.trim()}
                  className="flex-1 py-2 bg-[#4267E9] hover:bg-[#3556D4] text-white text-xs font-medium rounded-lg cursor-pointer"
                >
                  {editLoading ? "Salvando..." : "Salvar Destino"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

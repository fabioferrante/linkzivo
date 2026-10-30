"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Download,
  Copy,
  Check,
  Save,
  Upload,
  Trash2,
  Sparkles,
  RefreshCw,
  QrCode as QrIcon,
  Layers,
  Palette,
  Image as ImageIcon,
  AlertCircle,
} from "lucide-react";
import { QrStyle } from "@/lib/qrcode";

export interface QrModalLink {
  id: string;
  slug: string;
  title?: string | null;
  qrCode?: {
    id: string;
    style: string;
    fgColor: string;
    bgColor: string;
    logoUrl?: string | null;
    scanCount: number;
  } | null;
}

interface QrCodeModalProps {
  link: QrModalLink | null;
  domain: string;
  onClose: () => void;
  onSaved?: (updatedLink: any) => void;
}

const PRESET_PALETTES = [
  { name: "Obsidian Purple", fg: "#7C3AED", bg: "#0B0E17", label: "Roxo" },
  { name: "Neon Emerald", fg: "#10B981", bg: "#0B0E17", label: "Verde" },
  { name: "Cyber Indigo", fg: "#6366F1", bg: "#0B0E17", label: "Índigo" },
  { name: "Sunset Amber", fg: "#F59E0B", bg: "#0B0E17", label: "Âmbar" },
  { name: "Paper Dark", fg: "#151724", bg: "#FFFFFF", label: "Branco" },
  { name: "Pure Monochrome", fg: "#000000", bg: "#FFFFFF", label: "Mono" },
];

export function QrCodeModal({ link, domain, onClose, onSaved }: QrCodeModalProps) {
  if (!link) return null;

  const [style, setStyle] = useState<QrStyle>(
    (link.qrCode?.style as QrStyle) || "SQUARES"
  );
  const [fgColor, setFgColor] = useState<string>(link.qrCode?.fgColor || "#7C3AED");
  const [bgColor, setBgColor] = useState<string>(link.qrCode?.bgColor || "#0B0E17");
  const [logoUrl, setLogoUrl] = useState<string | null>(link.qrCode?.logoUrl || null);

  const [previewDataUrl, setPreviewDataUrl] = useState<string>("");
  const [loadingPreview, setLoadingPreview] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const shortUrl = `${typeof window !== "undefined" ? window.location.protocol : "https:"}//${domain}/${link.slug}`;

  // Efeito de busca do preview atualizado conforme as opções mudam (com debounce)
  useEffect(() => {
    let isMounted = true;
    setLoadingPreview(true);
    setErrorMsg(null);

    const timer = setTimeout(async () => {
      try {
        const query = new URLSearchParams({
          format: "png",
          style,
          fg: fgColor,
          bg: bgColor,
        });

        // Passa o logoUrl se houver
        if (logoUrl) {
          query.set("logoUrl", logoUrl);
        }

        const res = await fetch(`/api/links/${link.id}/qr?${query.toString()}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Erro ao renderizar QR Code.");
        }

        const data = await res.json();
        if (isMounted) {
          setPreviewDataUrl(data.dataUrl);
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMsg(err.message || "Erro na geração do QR Code.");
        }
      } finally {
        if (isMounted) {
          setLoadingPreview(false);
        }
      }
    }, 250);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [link.id, style, fgColor, bgColor, logoUrl]);

  // Upload e validação de logotipo local
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 200 * 1024) {
      setErrorMsg("O logotipo deve ter no máximo 200 KB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const validTypes = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!validTypes.includes(file.type)) {
      setErrorMsg("Formato não suportado. Utilize PNG, JPG, WebP ou SVG.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setLogoUrl(result);
      setErrorMsg(null);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Persistir configurações no banco
  const handleSaveConfig = async () => {
    setSaving(true);
    setErrorMsg(null);
    setSaveSuccess(false);

    try {
      const res = await fetch(`/api/links/${link.id}/qr`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          style,
          fgColor,
          bgColor,
          logoUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Falha ao salvar configurações.");
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);

      if (onSaved) {
        onSaved({
          ...link,
          qrCode: data.qrCode,
        });
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Erro ao salvar no servidor.");
    } finally {
      setSaving(false);
    }
  };

  // Download do arquivo SVG vetorial
  const handleDownloadSvg = () => {
    const query = new URLSearchParams({
      format: "svg",
      style,
      fg: fgColor,
      bg: bgColor,
      download: "1",
    });
    if (logoUrl) query.set("logoUrl", logoUrl);
    window.open(`/api/links/${link.id}/qr?${query.toString()}`, "_blank");
  };

  // Download do arquivo PNG de alta resolução
  const handleDownloadPng = () => {
    const query = new URLSearchParams({
      format: "png",
      style,
      fg: fgColor,
      bg: bgColor,
      download: "1",
    });
    if (logoUrl) query.set("logoUrl", logoUrl);
    window.open(`/api/links/${link.id}/qr?${query.toString()}`, "_blank");
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shortUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-2xl bg-[#0F131F] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-white/[0.08] flex items-center justify-between bg-[#0B0E17]/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <QrIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Personalização Avançada de QR Code</span>
                <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-mono border border-purple-500/30">
                  Alta Redundância (Nível H)
                </span>
              </h3>
              <p className="text-xs text-slate-400 font-mono mt-0.5 truncate max-w-md">
                {domain}/{link.slug}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensagem de Erro ou Sucesso */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {saveSuccess && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>Configurações do QR Code salvas com sucesso no banco de dados!</span>
          </div>
        )}

        {/* Conteúdo em 2 Colunas */}
        <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-6 flex-1">
          {/* Coluna Esquerda: Preview e Downloads (5 Colunas) */}
          <div className="md:col-span-5 flex flex-col items-center justify-center space-y-4">
            <div className="relative p-4 rounded-2xl bg-[#090C14] border border-white/[0.08] shadow-inner flex flex-col items-center justify-center w-full aspect-square max-w-[260px]">
              {loadingPreview ? (
                <div className="flex flex-col items-center justify-center text-slate-400 text-xs gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-purple-400" />
                  <span className="font-mono">Renderizando...</span>
                </div>
              ) : previewDataUrl ? (
                <img
                  src={previewDataUrl}
                  alt={`QR Code para ${link.slug}`}
                  className="w-full h-full object-contain rounded-lg"
                />
              ) : (
                <div className="text-xs text-slate-500 font-mono text-center">
                  Preview indisponível
                </div>
              )}
            </div>

            {/* Informações de Tracking */}
            <div className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs">
              <span className="text-slate-400">Total de Escaneamentos:</span>
              <span className="font-mono font-bold text-purple-300">
                {link.qrCode?.scanCount || 0} scans
              </span>
            </div>

            {/* Ações de Download */}
            <div className="grid grid-cols-2 gap-2 w-full pt-1">
              <button
                type="button"
                onClick={handleDownloadPng}
                className="btn-stitch-primary text-xs py-2 justify-center cursor-pointer flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Baixar PNG</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadSvg}
                className="btn-stitch-secondary text-xs py-2 justify-center cursor-pointer flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Baixar SVG</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopyLink}
              className="w-full py-1.5 px-3 rounded-lg bg-[#121622] hover:bg-white/[0.08] border border-white/[0.08] text-xs text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copied ? "Link Copiado!" : "Copiar Link Curto"}</span>
            </button>
          </div>

          {/* Coluna Direita: Controles de Estilização (7 Colunas) */}
          <div className="md:col-span-7 space-y-5">
            {/* 1. Estilo dos Módulos */}
            <div>
              <label className="text-xs font-semibold text-white flex items-center gap-1.5 uppercase tracking-wider font-mono mb-2">
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                <span>1. Formato dos Módulos</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "SQUARES", label: "Quadrado", desc: "Clássico" },
                  { id: "DOTS", label: "Pontos", desc: "Circular" },
                  { id: "ROUNDED", label: "Arredondado", desc: "Moderno" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setStyle(item.id as QrStyle)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      style === item.id
                        ? "bg-purple-600/20 border-purple-500 text-white shadow-sm"
                        : "bg-[#090C14] border-white/[0.08] text-slate-400 hover:border-white/20 hover:text-slate-200"
                    }`}
                  >
                    <span className="text-xs font-semibold">{item.label}</span>
                    <span className="text-[10px] text-slate-500 font-mono mt-0.5">
                      {item.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Cores e Paletas */}
            <div>
              <label className="text-xs font-semibold text-white flex items-center gap-1.5 uppercase tracking-wider font-mono mb-2">
                <Palette className="w-3.5 h-3.5 text-purple-400" />
                <span>2. Cores &amp; Paleta</span>
              </label>

              {/* Presets */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mb-3">
                {PRESET_PALETTES.map((preset) => {
                  const isSelected = fgColor === preset.fg && bgColor === preset.bg;
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        setFgColor(preset.fg);
                        setBgColor(preset.bg);
                      }}
                      className={`p-1.5 rounded-lg border text-center transition-all cursor-pointer flex flex-col items-center gap-1 ${
                        isSelected
                          ? "bg-white/[0.1] border-purple-400"
                          : "bg-[#090C14] border-white/[0.06] hover:border-white/20"
                      }`}
                      title={preset.name}
                    >
                      <div
                        className="w-5 h-5 rounded-md border border-white/20 shadow-xs"
                        style={{ backgroundColor: preset.fg }}
                      />
                      <span className="text-[10px] text-slate-300 font-medium">
                        {preset.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Custom Color Pickers */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2.5 rounded-xl bg-[#090C14] border border-white/[0.06] space-y-1.5">
                  <span className="text-[11px] text-slate-400 font-medium block">
                    Frente (Módulos):
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={fgColor}
                      onChange={(e) => setFgColor(e.target.value)}
                      className="w-7 h-7 rounded border border-white/20 cursor-pointer bg-transparent"
                    />
                    <input
                      type="text"
                      value={fgColor}
                      onChange={(e) => setFgColor(e.target.value)}
                      className="w-full bg-[#121622] border border-white/[0.08] rounded px-2 py-1 text-xs font-mono text-white uppercase"
                    />
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-[#090C14] border border-white/[0.06] space-y-1.5">
                  <span className="text-[11px] text-slate-400 font-medium block">
                    Fundo (Background):
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="w-7 h-7 rounded border border-white/20 cursor-pointer bg-transparent"
                    />
                    <input
                      type="text"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="w-full bg-[#121622] border border-white/[0.08] rounded px-2 py-1 text-xs font-mono text-white uppercase"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Logotipo Central */}
            <div>
              <label className="text-xs font-semibold text-white flex items-center gap-1.5 uppercase tracking-wider font-mono mb-2">
                <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
                <span>3. Logotipo Central (Opcional)</span>
              </label>

              <div className="p-3 rounded-xl bg-[#090C14] border border-white/[0.06] flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-[#121622] border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt="Logotipo QR"
                        className="w-full h-full object-contain p-1"
                      />
                    ) : (
                      <Sparkles className="w-5 h-5 text-slate-600" />
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-medium text-white block">
                      {logoUrl ? "Logotipo Aplicado" : "Sem Logotipo"}
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      PNG, JPG ou SVG (Máximo 200 KB)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs text-white font-medium transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{logoUrl ? "Trocar" : "Upload"}</span>
                  </button>

                  {logoUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors cursor-pointer"
                      title="Remover Logotipo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé do Modal */}
        <div className="p-4 bg-[#0B0E17] border-t border-white/[0.08] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="btn-stitch-secondary text-xs px-4 py-2 cursor-pointer"
          >
            Fechar
          </button>

          <button
            type="button"
            onClick={handleSaveConfig}
            disabled={saving}
            className="btn-stitch-primary text-xs font-semibold px-5 py-2 cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Salvando...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Salvar Configurações</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

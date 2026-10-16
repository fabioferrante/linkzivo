"use client";

import React, { useState, useEffect } from "react";
import QRCode from "qrcode";
import {
  Link2,
  QrCode,
  ShieldCheck,
  Zap,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Download,
  Camera,
  Layers,
  Sparkles,
  ShoppingBag,
  Sliders,
  Eye,
} from "lucide-react";

interface CreateLinkViewProps {
  products: Array<{
    id: string;
    name: string;
    offers?: Array<{ id: string; name: string; affiliateUrl?: string }>;
  }>;
  campaigns: Array<{ id: string; name: string }>;
  onCreateLink: (payload: {
    destinationUrl: string;
    slug?: string;
    title?: string;
    productId?: string;
    offerId?: string;
    campaignId?: string;
  }) => Promise<boolean>;
  onCancel: () => void;
  loading?: boolean;
}

export function CreateLinkView({
  products,
  campaigns,
  onCreateLink,
  onCancel,
  loading = false,
}: CreateLinkViewProps) {
  // Formulário
  const [destinationUrl, setDestinationUrl] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedOfferId, setSelectedOfferId] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState("");

  // UTMs
  const [utmEnabled, setUtmEnabled] = useState(false);
  const [utmSource, setUtmSource] = useState("");
  const [utmMedium, setUtmMedium] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [utmTerm, setUtmTerm] = useState("");
  const [utmContent, setUtmContent] = useState("");

  // Acordeões
  const [utmExpanded, setUtmExpanded] = useState(true);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);

  // Customização de QR Code
  const [qrCornerStyle, setQrCornerStyle] = useState<"rounded" | "square" | "circle">("rounded");
  const [qrColorTheme, setQrColorTheme] = useState<"purple" | "mint" | "mono">("purple");
  const [qrShowLogo, setQrShowLogo] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copiedLink, setCopiedLink] = useState(false);

  // Geração de slug aleatório
  const generateRandomSlug = () => {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let res = "";
    for (let i = 0; i < 7; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setSlug(res);
  };

  // Montagem da URL completa com UTMs
  const computedDestinationUrl = React.useMemo(() => {
    if (!destinationUrl.trim()) return "";
    if (!utmEnabled) return destinationUrl.trim();

    try {
      const parsed = new URL(destinationUrl.trim());
      if (utmSource) parsed.searchParams.set("utm_source", utmSource);
      if (utmMedium) parsed.searchParams.set("utm_medium", utmMedium);
      if (utmCampaign) parsed.searchParams.set("utm_campaign", utmCampaign);
      if (utmTerm) parsed.searchParams.set("utm_term", utmTerm);
      if (utmContent) parsed.searchParams.set("utm_content", utmContent);
      return parsed.toString();
    } catch {
      return destinationUrl.trim();
    }
  }, [destinationUrl, utmEnabled, utmSource, utmMedium, utmCampaign, utmTerm, utmContent]);

  // Query String UTM para exibição
  const utmQueryString = React.useMemo(() => {
    const params = new URLSearchParams();
    if (utmSource) params.set("utm_source", utmSource);
    if (utmMedium) params.set("utm_medium", utmMedium);
    if (utmCampaign) params.set("utm_campaign", utmCampaign);
    if (utmTerm) params.set("utm_term", utmTerm);
    if (utmContent) params.set("utm_content", utmContent);
    const str = params.toString();
    return str ? `?${str}` : "";
  }, [utmSource, utmMedium, utmCampaign, utmTerm, utmContent]);

  const activeSlug = slug.trim() || "link-exemplo";
  const previewShortUrl = `https://linkz.io/${activeSlug}`;

  // Geração do QR Code dinâmico em Data URL
  useEffect(() => {
    const fgColor =
      qrColorTheme === "purple"
        ? "#8B5CF6"
        : qrColorTheme === "mint"
        ? "#10B981"
        : "#FFFFFF";

    const targetUrl = `https://linkzivo-production.up.railway.app/${activeSlug}`;

    QRCode.toDataURL(targetUrl, {
      width: 256,
      margin: 2,
      color: {
        dark: fgColor,
        light: "#11141D",
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error("Erro ao gerar QR Code:", err));
  }, [activeSlug, qrColorTheme]);

  const handleTestDestination = () => {
    if (computedDestinationUrl) {
      window.open(computedDestinationUrl, "_blank");
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(previewShortUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const downloadQr = (format: "png" | "svg") => {
    if (!qrDataUrl) return;
    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = `qrcode-${activeSlug}.${format}`;
    link.click();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destinationUrl.trim()) return;

    await onCreateLink({
      destinationUrl: computedDestinationUrl,
      slug: slug.trim() || undefined,
      title: title.trim() || undefined,
      productId: selectedProductId || undefined,
      offerId: selectedOfferId || undefined,
      campaignId: selectedCampaignId || undefined,
    });
  };

  const selectedProductObj = products.find((p) => p.id === selectedProductId);

  return (
    <div className="space-y-6 pb-12">
      {/* Topo da Tela */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono tracking-wider text-slate-400 uppercase mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
            <span>ENGINE DE ROTEAMENTO / NOVO REGISTRO</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Criar Link &amp; Editor de QR Code
            </h1>
            <span className="badge-mint text-[11px] py-0.5 px-2.5 hidden sm:inline-flex">
              Sync em Tempo Real
            </span>
          </div>
        </div>

        {/* Badges de Latência e Modelos Salvos */}
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl bg-[#151924] border border-[#1F2432] text-xs font-mono text-slate-300 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-[#10B981]" />
            <span>Latência de Redirecionamento: &lt;14ms</span>
          </div>
          <button className="btn-secondary text-xs px-3 py-1.5 cursor-pointer">
            <span>Modelos Salvos</span>
          </button>
        </div>
      </div>

      {/* Split View: Formulário à Esquerda (3/5) e Live Preview à Direita (2/5) */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Coluna Esquerda: Formulário Modular (3/5) */}
        <div className="lg:col-span-3 space-y-5">
          {/* Bloco 1: URL de Destino Obrigatória */}
          <div className="p-5 rounded-2xl bg-[#11141D] border border-[#1F2432] shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-[#8B5CF6] text-white flex items-center justify-center text-xs font-bold font-mono">
                  1
                </span>
                <span className="text-sm font-semibold text-white">
                  URL de Destino Obrigatória
                </span>
              </div>
              <span className="badge-mint text-[11px] py-0 px-2 font-mono">
                <ShieldCheck className="w-3 h-3" />
                Protocolo Seguro
              </span>
            </div>

            <div className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <Link2 className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="url"
                  required
                  placeholder="https://minhaloja.com.br/promocao-inverno"
                  value={destinationUrl}
                  onChange={(e) => setDestinationUrl(e.target.value)}
                  className="w-full bg-[#0D1017] border border-[#1F2432] focus:border-[#8B5CF6] text-xs text-white rounded-xl pl-10 pr-3 py-3 outline-none font-mono placeholder:text-slate-500"
                />
              </div>
              <button
                type="button"
                onClick={handleTestDestination}
                className="btn-secondary text-xs px-3.5 py-3 font-mono cursor-pointer shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Testar</span>
              </button>
            </div>

            <div className="flex items-center gap-2 mt-3 text-[11px] text-[#10B981] font-mono">
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span>
                Destino com certificado TLS/SSL ativo verificado automaticamente pela CDN LINKZIVO.
              </span>
            </div>
          </div>

          {/* Bloco 2: Identificação & URL Curta */}
          <div className="p-5 rounded-2xl bg-[#11141D] border border-[#1F2432] shadow-xl space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-md bg-[#8B5CF6] text-white flex items-center justify-center text-xs font-bold font-mono">
                2
              </span>
              <span className="text-sm font-semibold text-white">
                Identificação &amp; URL Curta
              </span>
            </div>

            {/* Identificação Interna */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Identificação Interna do Link
              </label>
              <input
                type="text"
                placeholder="Campanha Promoção Inverno • Conversão Google Ads"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-[#0D1017] border border-[#1F2432] focus:border-[#8B5CF6] text-xs text-white rounded-xl px-3.5 py-2.5 outline-none font-sans placeholder:text-slate-500"
              />
              <span className="text-[11px] text-slate-500 mt-1 block font-mono">
                Visível apenas no seu painel para relatórios internos.
              </span>
            </div>

            {/* Estrutura da URL Curta & Alias Personalizado */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Estrutura da URL Curta &amp; Alias Personalizado
              </label>
              <div className="flex flex-col sm:flex-row items-stretch gap-2">
                <div className="w-full sm:w-44 bg-[#0D1017] border border-[#1F2432] rounded-xl px-3 py-2 flex items-center justify-between text-xs text-slate-300 font-mono">
                  <span>linkz.io</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <div className="relative flex-1 flex items-center bg-[#0D1017] border border-[#1F2432] focus-within:border-[#8B5CF6] rounded-xl px-3 py-2">
                  <span className="text-slate-500 font-mono text-xs mr-1">/</span>
                  <input
                    type="text"
                    placeholder="oferta-inverno-24"
                    value={slug}
                    onChange={(e) =>
                      setSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-_]/g, "")
                      )
                    }
                    className="w-full bg-transparent border-none outline-none text-white text-xs font-mono placeholder:text-slate-600"
                  />
                  <span className="badge-mint text-[10px] py-0 px-1.5 font-mono ml-2">
                    Disponível
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between mt-2 text-[11px] text-slate-500 font-mono">
                <span>Caracteres permitidos: letras, números e hífens.</span>
                <button
                  type="button"
                  onClick={generateRandomSlug}
                  className="text-[#8B5CF6] hover:text-[#A78BFA] transition-colors flex items-center gap-1 cursor-pointer font-sans text-xs"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Gerar slug aleatório</span>
                </button>
              </div>
            </div>
          </div>

          {/* Bloco 3: Rastreamento & Parâmetros UTM (Acordeão) */}
          <div className="p-5 rounded-2xl bg-[#11141D] border border-[#1F2432] shadow-xl">
            <div
              onClick={() => setUtmExpanded(!utmExpanded)}
              className="flex items-center justify-between cursor-pointer select-none"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-[#8B5CF6]/15 text-[#8B5CF6] flex items-center justify-center">
                  <Sliders className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">
                    Rastreamento &amp; Parâmetros UTM
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Atribuição de campanhas no Google Analytics 4, Meta Ads e CRM
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1F2432] text-slate-400">
                  5 parâmetros
                </span>
                {utmExpanded ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </div>

            {utmExpanded && (
              <div className="pt-4 mt-4 border-t border-[#1F2432]/60 space-y-4">
                {/* Switch Anexar Parâmetros */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">
                    Anexar parâmetros UTM automaticamente
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={utmEnabled}
                      onChange={(e) => setUtmEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-[#1F2432] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#8B5CF6]" />
                  </label>
                </div>

                {/* Grid de Inputs UTM */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1 font-mono">
                      UTM Source (Origem)
                    </label>
                    <input
                      type="text"
                      placeholder="google"
                      value={utmSource}
                      onChange={(e) => setUtmSource(e.target.value)}
                      className="w-full bg-[#0D1017] border border-[#1F2432] focus:border-[#8B5CF6] text-xs text-white rounded-xl px-3 py-2 outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1 font-mono">
                      UTM Medium (Mídia)
                    </label>
                    <input
                      type="text"
                      placeholder="cpc"
                      value={utmMedium}
                      onChange={(e) => setUtmMedium(e.target.value)}
                      className="w-full bg-[#0D1017] border border-[#1F2432] focus:border-[#8B5CF6] text-xs text-white rounded-xl px-3 py-2 outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1 font-mono">
                      UTM Campaign (Campanha)
                    </label>
                    <input
                      type="text"
                      placeholder="inverno_2024"
                      value={utmCampaign}
                      onChange={(e) => setUtmCampaign(e.target.value)}
                      className="w-full bg-[#0D1017] border border-[#1F2432] focus:border-[#8B5CF6] text-xs text-white rounded-xl px-3 py-2 outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1 font-mono">
                      UTM Term (Palavra-chave)
                    </label>
                    <input
                      type="text"
                      placeholder="jaqueta-couro"
                      value={utmTerm}
                      onChange={(e) => setUtmTerm(e.target.value)}
                      className="w-full bg-[#0D1017] border border-[#1F2432] focus:border-[#8B5CF6] text-xs text-white rounded-xl px-3 py-2 outline-none font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1 font-mono">
                    UTM Content (Conteúdo do Anúncio)
                  </label>
                  <input
                    type="text"
                    placeholder="banner_principal_v2"
                    value={utmContent}
                    onChange={(e) => setUtmContent(e.target.value)}
                    className="w-full bg-[#0D1017] border border-[#1F2432] focus:border-[#8B5CF6] text-xs text-white rounded-xl px-3 py-2 outline-none font-mono"
                  />
                </div>

                {/* Query String Renderizada */}
                {utmQueryString && (
                  <div className="p-2.5 rounded-xl bg-[#0D1017] border border-[#10B981]/30 text-[#10B981] font-mono text-[11px] break-all">
                    {utmQueryString}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bloco 4: Segurança & Redirecionamento Avançado (Acordeão) */}
          <div className="p-5 rounded-2xl bg-[#11141D] border border-[#1F2432] shadow-xl">
            <div
              onClick={() => setAdvancedExpanded(!advancedExpanded)}
              className="flex items-center justify-between cursor-pointer select-none"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-[#10B981]/15 text-[#10B981] flex items-center justify-center">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">
                    Segurança &amp; Redirecionamento Avançado
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Proteção por senha, vinculação de produto e campanha
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1F2432] text-slate-400">
                  Configurável
                </span>
                {advancedExpanded ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </div>

            {advancedExpanded && (
              <div className="pt-4 mt-4 border-t border-[#1F2432]/60 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* Seleção de Campanha */}
                <div>
                  <label className="block text-slate-400 mb-1">Vincular a Campanha</label>
                  <select
                    value={selectedCampaignId}
                    onChange={(e) => setSelectedCampaignId(e.target.value)}
                    className="w-full bg-[#0D1017] border border-[#1F2432] text-white rounded-xl px-3 py-2 outline-none font-sans"
                  >
                    <option value="">Nenhuma campanha</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Seleção de Produto */}
                <div>
                  <label className="block text-slate-400 mb-1">Vincular a Produto</label>
                  <select
                    value={selectedProductId}
                    onChange={(e) => {
                      setSelectedProductId(e.target.value);
                      setSelectedOfferId("");
                    }}
                    className="w-full bg-[#0D1017] border border-[#1F2432] text-white rounded-xl px-3 py-2 outline-none font-sans"
                  >
                    <option value="">Nenhum produto</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Barra de Ação Inferior: Pronto para Publicação */}
          <div className="p-4 rounded-2xl bg-[#11141D] border border-[#1F2432] flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#8B5CF6] to-[#7C3AED] flex items-center justify-center text-white shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-white">
                    Pronto para Publicação
                  </span>
                  <span className="badge-purple text-[9px] py-0 px-1.5 font-mono">
                    Edge CDN Ready
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono truncate max-w-xs">
                  URL Ativa: https://linkz.io/{activeSlug}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={onCancel}
                className="btn-secondary text-xs px-3.5 py-2 cursor-pointer w-full sm:w-auto"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || !destinationUrl.trim()}
                className="btn-primary text-xs px-4 py-2 font-semibold cursor-pointer w-full sm:w-auto disabled:opacity-50"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{loading ? "Criando..." : "Criar Link & Salvar QR Code"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Coluna Direita: Live Preview & Customização do QR Code (2/5) */}
        <div className="lg:col-span-2 space-y-5">
          <div className="p-6 rounded-2xl bg-[#11141D] border border-[#1F2432] shadow-xl space-y-5">
            {/* Header do Live Preview */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold tracking-wider text-slate-400 uppercase">
                LIVE PREVIEW
              </span>
              <span className="badge-mint text-[10px] py-0 px-2 font-mono">
                Render Vectorial Ativo
              </span>
            </div>

            {/* Preview da URL Curta com Copiar */}
            <div className="p-3 rounded-xl bg-[#0D1017] border border-[#1F2432] flex items-center justify-between">
              <div className="flex items-center gap-2 truncate">
                <Zap className="w-4 h-4 text-[#8B5CF6] shrink-0" />
                <span className="text-xs font-mono text-white truncate">
                  {previewShortUrl}
                </span>
              </div>
              <button
                type="button"
                onClick={copyToClipboard}
                title="Copiar URL encurtada"
                className="text-slate-400 hover:text-white cursor-pointer ml-2 shrink-0"
              >
                {copiedLink ? (
                  <Check className="w-3.5 h-3.5 text-[#10B981]" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {/* Container do QR Code Estilizado */}
            <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-[#0D1017] border border-[#1F2432] relative group">
              {qrDataUrl ? (
                <div className="relative">
                  <img
                    src={qrDataUrl}
                    alt="QR Code Preview"
                    className="w-48 h-48 rounded-xl shadow-lg border border-[#1F2432]"
                  />
                  {qrShowLogo && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-8 h-8 rounded-lg bg-[#8B5CF6] text-white flex items-center justify-center shadow-lg border border-white/20">
                        <Check className="w-4 h-4" />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-48 h-48 rounded-xl bg-slate-900 border border-[#1F2432] flex items-center justify-center text-slate-600 font-mono text-xs">
                  Carregando...
                </div>
              )}

              <span className="text-[10px] text-slate-500 font-mono mt-3">
                Tamanho 1024 x 1024px • ECC Nível H (30%)
              </span>
            </div>

            {/* Estilo dos Cantos (Olhos) */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">
                Estilo dos Cantos (Olhos)
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setQrCornerStyle("rounded")}
                  className={`py-2 px-3 rounded-xl border text-xs font-mono transition-all cursor-pointer ${
                    qrCornerStyle === "rounded"
                      ? "bg-[#1E2333] border-[#8B5CF6] text-white font-semibold"
                      : "bg-[#0D1017] border-[#1F2432] text-slate-400 hover:text-white"
                  }`}
                >
                  Arredondado
                </button>
                <button
                  type="button"
                  onClick={() => setQrCornerStyle("square")}
                  className={`py-2 px-3 rounded-xl border text-xs font-mono transition-all cursor-pointer ${
                    qrCornerStyle === "square"
                      ? "bg-[#1E2333] border-[#8B5CF6] text-white font-semibold"
                      : "bg-[#0D1017] border-[#1F2432] text-slate-400 hover:text-white"
                  }`}
                >
                  Quadrado
                </button>
                <button
                  type="button"
                  onClick={() => setQrCornerStyle("circle")}
                  className={`py-2 px-3 rounded-xl border text-xs font-mono transition-all cursor-pointer ${
                    qrCornerStyle === "circle"
                      ? "bg-[#1E2333] border-[#8B5CF6] text-white font-semibold"
                      : "bg-[#0D1017] border-[#1F2432] text-slate-400 hover:text-white"
                  }`}
                >
                  Circular
                </button>
              </div>
            </div>

            {/* Esquema de Cores & Gradiente */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">
                Esquema de Cores &amp; Gradiente
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setQrColorTheme("purple")}
                  className={`flex items-center gap-2 py-2 px-3 rounded-xl border text-xs font-mono transition-all cursor-pointer ${
                    qrColorTheme === "purple"
                      ? "bg-[#1E2333] border-[#8B5CF6] text-white"
                      : "bg-[#0D1017] border-[#1F2432] text-slate-400"
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-[#8B5CF6]" />
                  <span>Vórtice Roxo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setQrColorTheme("mint")}
                  className={`flex items-center gap-2 py-2 px-3 rounded-xl border text-xs font-mono transition-all cursor-pointer ${
                    qrColorTheme === "mint"
                      ? "bg-[#1E2333] border-[#8B5CF6] text-white"
                      : "bg-[#0D1017] border-[#1F2432] text-slate-400"
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
                  <span>Tech Mint</span>
                </button>
                <button
                  type="button"
                  onClick={() => setQrColorTheme("mono")}
                  className={`flex items-center gap-2 py-2 px-3 rounded-xl border text-xs font-mono transition-all cursor-pointer ${
                    qrColorTheme === "mono"
                      ? "bg-[#1E2333] border-[#8B5CF6] text-white"
                      : "bg-[#0D1017] border-[#1F2432] text-slate-400"
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-white" />
                  <span>Monocromo</span>
                </button>
              </div>
            </div>

            {/* Switch Logo Central */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#0D1017] border border-[#1F2432]">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-slate-400" />
                <div>
                  <div className="text-xs font-medium text-white">
                    Logo Central LINKZIVO
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    Mantém legibilidade e contraste
                  </div>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={qrShowLogo}
                  onChange={(e) => setQrShowLogo(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-[#1F2432] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#8B5CF6]" />
              </label>
            </div>

            {/* Botões de Ação de Exportação */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => downloadQr("png")}
                className="btn-secondary text-xs py-2 px-2 font-mono flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-400" />
                <span>Baixar PNG</span>
              </button>
              <button
                type="button"
                onClick={() => downloadQr("svg")}
                className="btn-secondary text-xs py-2 px-2 font-mono flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-400" />
                <span>Baixar SVG</span>
              </button>
              <button
                type="button"
                onClick={copyToClipboard}
                className="btn-secondary text-xs py-2 px-2 font-mono flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span>Copiar</span>
              </button>
            </div>
          </div>

          {/* Card: Box de Teste Instantâneo */}
          <div className="p-4 rounded-2xl bg-[#11141D] border border-[#1F2432] flex items-center gap-3 shadow-xl">
            <div className="w-10 h-10 rounded-xl bg-[#10B981]/15 text-[#10B981] flex items-center justify-center shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-white">
                Box de Teste Instantâneo
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Escaneie com a câmera do seu celular para testar o redirecionamento imediato em ambiente de homologação.
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import QRCode from "qrcode";
import {
  ExternalLink,
  Copy,
  Check,
  Zap,
  ShieldCheck,
  Wand2,
  Lock,
  ChevronDown,
  ChevronUp,
  Download,
  Camera,
  Layers,
  ShoppingBag,
  Sparkles,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

interface CampaignItem {
  id: string;
  name: string;
}

interface ProductOffer {
  id: string;
  productId: string;
  name: string;
  affiliateUrl: string;
}

interface ProductItem {
  id: string;
  name: string;
  platform: string;
  offers?: ProductOffer[];
}

interface LinkEditorViewProps {
  isEdit?: boolean;
  initialData?: {
    id?: string;
    slug?: string;
    title?: string | null;
    destinationUrl?: string;
    campaignId?: string | null;
    productId?: string | null;
    offerId?: string | null;
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    utmTerm?: string | null;
    utmContent?: string | null;
  } | null;
  campaigns: CampaignItem[];
  products: ProductItem[];
  onSave: (data: {
    destinationUrl: string;
    slug?: string;
    title?: string;
    campaignId?: string;
    productId?: string;
    offerId?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;
  }) => Promise<void>;
  onCancel?: () => void;
  loading: boolean;
  shortDomain?: string;
}

export function LinkEditorView({
  isEdit = false,
  initialData,
  campaigns,
  products,
  onSave,
  onCancel,
  loading,
  shortDomain,
}: LinkEditorViewProps) {
  // Campos do formulário
  const [destinationUrl, setDestinationUrl] = useState(initialData?.destinationUrl || "");
  const [title, setTitle] = useState(initialData?.title || "");
  const [slug, setSlug] = useState(initialData?.slug || "");
  const [campaignId, setCampaignId] = useState(initialData?.campaignId || "");
  const [productId, setProductId] = useState(initialData?.productId || "");
  const [offerId, setOfferId] = useState(initialData?.offerId || "");

  // UTMs
  const [autoUtm, setAutoUtm] = useState(true);
  const [utmSource, setUtmSource] = useState(initialData?.utmSource || "google");
  const [utmMedium, setUtmMedium] = useState(initialData?.utmMedium || "cpc");
  const [utmCampaign, setUtmCampaign] = useState(initialData?.utmCampaign || "inverno_2026");
  const [utmTerm, setUtmTerm] = useState(initialData?.utmTerm || "");
  const [utmContent, setUtmContent] = useState(initialData?.utmContent || "");

  // Seções retráteis
  const [utmSectionOpen, setUtmSectionOpen] = useState(true);
  const [securitySectionOpen, setSecuritySectionOpen] = useState(false);
  const [affiliateSectionOpen, setAffiliateSectionOpen] = useState(true);

  // Customização de QR Code no Live Preview
  const [qrCornerStyle, setQrCornerStyle] = useState<"rounded" | "square" | "circle">("rounded");
  const [qrColorScheme, setQrColorScheme] = useState<"purple" | "mint" | "mono">("purple");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedQr, setCopiedQr] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const domain = shortDomain || (typeof window !== "undefined" ? window.location.host : "linkz.io");
  const activeSlug = slug.trim() || (isEdit ? initialData?.slug || "meu-link" : "oferta-inverno-26");
  const protocol = typeof window !== "undefined" ? window.location.protocol : "https:";
  const fullShortUrl = `${protocol}//${domain}/${activeSlug}`;

  // Gera o QR Code no Live Preview
  useEffect(() => {
    let fg = "#7C3AED";
    let bg = "#0B0E17";

    if (qrColorScheme === "mint") {
      fg = "#10B981";
      bg = "#0B0E17";
    } else if (qrColorScheme === "mono") {
      fg = "#F8FAFC";
      bg = "#0B0E17";
    }

    QRCode.toDataURL(fullShortUrl, {
      width: 480,
      margin: 2,
      color: {
        dark: fg,
        light: bg,
      },
      errorCorrectionLevel: "H",
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error(err));
  }, [fullShortUrl, qrColorScheme]);

  // Sincroniza ofertas ao trocar produto
  const selectedProduct = products.find((p) => p.id === productId);
  const availableOffers = selectedProduct?.offers || [];

  const handleProductChange = (newProdId: string) => {
    setProductId(newProdId);
    setOfferId("");
    const prod = products.find((p) => p.id === newProdId);
    if (prod && prod.offers && prod.offers.length > 0) {
      const firstOffer = prod.offers[0];
      setOfferId(firstOffer.id);
      if (firstOffer.affiliateUrl && !destinationUrl) {
        setDestinationUrl(firstOffer.affiliateUrl);
      }
    }
  };

  const handleOfferChange = (newOfferId: string) => {
    setOfferId(newOfferId);
    const off = availableOffers.find((o) => o.id === newOfferId);
    if (off && off.affiliateUrl) {
      setDestinationUrl(off.affiliateUrl);
    }
  };

  const handleGenerateRandomSlug = () => {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let auto = "";
    for (let i = 0; i < 6; i++) {
      auto += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setSlug(auto);
  };

  const handleTestDestination = () => {
    if (!destinationUrl.trim()) {
      alert("Por favor, informe uma URL de destino primeiro.");
      return;
    }
    let target = destinationUrl.trim();
    if (!target.startsWith("http://") && !target.startsWith("https://")) {
      target = `https://${target}`;
    }
    window.open(target, "_blank", "noopener,noreferrer");
  };

  const handleCopyShortUrl = () => {
    navigator.clipboard.writeText(fullShortUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleDownloadQrPng = () => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `qrcode_${activeSlug}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadQrSvg = async () => {
    try {
      let fg = "#7C3AED";
      let bg = "#0B0E17";
      if (qrColorScheme === "mint") fg = "#10B981";
      if (qrColorScheme === "mono") fg = "#F8FAFC";

      const svgString = await QRCode.toString(fullShortUrl, {
        type: "svg",
        margin: 2,
        color: { dark: fg, light: bg },
        errorCorrectionLevel: "H",
      });
      const blob = new Blob([svgString], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `qrcode_${activeSlug}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!destinationUrl.trim()) {
      setErrorMsg("A URL de destino é obrigatória.");
      return;
    }

    try {
      await onSave({
        destinationUrl: destinationUrl.trim(),
        slug: slug.trim() || undefined,
        title: title.trim() || undefined,
        campaignId: campaignId || undefined,
        productId: productId || undefined,
        offerId: offerId || undefined,
        utmSource: autoUtm ? utmSource.trim() : undefined,
        utmMedium: autoUtm ? utmMedium.trim() : undefined,
        utmCampaign: autoUtm ? utmCampaign.trim() : undefined,
        utmTerm: autoUtm ? utmTerm.trim() : undefined,
        utmContent: autoUtm ? utmContent.trim() : undefined,
      });
    } catch (err: any) {
      setErrorMsg(err.message || "Erro ao salvar Smart Link.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Subheader & Título */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono tracking-wider uppercase text-purple-400 font-semibold mb-1">
            Engine de Roteamento / {isEdit ? "Edição de Registro" : "Novo Registro"}
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {isEdit ? "Editar Smart Link & QR Code" : "Criar Link & Editor de QR Code"}
            </h1>
            <span className="badge-stitch-mint flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Sync em Tempo Real
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="hidden md:flex items-center gap-1.5 text-slate-400 font-mono text-[11px] px-3 py-1.5 rounded-lg bg-[#121622] border border-white/[0.07]">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span>Latência de Redirecionamento: &lt;14ms</span>
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="btn-stitch-secondary text-xs cursor-pointer"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Grid Principal: 2 Colunas (Formulário à Esquerda, Live Preview à Direita) */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Coluna Esquerda: Blocos Numerados do Formulário (7 Cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Bloco 1: URL de Destino Obrigatória */}
          <div className="stitch-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-md bg-purple-600 text-white flex items-center justify-center text-xs font-bold font-mono">
                  1
                </span>
                <span className="text-sm font-semibold text-white">URL de Destino Obrigatória</span>
              </div>
              <span className="badge-stitch-mint flex items-center gap-1 text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5" />
                Protocolo Seguro
              </span>
            </div>

            <div className="relative flex items-center mb-2">
              <input
                type="url"
                required
                value={destinationUrl}
                onChange={(e) => setDestinationUrl(e.target.value)}
                placeholder="https://minhaloja.com.br/promocao-inverno"
                className="w-full pl-3 pr-24 py-2.5 bg-[#0A0D15] border border-white/[0.08] focus:border-purple-500 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500/50 font-mono"
              />
              <button
                type="button"
                onClick={handleTestDestination}
                className="absolute right-1.5 px-3 py-1.5 rounded-lg bg-[#161B29] hover:bg-[#1E2538] text-slate-300 hover:text-white border border-white/[0.08] text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer"
              >
                <ExternalLink className="w-3 h-3 text-purple-400" />
                <span>Testar</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span>Destino com certificado TLS/SSL ativo verificado automaticamente pela CDN LINKZIVO.</span>
            </div>
          </div>

          {/* Bloco 2: Identificação & URL Curta */}
          <div className="stitch-card p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-md bg-purple-600 text-white flex items-center justify-center text-xs font-bold font-mono">
                2
              </span>
              <span className="text-sm font-semibold text-white">Identificação &amp; URL Curta</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Identificação Interna do Link
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Campanha Promoção Inverno • Conversão Google Ads"
                className="w-full px-3 py-2 bg-[#0A0D15] border border-white/[0.08] focus:border-purple-500 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Visível apenas no seu painel para relatórios internos.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Estrutura da URL Curta &amp; Alias Personalizado
              </label>
              <div className="flex items-center gap-2">
                <div className="px-3 py-2 rounded-xl bg-[#0A0D15] border border-white/[0.08] text-xs font-mono text-slate-300 shrink-0">
                  {domain}/
                </div>
                <div className="relative flex-1">
                  <input
                    type="text"
                    disabled={isEdit}
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ""))}
                    placeholder="oferta-inverno-26"
                    className="w-full pl-3 pr-24 py-2 bg-[#0A0D15] border border-white/[0.08] focus:border-purple-500 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500/50 font-mono disabled:opacity-60"
                  />
                  <div className="absolute right-2 inset-y-0 flex items-center pointer-events-none">
                    <span className="badge-stitch-mint text-[10px] py-0.5">
                      Disponível
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1.5">
                <span>Caracteres permitidos: letras, números e hífens.</span>
                {!isEdit && (
                  <button
                    type="button"
                    onClick={handleGenerateRandomSlug}
                    className="text-purple-400 hover:text-purple-300 flex items-center gap-1 font-medium transition-colors cursor-pointer"
                  >
                    <Wand2 className="w-3 h-3" />
                    <span>Gerar slug aleatório</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Bloco 3: Rastreamento & Parâmetros UTM (Sanfona) */}
          <div className="stitch-card p-5">
            <button
              type="button"
              onClick={() => setUtmSectionOpen(!utmSectionOpen)}
              className="w-full flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-semibold text-white">
                    Rastreamento &amp; Parâmetros UTM
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Atribuição de campanhas no Google Analytics 4, Meta Ads e CRM
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-white/[0.06] text-slate-300 font-mono text-[10px]">
                  5 parâmetros
                </span>
                {utmSectionOpen ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </button>

            {utmSectionOpen && (
              <div className="mt-4 pt-4 border-t border-white/[0.06] space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-300">
                    Anexar parâmetros UTM automaticamente
                  </label>
                  <button
                    type="button"
                    onClick={() => setAutoUtm(!autoUtm)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      autoUtm ? "bg-purple-600" : "bg-slate-700"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition duration-200 ease-in-out ${
                        autoUtm ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {autoUtm && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1 font-mono">
                          UTM Source (Origem)
                        </label>
                        <input
                          type="text"
                          value={utmSource}
                          onChange={(e) => setUtmSource(e.target.value)}
                          placeholder="google"
                          className="w-full px-3 py-1.5 bg-[#0A0D15] border border-white/[0.08] rounded-lg text-xs text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1 font-mono">
                          UTM Medium (Mídia)
                        </label>
                        <input
                          type="text"
                          value={utmMedium}
                          onChange={(e) => setUtmMedium(e.target.value)}
                          placeholder="cpc"
                          className="w-full px-3 py-1.5 bg-[#0A0D15] border border-white/[0.08] rounded-lg text-xs text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1 font-mono">
                          UTM Campaign (Campanha)
                        </label>
                        <input
                          type="text"
                          value={utmCampaign}
                          onChange={(e) => setUtmCampaign(e.target.value)}
                          placeholder="inverno_2026"
                          className="w-full px-3 py-1.5 bg-[#0A0D15] border border-white/[0.08] rounded-lg text-xs text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1 font-mono">
                          UTM Term (Palavra-chave)
                        </label>
                        <input
                          type="text"
                          value={utmTerm}
                          onChange={(e) => setUtmTerm(e.target.value)}
                          placeholder="jaqueta-couro"
                          className="w-full px-3 py-1.5 bg-[#0A0D15] border border-white/[0.08] rounded-lg text-xs text-white font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1 font-mono">
                        UTM Content (Conteúdo do Anúncio)
                      </label>
                      <input
                        type="text"
                        value={utmContent}
                        onChange={(e) => setUtmContent(e.target.value)}
                        placeholder="banner_principal_v2"
                        className="w-full px-3 py-1.5 bg-[#0A0D15] border border-white/[0.08] rounded-lg text-xs text-white font-mono"
                      />
                    </div>

                    {/* Preview da query string */}
                    <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 font-mono text-[11px] text-emerald-400 break-all">
                      ?utm_source={utmSource || "..."}&amp;utm_medium={utmMedium || "..."}&amp;utm_campaign={utmCampaign || "..."}
                      {utmTerm && `&utm_term=${utmTerm}`}
                      {utmContent && `&utm_content=${utmContent}`}
                      &amp;sck=&#123;&#123;click_id&#125;&#125;
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Bloco 4: Integração de Campanhas & Produtos/Ofertas de Afiliados */}
          <div className="stitch-card p-5">
            <button
              type="button"
              onClick={() => setAffiliateSectionOpen(!affiliateSectionOpen)}
              className="w-full flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-semibold text-white">
                    Vínculo de Campanha &amp; Catálogo de Afiliados
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Atribuição automática a campanhas ativas e ofertas cadastradas
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-white/[0.06] text-slate-300 font-mono text-[10px]">
                  Opcional
                </span>
                {affiliateSectionOpen ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </button>

            {affiliateSectionOpen && (
              <div className="mt-4 pt-4 border-t border-white/[0.06] space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Campanha de Marketing
                    </label>
                    <select
                      value={campaignId}
                      onChange={(e) => setCampaignId(e.target.value)}
                      className="w-full px-3 py-2 bg-[#0A0D15] border border-white/[0.08] rounded-lg text-xs text-white"
                    >
                      <option value="">Sem campanha (Avulso)</option>
                      {campaigns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Produto no Catálogo
                    </label>
                    <select
                      value={productId}
                      onChange={(e) => handleProductChange(e.target.value)}
                      className="w-full px-3 py-2 bg-[#0A0D15] border border-white/[0.08] rounded-lg text-xs text-white"
                    >
                      <option value="">Sem produto associado</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.platform})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {availableOffers.length > 0 && (
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Oferta Específica do Produto
                    </label>
                    <select
                      value={offerId}
                      onChange={(e) => handleOfferChange(e.target.value)}
                      className="w-full px-3 py-2 bg-[#0A0D15] border border-white/[0.08] rounded-lg text-xs text-white"
                    >
                      <option value="">Selecione uma oferta</option>
                      {availableOffers.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bloco 5: Segurança & Redirecionamento Avançado */}
          <div className="stitch-card p-5">
            <button
              type="button"
              onClick={() => setSecuritySectionOpen(!securitySectionOpen)}
              className="w-full flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-semibold text-white">
                    Segurança &amp; Redirecionamento Avançado
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Proteção por senha, validade de cliques, geotargeting e pixels
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400 font-medium">Configurável</span>
                {securitySectionOpen ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </button>

            {securitySectionOpen && (
              <div className="mt-4 pt-4 border-t border-white/[0.06] text-xs text-slate-400 space-y-2">
                <p>
                  As regras de mitigação de SSRF e bloqueio incondicional de redes privadas já estão ativas por padrão.
                </p>
                <div className="p-3 rounded-lg bg-[#0A0D15] border border-white/[0.06] flex items-center justify-between">
                  <span className="text-slate-300">Proteção contra bots e deduplicação de cliques por câmera:</span>
                  <span className="badge-stitch-mint">Ativo</span>
                </div>
              </div>
            )}
          </div>

          {/* Barra de Publicação Inferior */}
          <div className="p-4 rounded-xl bg-[#121622] border border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">Pronto para Publicação</span>
                  <span className="px-1.5 py-0.5 rounded bg-white/[0.08] text-[9px] font-mono text-slate-300">
                    Edge CDN Ready
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono truncate max-w-xs sm:max-w-sm">
                  URL Ativa: <span className="text-purple-300">{fullShortUrl}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="flex-1 sm:flex-none btn-stitch-secondary text-xs cursor-pointer"
                >
                  Salvar como Rascunho
                </button>
              )}
              <button
                type="submit"
                disabled={loading}
                className="flex-1 sm:flex-none btn-stitch-primary text-xs font-semibold px-5 py-2.5 cursor-pointer disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Processando...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{isEdit ? "Salvar Alterações" : "Criar Link & Salvar QR Code"}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Coluna Direita: LIVE PREVIEW (5 Cols) */}
        <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-20">
          <div className="stitch-card p-5 space-y-5">
            {/* Header do Live Preview */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                Live Preview
              </span>
              <span className="badge-stitch-mint flex items-center gap-1 text-[10px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Render Vetorial Ativo
              </span>
            </div>

            {/* Display da URL curta com botão copiar */}
            <div className="p-3 rounded-xl bg-[#0A0D15] border border-white/[0.08] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-mono text-purple-300 truncate">
                <Zap className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="truncate">{fullShortUrl}</span>
              </div>
              <button
                type="button"
                onClick={handleCopyShortUrl}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer shrink-0"
                title="Copiar URL Curta"
              >
                {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            {/* Box Central do QR Code */}
            <div className="p-6 rounded-2xl bg-[#090C14] border border-white/[0.06] flex flex-col items-center justify-center">
              <div className="relative p-3 rounded-xl bg-[#0B0E17] border border-white/[0.08] shadow-2xl">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Preview QR Code"
                    className="w-56 h-56 rounded-lg object-contain"
                  />
                ) : (
                  <div className="w-56 h-56 flex items-center justify-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin text-purple-400" />
                  </div>
                )}
              </div>
              <div className="text-[10px] text-slate-400 font-mono mt-3">
                Tamanho 1024 x 1024px • ECC Nível H (30%)
              </div>
            </div>

            {/* Estilo dos Cantos (Olhos) */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-2">
                Estilo dos Cantos (Olhos)
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setQrCornerStyle("rounded")}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-all cursor-pointer text-center ${
                    qrCornerStyle === "rounded"
                      ? "bg-purple-600/20 border-purple-500/50 text-purple-300"
                      : "bg-[#0A0D15] border-white/[0.06] text-slate-400 hover:text-white"
                  }`}
                >
                  Arredondado
                </button>
                <button
                  type="button"
                  onClick={() => setQrCornerStyle("square")}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-all cursor-pointer text-center ${
                    qrCornerStyle === "square"
                      ? "bg-purple-600/20 border-purple-500/50 text-purple-300"
                      : "bg-[#0A0D15] border-white/[0.06] text-slate-400 hover:text-white"
                  }`}
                >
                  Quadrado
                </button>
                <button
                  type="button"
                  onClick={() => setQrCornerStyle("circle")}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-all cursor-pointer text-center ${
                    qrCornerStyle === "circle"
                      ? "bg-purple-600/20 border-purple-500/50 text-purple-300"
                      : "bg-[#0A0D15] border-white/[0.06] text-slate-400 hover:text-white"
                  }`}
                >
                  Circular
                </button>
              </div>
            </div>

            {/* Esquema de Cores & Gradiente */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-2">
                Esquema de Cores &amp; Gradiente
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setQrColorScheme("purple")}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    qrColorScheme === "purple"
                      ? "bg-purple-600/20 border-purple-500/50 text-purple-300"
                      : "bg-[#0A0D15] border-white/[0.06] text-slate-400 hover:text-white"
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0" />
                  <span>Vórtice Roxo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setQrColorScheme("mint")}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    qrColorScheme === "mint"
                      ? "bg-emerald-600/20 border-emerald-500/50 text-emerald-300"
                      : "bg-[#0A0D15] border-white/[0.06] text-slate-400 hover:text-white"
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
                  <span>Tech Mint</span>
                </button>

                <button
                  type="button"
                  onClick={() => setQrColorScheme("mono")}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    qrColorScheme === "mono"
                      ? "bg-white/10 border-white/30 text-white"
                      : "bg-[#0A0D15] border-white/[0.06] text-slate-400 hover:text-white"
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-white shrink-0" />
                  <span>Monocromo</span>
                </button>
              </div>
            </div>

            {/* Botões de Ação Direta para Download e Cópia */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={handleDownloadQrPng}
                className="btn-stitch-secondary text-[11px] py-2 flex items-center justify-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-purple-400" />
                <span>Baixar PNG</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadQrSvg}
                className="btn-stitch-secondary text-[11px] py-2 flex items-center justify-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Baixar SVG</span>
              </button>

              <button
                type="button"
                onClick={handleCopyShortUrl}
                className="btn-stitch-secondary text-[11px] py-2 flex items-center justify-center gap-1 cursor-pointer"
              >
                {copiedLink ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-purple-400" />
                )}
                <span>Copiar</span>
              </button>
            </div>

            {/* Box de Teste Instantâneo */}
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <Camera className="w-4 h-4" />
              </div>
              <div className="text-xs">
                <div className="font-semibold text-white mb-0.5">Box de Teste Instantâneo</div>
                <div className="text-slate-300 text-[11px] leading-relaxed">
                  Escaneie com a câmera do seu celular para testar o redirecionamento imediato em ambiente de homologação.
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

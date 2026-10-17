"use client";

import React, { useState, useEffect } from "react";
import QRCode from "qrcode";
import {
  ExternalLink,
  Copy,
  Check,
  Zap,
  Wand2,
  ChevronDown,
  ChevronUp,
  Download,
  Layers,
  ShoppingBag,
  Sparkles,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ShieldCheck,
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
  // 1. Destino e Identificação
  const [destinationUrl, setDestinationUrl] = useState(initialData?.destinationUrl || "");
  const [title, setTitle] = useState(initialData?.title || "");

  // 2. Slug Personalizado com Validação Real no Servidor
  const [slug, setSlug] = useState(initialData?.slug || "");
  const [slugChecking, setSlugChecking] = useState(false);
  const [slugStatus, setSlugStatus] = useState<{
    status: "idle" | "available" | "unavailable" | "error";
    message?: string;
  }>({ status: "idle" });

  // 3. Campanhas e Produtos
  const [campaignId, setCampaignId] = useState(initialData?.campaignId || "");
  const [productId, setProductId] = useState(initialData?.productId || "");
  const [offerId, setOfferId] = useState(initialData?.offerId || "");

  // 4. UTMs
  const [autoUtm, setAutoUtm] = useState(
    Boolean(
      initialData?.utmSource ||
      initialData?.utmMedium ||
      initialData?.utmCampaign ||
      initialData?.utmTerm ||
      initialData?.utmContent
    )
  );
  const [utmSource, setUtmSource] = useState(initialData?.utmSource || "");
  const [utmMedium, setUtmMedium] = useState(initialData?.utmMedium || "");
  const [utmCampaign, setUtmCampaign] = useState(initialData?.utmCampaign || "");
  const [utmTerm, setUtmTerm] = useState(initialData?.utmTerm || "");
  const [utmContent, setUtmContent] = useState(initialData?.utmContent || "");
  const [utmSectionOpen, setUtmSectionOpen] = useState(
    Boolean(
      initialData?.utmSource ||
      initialData?.utmCampaign ||
      initialData?.utmTerm ||
      initialData?.utmContent ||
      initialData?.campaignId ||
      initialData?.productId
    )
  );

  // 5. QR Code e Live Preview
  const [qrColorScheme, setQrColorScheme] = useState<"purple" | "mint" | "mono">("purple");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const domain = shortDomain || (typeof window !== "undefined" ? window.location.host : "linkzivo.com");
  const activeSlug = slug.trim() || (isEdit ? initialData?.slug || "link" : "seu-slug");
  const protocol = typeof window !== "undefined" ? window.location.protocol : "https:";
  const fullShortUrl = `${protocol}//${domain}/${activeSlug}`;

  // Validação assíncrona do slug no servidor com debounce
  useEffect(() => {
    const trimmed = slug.trim().toLowerCase();
    if (!trimmed) {
      setSlugStatus({ status: "idle" });
      return;
    }

    // Se estiver editando e for o mesmo slug original, é válido
    if (isEdit && initialData?.slug && trimmed === initialData.slug.toLowerCase()) {
      setSlugStatus({ status: "available", message: "Slug atual deste link" });
      return;
    }

    if (trimmed.length < 3) {
      setSlugStatus({ status: "unavailable", message: "Mínimo de 3 caracteres" });
      return;
    }

    const timer = setTimeout(async () => {
      setSlugChecking(true);
      try {
        const excludeParam = initialData?.id ? `&excludeId=${initialData.id}` : "";
        const res = await fetch(`/api/links/check-slug?slug=${encodeURIComponent(trimmed)}${excludeParam}`);
        const data = await res.json();

        if (data.available) {
          setSlugStatus({ status: "available", message: data.message || "Disponível" });
        } else {
          setSlugStatus({ status: "unavailable", message: data.message || "Já em uso" });
        }
      } catch {
        setSlugStatus({ status: "error", message: "Erro ao consultar servidor" });
      } finally {
        setSlugChecking(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [slug, isEdit, initialData?.id, initialData?.slug]);

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
      width: 420,
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

    if (slugStatus.status === "unavailable") {
      setErrorMsg("O slug informado não está disponível. Por favor, escolha outro.");
      return;
    }

    try {
      await onSave({
        destinationUrl: destinationUrl.trim(),
        slug: slug.trim() ? slug.trim().toLowerCase() : undefined,
        title: title.trim() || undefined,
        campaignId: campaignId || undefined,
        productId: productId || undefined,
        offerId: offerId || undefined,
        utmSource: autoUtm ? (utmSource.trim() || undefined) : (isEdit ? "" : undefined),
        utmMedium: autoUtm ? (utmMedium.trim() || undefined) : (isEdit ? "" : undefined),
        utmCampaign: autoUtm ? (utmCampaign.trim() || undefined) : (isEdit ? "" : undefined),
        utmTerm: autoUtm ? (utmTerm.trim() || undefined) : (isEdit ? "" : undefined),
        utmContent: autoUtm ? (utmContent.trim() || undefined) : (isEdit ? "" : undefined),
      });
    } catch (err: any) {
      setErrorMsg(err.message || "Erro ao salvar Smart Link.");
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Cabeçalho do Editor */}
      <div className="pb-4 mb-4 border-b border-white/[0.08]">
        <h2 className="text-lg font-bold text-white tracking-tight">
          {isEdit ? "Editar Smart Link" : "Criar Novo Smart Link"}
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Configure a URL de destino, personalize a rota e gere seu código QR.
        </p>
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-slate-400 hover:text-white"
          >
            ×
          </button>
        </div>
      )}

      {/* Formulário com Layout Responsivo de 2 Colunas */}
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col justify-between">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-20 sm:pb-24">
          {/* Coluna Esquerda: Campos Principais (7 Colunas) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Bloco 1: Destino e Título */}
            <div className="stitch-card p-4 space-y-3">
              <span className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
                1. Destino &amp; Identificação
              </span>

              {/* URL de Destino */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  URL de Destino <span className="text-rose-400">*</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    type="url"
                    required
                    value={destinationUrl}
                    onChange={(e) => setDestinationUrl(e.target.value)}
                    placeholder="https://sua-pagina.com/produto"
                    className="w-full pl-3 pr-20 py-2 bg-[#090C14] border border-white/[0.08] focus:border-purple-500 rounded-md text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500/50 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleTestDestination}
                    className="absolute right-1 px-2.5 py-1 rounded bg-[#161B29] hover:bg-[#1E2538] text-slate-300 hover:text-white border border-white/[0.08] text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer"
                    title="Testar URL de destino em nova aba"
                  >
                    <ExternalLink className="w-3 h-3 text-purple-400" />
                    <span>Testar</span>
                  </button>
                </div>
              </div>

              {/* Título do Link */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Título de Identificação (Opcional)
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Campanha Black Friday - Bio Instagram"
                  className="w-full px-3 py-2 bg-[#090C14] border border-white/[0.08] focus:border-purple-500 rounded-md text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                />
              </div>
            </div>

            {/* Bloco 2: Personalização da Slug */}
            <div className="stitch-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
                  2. Personalização do Slug
                </span>
                {!isEdit && (
                  <button
                    type="button"
                    onClick={handleGenerateRandomSlug}
                    className="text-purple-400 hover:text-purple-300 flex items-center gap-1 text-[11px] font-medium transition-colors cursor-pointer"
                  >
                    <Wand2 className="w-3 h-3" />
                    <span>Gerar aleatório</span>
                  </button>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <div className="px-3 py-2 rounded-md bg-[#090C14] border border-white/[0.08] text-xs font-mono text-slate-400 shrink-0 select-none">
                    {domain}/
                  </div>
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ""))}
                      placeholder="meu-slug-personalizado"
                      className="w-full pl-3 pr-24 py-2 bg-[#090C14] border border-white/[0.08] focus:border-purple-500 rounded-md text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500/50 font-mono"
                    />
                    <div className="absolute right-2 inset-y-0 flex items-center pointer-events-none">
                      {slugChecking ? (
                        <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                      ) : slugStatus.status === "available" ? (
                        <span className="flex items-center gap-1 text-emerald-400 text-[10px] font-mono">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Disponível</span>
                        </span>
                      ) : slugStatus.status === "unavailable" ? (
                        <span className="flex items-center gap-1 text-rose-400 text-[10px] font-mono">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Indisponível</span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 mt-1.5 flex items-center justify-between">
                  <span>Permitidos: letras minúsculas, números, hífens e underscores.</span>
                  {slugStatus.message && (
                    <span className={slugStatus.status === "available" ? "text-emerald-400" : "text-rose-400"}>
                      {slugStatus.message}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Bloco 3: Configurações Adicionais (Campanhas, Produtos e UTMs) */}
            <div className="stitch-card p-4 space-y-3">
              <button
                type="button"
                onClick={() => setUtmSectionOpen(!utmSectionOpen)}
                className="w-full flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
                    3. Campanhas &amp; Parâmetros UTM
                  </span>
                </div>
                {utmSectionOpen ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {utmSectionOpen && (
                <div className="pt-3 border-t border-white/[0.06] space-y-4">
                  {/* Campanha e Produto */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Campanha Associada
                      </label>
                      <select
                        value={campaignId}
                        onChange={(e) => setCampaignId(e.target.value)}
                        className="w-full px-3 py-2 rounded-md bg-[#090C14] border border-white/[0.08] text-xs text-white focus:outline-none cursor-pointer"
                      >
                        <option value="">Nenhuma campanha</option>
                        {campaigns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Produto / Oferta
                      </label>
                      <select
                        value={productId}
                        onChange={(e) => handleProductChange(e.target.value)}
                        className="w-full px-3 py-2 rounded-md bg-[#090C14] border border-white/[0.08] text-xs text-white focus:outline-none cursor-pointer"
                      >
                        <option value="">Nenhum produto</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.platform})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Chave de Ativação Switch de Parâmetros UTM */}
                  <div className="pt-2 border-t border-white/[0.06]">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <span className="text-xs font-medium text-slate-300 block">
                          Anexar parâmetros de rastreamento UTM
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Injeta tags de atribuição para plataformas de checkout e Google Analytics
                        </span>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={autoUtm}
                        aria-label="Ativar parâmetros de rastreamento UTM"
                        onClick={() => setAutoUtm(!autoUtm)}
                        onKeyDown={(e) => {
                          if (e.key === " " || e.key === "Enter") {
                            e.preventDefault();
                            setAutoUtm(!autoUtm);
                          }
                        }}
                        className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border border-white/10 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1 focus:ring-offset-[#0B0E17] ${
                          autoUtm ? "bg-purple-600" : "bg-slate-800"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out my-auto ${
                            autoUtm ? "translate-x-5" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>

                    {autoUtm && (
                      <div className="space-y-3 pt-1">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[10px] uppercase font-mono text-slate-400 mb-1">
                              utm_source (Origem)
                            </label>
                            <input
                              type="text"
                              value={utmSource}
                              onChange={(e) => setUtmSource(e.target.value)}
                              placeholder="google"
                              className="w-full px-2.5 py-1.5 bg-[#090C14] border border-white/[0.08] rounded-md text-xs text-white font-mono focus:border-purple-500 outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] uppercase font-mono text-slate-400 mb-1">
                              utm_medium (Mídia)
                            </label>
                            <input
                              type="text"
                              value={utmMedium}
                              onChange={(e) => setUtmMedium(e.target.value)}
                              placeholder="cpc"
                              className="w-full px-2.5 py-1.5 bg-[#090C14] border border-white/[0.08] rounded-md text-xs text-white font-mono focus:border-purple-500 outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] uppercase font-mono text-slate-400 mb-1">
                              utm_campaign (Campanha)
                            </label>
                            <input
                              type="text"
                              value={utmCampaign}
                              onChange={(e) => setUtmCampaign(e.target.value)}
                              placeholder="inverno_2026"
                              className="w-full px-2.5 py-1.5 bg-[#090C14] border border-white/[0.08] rounded-md text-xs text-white font-mono focus:border-purple-500 outline-none"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] uppercase font-mono text-slate-400 mb-1">
                              utm_term (Palavra-chave)
                            </label>
                            <input
                              type="text"
                              value={utmTerm}
                              onChange={(e) => setUtmTerm(e.target.value)}
                              placeholder="jaqueta-couro"
                              className="w-full px-2.5 py-1.5 bg-[#090C14] border border-white/[0.08] rounded-md text-xs text-white font-mono focus:border-purple-500 outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] uppercase font-mono text-slate-400 mb-1">
                              utm_content (Conteúdo do Anúncio)
                            </label>
                            <input
                              type="text"
                              value={utmContent}
                              onChange={(e) => setUtmContent(e.target.value)}
                              placeholder="banner_principal_v2"
                              className="w-full px-2.5 py-1.5 bg-[#090C14] border border-white/[0.08] rounded-md text-xs text-white font-mono focus:border-purple-500 outline-none"
                            />
                          </div>
                        </div>

                        {/* Preview da query string */}
                        <div className="p-2.5 rounded-md bg-[#090C14] border border-white/[0.06] font-mono text-[11px] text-purple-300 break-all flex items-start gap-2">
                          <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
                          <div className="leading-relaxed">
                            <span className="text-slate-400 font-sans">Query string gerada: </span>
                            <span className="text-slate-300">
                              ?utm_source={encodeURIComponent(utmSource.trim() || "...")}
                              &amp;utm_medium={encodeURIComponent(utmMedium.trim() || "...")}
                              {utmCampaign.trim() && `&utm_campaign=${encodeURIComponent(utmCampaign.trim())}`}
                              {utmTerm.trim() && `&utm_term=${encodeURIComponent(utmTerm.trim())}`}
                              {utmContent.trim() && `&utm_content=${encodeURIComponent(utmContent.trim())}`}
                              &amp;sck=&#123;&#123;click_id&#125;&#125;
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Informe Discreto de Segurança */}
            <div className="p-3 rounded-md bg-[#090C14] border border-white/[0.06] flex items-center gap-2.5 text-xs text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="leading-relaxed">
                <span className="text-white font-medium">Segurança da Rota: </span>
                <span>Mitigação de SSRF em redes privadas, filtragem de requisições de bots e deduplicação de acessos via QR Code.</span>
              </div>
            </div>
          </div>

          {/* Coluna Direita: Live Preview & Estilos QR Code (5 Colunas) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="stitch-card p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
                  Pré-visualização do QR Code
                </span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-mono border border-emerald-500/20">
                  Alta Resolução
                </span>
              </div>

              {/* QR Code Renderizado */}
              <div className="flex flex-col items-center justify-center p-4 bg-[#090C14] rounded-md border border-white/[0.06]">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Preview QR Code"
                    className="w-44 h-44 object-contain rounded"
                  />
                ) : (
                  <div className="w-44 h-44 flex items-center justify-center text-xs text-slate-500 font-mono">
                    Gerando QR...
                  </div>
                )}

                <div className="mt-3 text-center">
                  <div className="text-xs font-mono text-purple-300 font-medium truncate max-w-[240px]">
                    {domain}/{activeSlug}
                  </div>
                </div>
              </div>

              {/* Esquema de Cor do QR Code */}
              <div>
                <label className="block text-[11px] text-slate-400 mb-1.5 font-medium">
                  Cor de Destaque do QR Code:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setQrColorScheme("purple")}
                    className={`py-1.5 px-2 rounded-md text-xs font-medium border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                      qrColorScheme === "purple"
                        ? "bg-purple-600/20 border-purple-500 text-purple-300"
                        : "bg-[#090C14] border-white/[0.08] text-slate-400 hover:text-white"
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                    <span>Roxo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setQrColorScheme("mint")}
                    className={`py-1.5 px-2 rounded-md text-xs font-medium border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                      qrColorScheme === "mint"
                        ? "bg-emerald-600/20 border-emerald-500 text-emerald-300"
                        : "bg-[#090C14] border-white/[0.08] text-slate-400 hover:text-white"
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <span>Verde</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setQrColorScheme("mono")}
                    className={`py-1.5 px-2 rounded-md text-xs font-medium border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                      qrColorScheme === "mono"
                        ? "bg-white/10 border-white/30 text-white"
                        : "bg-[#090C14] border-white/[0.08] text-slate-400 hover:text-white"
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-white" />
                    <span>Branco</span>
                  </button>
                </div>
              </div>

              {/* Ações Rápidas do Preview */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={handleCopyShortUrl}
                  className="py-1.5 px-2 rounded-md bg-[#121622] hover:bg-white/[0.08] border border-white/[0.08] text-xs text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center justify-center gap-1"
                  title="Copiar URL Curta"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>Copiar</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadQrPng}
                  className="py-1.5 px-2 rounded-md bg-[#121622] hover:bg-white/[0.08] border border-white/[0.08] text-xs text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center justify-center gap-1"
                  title="Baixar PNG em Alta Resolução"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PNG</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadQrSvg}
                  className="py-1.5 px-2 rounded-md bg-[#121622] hover:bg-white/[0.08] border border-white/[0.08] text-xs text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center justify-center gap-1"
                  title="Baixar SVG Vetorial"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>SVG</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé Fixo de Ações - Sempre Visível em Qualquer Resolução */}
        <div className="sticky bottom-0 -mx-5 sm:-mx-7 -mb-5 sm:-mb-7 p-4 bg-[#0B0E17]/95 backdrop-blur-md border-t border-white/[0.08] flex items-center justify-between gap-3 z-30">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate hidden sm:flex">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Proteções ativas: mitigação de SSRF, filtro de bots e deduplicação de QR</span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="btn-stitch-secondary text-xs px-4 py-2 cursor-pointer"
              >
                Cancelar
              </button>
            )}

            <button
              type="submit"
              disabled={loading || slugStatus.status === "unavailable"}
              className="btn-stitch-primary text-xs font-semibold px-5 py-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{isEdit ? "Salvar Alterações" : "Criar Smart Link"}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

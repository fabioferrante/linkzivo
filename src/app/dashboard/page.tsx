"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { AuthModal } from "@/components/AuthModal";
import {
  Link2,
  QrCode,
  Layers,
  BarChart3,
  Plus,
  ExternalLink,
  Copy,
  Check,
  Edit3,
  Trash2,
  ShoppingBag,
  DollarSign,
  Smartphone,
  Globe,
  Activity,
  Download,
} from "lucide-react";

interface SmartLinkItem {
  id: string;
  slug: string;
  title: string | null;
  destinationUrl: string;
  clickCount: number;
  qrScanCount: number;
  status: string;
  createdAt: string;
  qrCode?: { fgColor: string; bgColor: string } | null;
  product?: { id: string; name: string } | null;
  campaign?: { id: string; name: string } | null;
  channel?: { id: string; name: string } | null;
}

interface AnalyticsData {
  totalClicks: number;
  totalQrScans: number;
  totalLinks: number;
  conversionsCount: number;
  estimatedCommission: number;
  deviceBreakdown: { name: string; count: number; pct: number }[];
  osBreakdown: { name: string; count: number; pct: number }[];
  topCountries: { country: string; count: number }[];
}

export default function DashboardPage() {
  const [user, setUser] = useState<{
    id: string;
    email: string;
    name: string | null;
    workspacePlan: string;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<"links" | "campaigns" | "products" | "analytics">("links");
  const [links, setLinks] = useState<SmartLinkItem[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modais
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Modal de Edição de Destino
  const [editingLink, setEditingLink] = useState<SmartLinkItem | null>(null);
  const [newDestinationUrl, setNewDestinationUrl] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // Modal de QR Code
  const [qrModalLink, setQrModalLink] = useState<SmartLinkItem | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // Formulário de Criação de Link
  const [newUrl, setNewUrl] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Formulário de Criação de Produto
  const [createProductOpen, setCreateProductOpen] = useState(false);
  const [prodName, setProdName] = useState("");
  const [prodPlatform, setProdPlatform] = useState("Hotmart");
  const [prodOfferUrl, setProdOfferUrl] = useState("");
  const [prodCommission, setProdCommission] = useState("");

  // Formulário de Criação de Campanha
  const [createCampaignOpen, setCreateCampaignOpen] = useState(false);
  const [campName, setCampName] = useState("");
  const [campDescription, setCampDescription] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const authRes = await fetch("/api/auth");
      const authData = await authRes.json();
      if (authData.authenticated && authData.user) {
        setUser(authData.user);
      } else {
        setUser(null);
      }

      const linksRes = await fetch("/api/links");
      const linksData = await linksRes.json();
      setLinks(linksData.links || []);

      const campRes = await fetch("/api/campaigns");
      const campData = await campRes.json();
      setCampaigns(campData.campaigns || []);

      const prodRes = await fetch("/api/products");
      const prodData = await prodRes.json();
      setProducts(prodData.products || []);

      const anaRes = await fetch("/api/analytics");
      const anaData = await anaRes.json();
      setAnalytics(anaData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCopy = (slug: string, id: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    navigator.clipboard.writeText(`${origin}/${slug}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenQr = async (link: SmartLinkItem) => {
    setQrModalLink(link);
    setQrDataUrl(null);
    try {
      const res = await fetch(`/api/links/${link.id}/qr?format=png`);
      const data = await res.json();
      setQrDataUrl(data.dataUrl);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveDestination = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLink || !newDestinationUrl.trim()) return;

    setEditLoading(true);
    try {
      const res = await fetch(`/api/links/${editingLink.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinationUrl: newDestinationUrl.trim() }),
      });

      if (!res.ok) {
        const d = await res.json();
        alert(d.error || "Erro ao atualizar");
        return;
      }

      setEditingLink(null);
      fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteLink = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este link? O slug deixará de redirecionar.")) return;
    try {
      await fetch(`/api/links/${id}`, { method: "DELETE" });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateSmartLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);

    try {
      const res = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: newUrl.trim(),
          customSlug: newSlug.trim() || undefined,
          title: newTitle.trim() || undefined,
          productId: selectedProductId || undefined,
          campaignId: selectedCampaignId || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao criar link.");
      }

      setCreateModalOpen(false);
      setNewUrl("");
      setNewSlug("");
      setNewTitle("");
      fetchData();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: prodName,
          platform: prodPlatform,
          initialOfferUrl: prodOfferUrl,
          commissionValue: prodCommission,
        }),
      });
      if (res.ok) {
        setCreateProductOpen(false);
        setProdName("");
        setProdOfferUrl("");
        setProdCommission("");
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campName,
          description: campDescription,
        }),
      });
      if (res.ok) {
        setCreateCampaignOpen(false);
        setCampName("");
        setCampDescription("");
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0F19] text-slate-100">
      <Navbar user={user} onOpenAuth={() => setAuthModalOpen(true)} />

      <div className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        {/* Banner do Workspace (rounded-xl, escala 4px) */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10 text-[#4267E9]">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white">
                  Painel de Links &amp; Campanhas
                </h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#4267E9]/20 text-[#4267E9] font-mono font-medium">
                  {user ? user.workspacePlan : "DEMO"}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Acompanhe cliques, configure campanhas e gerencie seus links de afiliados.
              </p>
            </div>
          </div>

          <button
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#4267E9] hover:bg-[#3556D4] text-white font-medium text-xs rounded-lg transition-colors cursor-pointer shrink-0 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Criar Smart Link</span>
          </button>
        </div>

        {/* Métricas Principais (Cards em rounded-xl, escala 4px) */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2 text-xs">
              <span>Total de Cliques</span>
              <Activity className="w-4 h-4 text-[#4267E9]" />
            </div>
            <div className="text-2xl font-bold text-white">
              {analytics?.totalClicks ?? 0}
            </div>
            <span className="text-xs text-emerald-400 font-medium block mt-1">
              Rastreamento ativo
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2 text-xs">
              <span>Scans de QR Code</span>
              <QrCode className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              {analytics?.totalQrScans ?? 0}
            </div>
            <span className="text-xs text-sky-400 font-medium block mt-1">
              Tráfego impresso
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2 text-xs">
              <span>Smart Links</span>
              <Link2 className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              {analytics?.totalLinks ?? links.length}
            </div>
            <span className="text-xs text-slate-400 block mt-1">
              Destino mutável
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2 text-xs">
              <span>Comissão Estimada</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-emerald-400">
              R$ {analytics?.estimatedCommission?.toFixed(2) ?? "0,00"}
            </div>
            <span className="text-xs text-emerald-400 block mt-1">
              Atribuição de checkout
            </span>
          </div>
        </div>

        {/* Abas */}
        <div className="border-b border-slate-800 flex items-center gap-6 mb-6">
          <button
            onClick={() => setActiveTab("links")}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === "links"
                ? "border-[#4267E9] text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Link2 className="w-4 h-4" />
            <span>Smart Links ({links.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("campaigns")}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === "campaigns"
                ? "border-[#4267E9] text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Campanhas ({campaigns.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("products")}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === "products"
                ? "border-[#4267E9] text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Produtos ({products.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("analytics")}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === "analytics"
                ? "border-[#4267E9] text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Analytics</span>
          </button>
        </div>

        {/* Aba: Links */}
        {activeTab === "links" && (
          <div className="space-y-4">
            {links.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-12 text-center">
                <Link2 className="w-10 h-10 text-[#4267E9] mx-auto mb-3 opacity-60" />
                <h3 className="text-base font-semibold text-white mb-1">
                  Nenhum Smart Link criado ainda
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mb-6">
                  Encurte uma URL para gerar seu primeiro link com QR Code dinâmico e rastreamento.
                </p>
                <button
                  onClick={() => setCreateModalOpen(true)}
                  className="px-4 py-2 bg-[#4267E9] hover:bg-[#3556D4] text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                >
                  Criar Primeiro Link
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden shadow-sm">
                <div className="divide-y divide-slate-800">
                  {links.map((link) => (
                    <div
                      key={link.id}
                      className="p-4 sm:p-6 hover:bg-slate-800/40 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold font-mono text-white hover:text-[#4267E9] transition-colors">
                            /{link.slug}
                          </span>
                          {link.title && (
                            <span className="text-xs text-slate-400 truncate max-w-xs">
                              • {link.title}
                            </span>
                          )}
                          {link.campaign && (
                            <span className="text-[10px] bg-[#4267E9]/15 text-[#4267E9] px-2 py-0.5 rounded font-medium border border-[#4267E9]/30">
                              {link.campaign.name}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-xs text-slate-400 truncate">
                          <span className="text-slate-500">Destino:</span>
                          <span className="text-slate-300 font-mono truncate max-w-md underline">
                            {link.destinationUrl}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
                        <div className="flex items-center gap-2 text-right font-mono">
                          <div className="text-center px-2.5 py-1 bg-slate-950 rounded-md border border-slate-800">
                            <span className="block text-xs font-semibold text-white">
                              {link.clickCount}
                            </span>
                            <span className="block text-[10px] text-slate-500">Cliques</span>
                          </div>

                          <div className="text-center px-2.5 py-1 bg-slate-950 rounded-md border border-slate-800">
                            <span className="block text-xs font-semibold text-sky-400">
                              {link.qrScanCount}
                            </span>
                            <span className="block text-[10px] text-slate-500">QR Scans</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleCopy(link.slug, link.id)}
                            className="p-2 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-800 transition-colors cursor-pointer"
                            title="Copiar Link Curto"
                          >
                            {copiedId === link.id ? (
                              <Check className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <Copy className="w-4 h-4 text-[#4267E9]" />
                            )}
                          </button>

                          <button
                            onClick={() => handleOpenQr(link)}
                            className="p-2 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-800 transition-colors cursor-pointer"
                            title="Ver QR Code Dinâmico"
                          >
                            <QrCode className="w-4 h-4 text-sky-400" />
                          </button>

                          <button
                            onClick={() => {
                              setEditingLink(link);
                              setNewDestinationUrl(link.destinationUrl);
                            }}
                            className="p-2 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-800 transition-colors cursor-pointer"
                            title="Editar Destino"
                          >
                            <Edit3 className="w-4 h-4 text-amber-400" />
                          </button>

                          <button
                            onClick={() => handleDeleteLink(link.id)}
                            className="p-2 bg-slate-950 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 rounded-lg border border-slate-800 transition-colors cursor-pointer"
                            title="Excluir Link"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Aba: Campanhas */}
        {activeTab === "campaigns" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-semibold text-white">Campanhas</h2>
              <button
                onClick={() => setCreateCampaignOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4267E9] hover:bg-[#3556D4] text-white text-xs font-medium rounded-lg transition-colors cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Nova Campanha
              </button>
            </div>

            {campaigns.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center text-slate-400 text-xs">
                Nenhuma campanha ativa. Crie campanhas para organizar múltiplos canais de tráfego.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {campaigns.map((camp) => (
                  <div key={camp.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-white">{camp.name}</h3>
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-medium border border-emerald-500/20">
                        {camp.status}
                      </span>
                    </div>
                    {camp.description && (
                      <p className="text-xs text-slate-400 mb-3">{camp.description}</p>
                    )}
                    <div className="text-xs text-slate-500 pt-3 border-t border-slate-800 flex justify-between">
                      <span>Links: {camp._count?.smartLinks || 0}</span>
                      <span>Conversões: {camp._count?.conversions || 0}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Aba: Produtos */}
        {activeTab === "products" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-semibold text-white">Link Vault • Produtos</h2>
              <button
                onClick={() => setCreateProductOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4267E9] hover:bg-[#3556D4] text-white text-xs font-medium rounded-lg transition-colors cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Cadastrar Produto
              </button>
            </div>

            {products.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center text-slate-400 text-xs">
                Nenhum produto cadastrado no Link Vault.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.map((prod) => (
                  <div key={prod.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-white">{prod.name}</h3>
                      <span className="text-[10px] bg-[#4267E9]/15 text-[#4267E9] px-2 py-0.5 rounded font-medium border border-[#4267E9]/30">
                        {prod.platform}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mb-3">
                      {prod.offers?.[0] && (
                        <div>Comissão: R$ {prod.offers[0].commissionValue || 0}</div>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 pt-3 border-t border-slate-800 flex justify-between">
                      <span>Ofertas: {prod.offers?.length || 0}</span>
                      <span>Links Gerados: {prod._count?.smartLinks || 0}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Aba: Analytics */}
        {activeTab === "analytics" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-[#4267E9]" />
                  Distribuição por Dispositivo
                </h3>
                {analytics?.deviceBreakdown?.length ? (
                  <div className="space-y-3">
                    {analytics.deviceBreakdown.map((item, i) => (
                      <div key={i}>
                        <div className="flex justify-between text-xs font-mono text-slate-300 mb-1">
                          <span>{item.name}</span>
                          <span>{item.count} ({item.pct}%)</span>
                        </div>
                        <div className="w-full h-2 bg-slate-950 rounded-lg overflow-hidden progress-bar">
                          <div
                            className="h-full bg-[#4267E9] rounded-lg progress-indicator"
                            style={{ width: `${item.pct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 text-center py-6">
                    Aguardando primeiros cliques de telemetria.
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  Top Países de Acesso
                </h3>
                {analytics?.topCountries?.length ? (
                  <div className="space-y-2">
                    {analytics.topCountries.map((c, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2.5 bg-slate-950 rounded-lg text-xs font-mono border border-slate-800"
                      >
                        <span className="text-white font-medium">{c.country}</span>
                        <span className="text-emerald-400 font-semibold">{c.count} acessos</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 text-center py-6">
                    Nenhum tráfego geográfico registrado ainda.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Criar Smart Link */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 max-w-lg w-full shadow-lg">
            <h3 className="text-base font-semibold text-white mb-1">Criar Novo Smart Link</h3>
            <p className="text-xs text-slate-400 mb-4">
              Defina o destino e conecte aos seus canais e produtos.
            </p>

            <form onSubmit={handleCreateSmartLink} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  URL de Destino *
                </label>
                <input
                  type="text"
                  required
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://exemplo.com/pagina-vendas"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 outline-none focus:border-[#4267E9]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Slug Customizado (Opcional)
                  </label>
                  <input
                    type="text"
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value)}
                    placeholder="promo-natal"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 outline-none focus:border-[#4267E9]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Título do Link
                  </label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Instagram Bio"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 outline-none focus:border-[#4267E9]"
                  />
                </div>
              </div>

              {campaigns.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Associar à Campanha
                  </label>
                  <select
                    value={selectedCampaignId}
                    onChange={(e) => setSelectedCampaignId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 outline-none focus:border-[#4267E9]"
                  >
                    <option value="">Sem campanha (Avulso)</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {createError && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs">
                  {createError}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="flex-1 py-2 bg-slate-800 text-slate-300 text-xs font-medium rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="flex-1 py-2 bg-[#4267E9] hover:bg-[#3556D4] text-white text-xs font-medium rounded-lg cursor-pointer"
                >
                  {createLoading ? "Criando..." : "Gerar Link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Destino do Link Existente */}
      {editingLink && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 max-w-md w-full shadow-lg">
            <h3 className="text-base font-semibold text-white mb-1">
              Editar Destino do Link
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              O slug <span className="text-[#4267E9] font-mono">/{editingLink.slug}</span> e o QR Code
              continuam intactos! Apenas o destino será atualizado.
            </p>

            <form onSubmit={handleSaveDestination} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nova URL de Destino
                </label>
                <input
                  type="text"
                  required
                  value={newDestinationUrl}
                  onChange={(e) => setNewDestinationUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 outline-none focus:border-[#4267E9]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingLink(null)}
                  className="flex-1 py-2 bg-slate-800 text-slate-300 text-xs font-medium rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="flex-1 py-2 bg-[#4267E9] hover:bg-[#3556D4] text-white text-xs font-medium rounded-lg cursor-pointer"
                >
                  {editLoading ? "Salvando..." : "Salvar Destino"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: QR Code */}
      {qrModalLink && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 max-w-sm w-full text-center shadow-lg">
            <h3 className="text-base font-semibold text-white mb-1">QR Code Dinâmico</h3>
            <p className="text-xs text-slate-400 mb-4 font-mono">
              /{qrModalLink.slug}
            </p>

            {qrDataUrl ? (
              <div className="bg-white p-4 rounded-lg inline-block mb-4 shadow-sm">
                <Image
                  src={qrDataUrl}
                  alt={`QR Code ${qrModalLink.slug}`}
                  width={180}
                  height={180}
                  className="w-44 h-44"
                />
              </div>
            ) : (
              <div className="w-44 h-44 bg-slate-950 rounded-lg flex items-center justify-center mx-auto mb-4 text-xs text-slate-500">
                Gerando QR Code...
              </div>
            )}

            <div className="flex gap-2 mb-4">
              {qrDataUrl && (
                <a
                  href={qrDataUrl}
                  download={`linkzivo-qr-${qrModalLink.slug}.png`}
                  className="flex-1 py-2 px-3 bg-[#4267E9] text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                >
                  Baixar PNG
                </a>
              )}
              <a
                href={`/api/links/${qrModalLink.id}/qr?format=svg`}
                download
                className="flex-1 py-2 px-3 bg-slate-800 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-colors cursor-pointer"
              >
                Baixar SVG
              </a>
            </div>

            <button
              onClick={() => setQrModalLink(null)}
              className="w-full py-2 text-slate-400 hover:text-white text-xs font-medium cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Modal: Criar Produto */}
      {createProductOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 max-w-md w-full shadow-lg">
            <h3 className="text-base font-semibold text-white mb-1">
              Cadastrar Produto no Link Vault
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Salve ofertas da Hotmart, Kiwify ou Eduzz para reaproveitar em campanhas.
            </p>

            <form onSubmit={handleCreateProduct} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nome do Produto
                </label>
                <input
                  type="text"
                  required
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  placeholder="Curso Mestre do Tráfego"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 outline-none focus:border-[#4267E9]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Plataforma
                </label>
                <select
                  value={prodPlatform}
                  onChange={(e) => setProdPlatform(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 outline-none focus:border-[#4267E9]"
                >
                  <option value="Hotmart">Hotmart</option>
                  <option value="Kiwify">Kiwify</option>
                  <option value="Eduzz">Eduzz</option>
                  <option value="Monetizze">Monetizze</option>
                  <option value="Amazon">Amazon Associates</option>
                  <option value="Shopee">Shopee</option>
                  <option value="Outra">Outra</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Link de Checkout / Afiliado
                </label>
                <input
                  type="text"
                  required
                  value={prodOfferUrl}
                  onChange={(e) => setProdOfferUrl(e.target.value)}
                  placeholder="https://go.hotmart.com/XYZ123"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 outline-none focus:border-[#4267E9]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Comissão Base Estimada (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={prodCommission}
                  onChange={(e) => setProdCommission(e.target.value)}
                  placeholder="97.00"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 outline-none focus:border-[#4267E9]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateProductOpen(false)}
                  className="flex-1 py-2 bg-slate-800 text-slate-300 text-xs font-medium rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-[#4267E9] hover:bg-[#3556D4] text-white text-xs font-medium rounded-lg cursor-pointer"
                >
                  Salvar Produto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Criar Campanha */}
      {createCampaignOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 max-w-md w-full shadow-lg">
            <h3 className="text-base font-semibold text-white mb-1">Nova Campanha</h3>
            <p className="text-xs text-slate-400 mb-4">
              Agrupe links de múltiplos canais para acompanhar o desempenho geral.
            </p>

            <form onSubmit={handleCreateCampaign} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nome da Campanha
                </label>
                <input
                  type="text"
                  required
                  value={campName}
                  onChange={(e) => setCampName(e.target.value)}
                  placeholder="Black Friday 2026"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 outline-none focus:border-[#4267E9]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Descrição (Opcional)
                </label>
                <textarea
                  value={campDescription}
                  onChange={(e) => setCampDescription(e.target.value)}
                  placeholder="Oferta especial para stories e grupos de WhatsApp."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 outline-none focus:border-[#4267E9]"
                  rows={3}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateCampaignOpen(false)}
                  className="flex-1 py-2 bg-slate-800 text-slate-300 text-xs font-medium rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-[#4267E9] hover:bg-[#3556D4] text-white text-xs font-medium rounded-lg cursor-pointer"
                >
                  Criar Campanha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Autenticação */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={fetchData}
      />
    </div>
  );
}

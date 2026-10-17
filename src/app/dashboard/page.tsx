"use client";

import { useEffect, useState, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  X,
  History,
  QrCode,
  Download,
  AlertCircle,
  RefreshCw,
  ShoppingBag,
  Layers,
  Plus,
  Check,
  Tag,
  DollarSign,
  Percent,
} from "lucide-react";
import { formatBrDateTime } from "@/lib/date";

// Componentes Modernos do Google Stitch
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { OverviewView } from "@/components/dashboard/OverviewView";
import { LinksListView, SmartLinkItem } from "@/components/dashboard/LinksListView";
import { LinkEditorView } from "@/components/dashboard/LinkEditorView";
import { CampaignsView, CampaignItem } from "@/components/dashboard/CampaignsView";
import { ProductsView, ProductItem } from "@/components/dashboard/ProductsView";
import { AnalyticsView } from "@/components/dashboard/AnalyticsView";

export interface LinkHistoryItem {
  id: string;
  smartLinkId: string;
  previousUrl: string;
  newUrl: string;
  changedAt: string;
  changedByUserId: string | null;
  changedByUserName?: string;
}

interface AnalyticsData {
  period: string;
  totalClicks: number;
  totalQrScans: number;
  totalLinks: number;
  conversionsCount: number;
  confirmedCommission: number;
  estimatedCommission: number;
  totalCommission: number;
  dailyTimeline: Array<{
    date: string;
    label: string;
    clicks: number;
    qrScans: number;
  }>;
  deviceBreakdown: Array<{ name: string; count: number; pct: number }>;
  osBreakdown: Array<{ name: string; count: number; pct: number }>;
  browserBreakdown: Array<{ name: string; count: number; pct: number }>;
  topCountries: Array<{ country: string; count: number }>;
  topCities: Array<{ city: string; count: number }>;
  linkPerformance: Array<{
    id: string;
    slug: string;
    title: string | null;
    clicks: number;
    qrScans: number;
  }>;
  campaignPerformance: Array<{ id: string; name: string; clicks: number }>;
  productPerformance: Array<{ id: string; name: string; clicks: number }>;
  recentClicks: Array<{
    id: string;
    slug: string;
    title: string | null;
    device: string | null;
    os: string | null;
    browser: string | null;
    country: string | null;
    isQrScan: boolean;
    timestamp: string;
  }>;
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  const [user, setUser] = useState<{
    id: string;
    email: string;
    name: string | null;
    workspacePlan: string;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<
    "overview" | "links" | "campaigns" | "products" | "analytics"
  >(() => {
    if (
      tabParam === "campaigns" ||
      tabParam === "analytics" ||
      tabParam === "links" ||
      tabParam === "products"
    ) {
      return tabParam;
    }
    return "overview";
  });

  // Mobile sidebar state (inicia recolhido por padrão em smartphones)
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);

  // Sincroniza activeTab quando o parâmetro da URL mudar
  useEffect(() => {
    if (
      tabParam === "campaigns" ||
      tabParam === "analytics" ||
      tabParam === "links" ||
      tabParam === "products" ||
      tabParam === "overview"
    ) {
      setActiveTab(tabParam);
    } else if (!tabParam) {
      setActiveTab("overview");
    }
  }, [tabParam]);

  const handleTabChange = (
    newTab: "overview" | "links" | "campaigns" | "products" | "analytics"
  ) => {
    setActiveTab(newTab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (newTab === "overview") {
        url.searchParams.delete("tab");
      } else {
        url.searchParams.set("tab", newTab);
      }
      window.history.replaceState(null, "", url.toString());
    }
  };

  const [period, setPeriod] = useState<"7d" | "30d" | "90d" | "all">("30d");

  // Dados da conta
  const [links, setLinks] = useState<SmartLinkItem[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  // Estados de Carregamento e Erro
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modais de Criação e Edição
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [editingLink, setEditingLink] = useState<SmartLinkItem | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  // Ações de ciclo de vida
  const [lifecycleActionLoading, setLifecycleActionLoading] = useState<string | null>(null);

  // Modal de Detalhes da Campanha
  const [campaignDetail, setCampaignDetail] = useState<{
    campaign: CampaignItem;
    metrics: {
      totalLinks: number;
      totalClicks: number;
      uniqueClicks?: number;
      totalQrScans: number;
      totalConversions: number;
      confirmedCommission: number;
      deviceBreakdown?: Array<{ name: string; count: number; pct: number }>;
    };
  } | null>(null);
  const [campaignDetailLoading, setCampaignDetailLoading] = useState(false);

  // Modal de Detalhes do Produto
  const [productDetail, setProductDetail] = useState<{
    product: ProductItem;
    metrics: {
      totalOffers: number;
      totalLinks: number;
      totalClicks: number;
      uniqueClicks?: number;
      totalQrScans: number;
      totalConversions: number;
      confirmedCommission: number;
      estimatedCommission: number;
      deviceBreakdown?: Array<{ name: string; count: number; pct: number }>;
    };
  } | null>(null);
  const [productDetailLoading, setProductDetailLoading] = useState(false);

  // Modal de Adicionar Oferta a Produto
  const [addOfferProductId, setAddOfferProductId] = useState<string | null>(null);
  const [offerName, setOfferName] = useState("");
  const [offerUrl, setOfferUrl] = useState("");
  const [offerCommission, setOfferCommission] = useState("");
  const [offerLoading, setOfferLoading] = useState(false);

  // Modal de QR Code
  const [qrModalLink, setQrModalLink] = useState<SmartLinkItem | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // Modal de Histórico de Alterações
  const [historyModalLink, setHistoryModalLink] = useState<SmartLinkItem | null>(null);
  const [historyItems, setHistoryItems] = useState<LinkHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Formulário de Criação / Edição de Produto
  const [createProductOpen, setCreateProductOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [prodName, setProdName] = useState("");
  const [prodPlatform, setProdPlatform] = useState("Shopee");
  const [customPlatformName, setCustomPlatformName] = useState("");
  const [prodOfferUrl, setProdOfferUrl] = useState("");
  const [prodCommission, setProdCommission] = useState("");
  const [prodLoading, setProdLoading] = useState(false);

  // Formulário de Criação / Edição de Campanha
  const [createCampaignOpen, setCreateCampaignOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<CampaignItem | null>(null);
  const [campName, setCampName] = useState("");
  const [campDescription, setCampDescription] = useState("");
  const [campStatus, setCampStatus] = useState("ACTIVE");
  const [campProductIds, setCampProductIds] = useState<string[]>([]);
  const [campLinkIds, setCampLinkIds] = useState<string[]>([]);
  const [campLoading, setCampLoading] = useState(false);

  // Carregamento de dados com no-store
  const fetchAllData = async (selectedPeriod = period) => {
    setError(null);
    try {
      const authRes = await fetch("/api/auth", { cache: "no-store" });
      const authData = await authRes.json();
      if (!authData.authenticated || !authData.user) {
        setUser(null);
        window.location.href = "/";
        return;
      }
      setUser(authData.user);

      const [linksRes, campaignsRes, productsRes, analyticsRes] = await Promise.all([
        fetch("/api/links", { cache: "no-store" }),
        fetch("/api/campaigns", { cache: "no-store" }),
        fetch("/api/products", { cache: "no-store" }),
        fetch(`/api/analytics?period=${selectedPeriod}`, { cache: "no-store" }),
      ]);

      if (!linksRes.ok || !campaignsRes.ok || !productsRes.ok || !analyticsRes.ok) {
        throw new Error("Falha ao comunicar com os serviços do Linkzivo.");
      }

      const [linksData, campaignsData, productsData, analyticsData] = await Promise.all([
        linksRes.json(),
        campaignsRes.json(),
        productsRes.json(),
        analyticsRes.json(),
      ]);

      setLinks(linksData.links || []);
      setCampaigns(campaignsData.campaigns || []);
      setProducts(productsData.products || []);
      setAnalytics(analyticsData);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Erro ao carregar dados do painel.");
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalyticsOnly = async (selectedPeriod: "7d" | "30d" | "90d" | "all") => {
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`/api/analytics?period=${selectedPeriod}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const handlePeriodChange = (newPeriod: "7d" | "30d" | "90d" | "all") => {
    setPeriod(newPeriod);
    fetchAnalyticsOnly(newPeriod);
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      setUser(null);
    } catch (e) {
      console.error(e);
    } finally {
      window.location.href = "/";
    }
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

  const handleOpenHistory = async (link: SmartLinkItem) => {
    setHistoryModalLink(link);
    setHistoryItems([]);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/links/${link.id}/history`);
      if (res.ok) {
        const data = await res.json();
        setHistoryItems(data.history || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleOpenCampaignDetails = async (campId: string) => {
    setCampaignDetailLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campId}`);
      if (res.ok) {
        const data = await res.json();
        setCampaignDetail(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCampaignDetailLoading(false);
    }
  };

  const handleOpenProductDetails = async (prodId: string) => {
    setProductDetailLoading(true);
    try {
      const res = await fetch(`/api/products/${prodId}`);
      if (res.ok) {
        const data = await res.json();
        setProductDetail(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setProductDetailLoading(false);
    }
  };

  // Salvar Link (Criação via LinkEditorView)
  const handleSaveSmartLink = async (formData: {
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
  }) => {
    setCreateLoading(true);
    try {
      const res = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: formData.destinationUrl,
          customSlug: formData.slug || undefined,
          title: formData.title || undefined,
          campaignId: formData.campaignId || undefined,
          productId: formData.productId || undefined,
          offerId: formData.offerId || undefined,
          utmSource: formData.utmSource,
          utmMedium: formData.utmMedium,
          utmCampaign: formData.utmCampaign,
          utmTerm: formData.utmTerm,
          utmContent: formData.utmContent,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao criar Smart Link.");
      }

      setCreateModalOpen(false);
      fetchAllData(period);
      handleTabChange("links");
    } finally {
      setCreateLoading(false);
    }
  };

  // Salvar Edição do Link (preserva histórico e permite atualização segura de slug)
  const handleSaveEditSmartLink = async (formData: {
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
  }) => {
    if (!editingLink) return;
    setEditLoading(true);
    try {
      const res = await fetch(`/api/links/${editingLink.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinationUrl: formData.destinationUrl,
          slug: formData.slug || undefined,
          title: formData.title,
          campaignId: formData.campaignId || null,
          productId: formData.productId || null,
          offerId: formData.offerId || null,
          utmSource: formData.utmSource !== undefined ? formData.utmSource : null,
          utmMedium: formData.utmMedium !== undefined ? formData.utmMedium : null,
          utmCampaign: formData.utmCampaign !== undefined ? formData.utmCampaign : null,
          utmTerm: formData.utmTerm !== undefined ? formData.utmTerm : null,
          utmContent: formData.utmContent !== undefined ? formData.utmContent : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao atualizar Smart Link.");
      }

      setEditingLink(null);
      fetchAllData(period);
    } finally {
      setEditLoading(false);
    }
  };

  // Encurtamento rápido da caixa do topo do Dashboard
  const handleFastShorten = async (destinationUrl: string, customSlug?: string) => {
    const res = await fetch("/api/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: destinationUrl,
        customSlug: customSlug || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Erro ao encurtar link.");
    }
    fetchAllData(period);
  };

  // Excluir Link
  const handleDeleteLink = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este link? O slug deixará de redirecionar.")) return;
    try {
      await fetch(`/api/links/${id}`, { method: "DELETE" });
      fetchAllData(period);
    } catch (e) {
      console.error(e);
    }
  };

  // Pausar / Reativar Link (Ciclo de Vida)
  const handleToggleLinkStatus = async (link: SmartLinkItem) => {
    const isPaused = link.status === "PAUSED";
    const nextStatus = isPaused ? "ACTIVE" : "PAUSED";
    if (!isPaused) {
      const confirmPause = confirm(
        `Pausar o link "/${link.slug}"?\n\n` +
        `Atenção: O redirecionamento público será temporariamente suspenso para todos os visitantes em todas as campanhas, exibindo uma tela de manutenção controlada.\n\n` +
        `Nenhuma métrica, histórico ou QR Code será afetado. Deseja pausar este link?`
      );
      if (!confirmPause) return;
    }
    try {
      setLifecycleActionLoading(link.id);
      const res = await fetch(`/api/links/${link.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Erro ao alterar estado do link.");
        return;
      }
      fetchAllData(period);
    } catch (e) {
      console.error(e);
    } finally {
      setLifecycleActionLoading(null);
    }
  };

  // Ciclo de Vida: Campanhas (Encerrar / Reiniciar)
  const handleToggleCampaignStatus = async (campId: string, currentStatus: string) => {
    const isEnded = currentStatus === "ENDED";
    const nextStatus = isEnded ? "ACTIVE" : "ENDED";
    if (!isEnded) {
      const confirmEnd = confirm(
        "Deseja encerrar esta campanha?\n\n" +
        "Importante: Todos os produtos e Smart Links continuarão funcionando normalmente e todo o histórico analítico será preservado. A campanha deixará de aceitar novos links temporariamente.\n\nDeseja prosseguir?"
      );
      if (!confirmEnd) return;
    }
    try {
      setLifecycleActionLoading(campId);
      const res = await fetch(`/api/campaigns/${campId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Erro ao alterar estado da campanha.");
        return;
      }
      fetchAllData(period);
      if (campaignDetail && campaignDetail.campaign.id === campId) {
        handleOpenCampaignDetails(campId);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLifecycleActionLoading(null);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!confirm("Deseja excluir esta campanha? Os links associados serão preservados.")) return;
    try {
      await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
      fetchAllData(period);
    } catch (e) {
      console.error(e);
    }
  };

  // Ciclo de Vida: Produtos (Desativar / Reativar)
  const handleToggleProductStatus = async (prodId: string, currentStatus: string) => {
    const isInactive = currentStatus === "INACTIVE";
    const nextStatus = isInactive ? "ACTIVE" : "INACTIVE";
    if (!isInactive) {
      const confirmDeact = confirm(
        "Deseja desativar este produto do catálogo?\n\n" +
        "Produtos desativados não poderão ser adicionados a novas campanhas ou novos Smart Links. Links já existentes continuarão funcionando normalmente e todo o histórico será preservado.\n\nDeseja desativar?"
      );
      if (!confirmDeact) return;
    }
    try {
      setLifecycleActionLoading(prodId);
      const res = await fetch(`/api/products/${prodId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Erro ao alterar estado do produto.");
        return;
      }
      fetchAllData(period);
      if (productDetail && productDetail.product.id === prodId) {
        handleOpenProductDetails(prodId);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLifecycleActionLoading(null);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("Deseja excluir este produto? Os links associados serão preservados.")) return;
    try {
      await fetch(`/api/products/${id}`, { method: "DELETE" });
      fetchAllData(period);
    } catch (e) {
      console.error(e);
    }
  };

  // Criar / Editar Campanha
  const handleOpenCreateCampaign = () => {
    setEditingCampaign(null);
    setCampName("");
    setCampDescription("");
    setCampProductIds([]);
    setCampLinkIds([]);
    setCampStatus("ACTIVE");
    setCreateCampaignOpen(true);
  };

  const handleOpenEditCampaign = (camp: CampaignItem) => {
    setEditingCampaign(camp);
    setCampName(camp.name);
    setCampDescription(camp.description || "");
    setCampProductIds(camp.campaignProducts?.map((cp) => cp.product.id) || []);
    setCampLinkIds(camp.smartLinks?.map((l) => l.id) || []);
    setCampStatus(camp.status || "ACTIVE");
    setCreateCampaignOpen(true);
  };

  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campName.trim()) return;
    setCampLoading(true);
    try {
      const url = editingCampaign ? `/api/campaigns/${editingCampaign.id}` : "/api/campaigns";
      const method = editingCampaign ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campName.trim(),
          description: campDescription.trim() || undefined,
          status: campStatus,
          productIds: campProductIds,
          linkIds: campLinkIds,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Erro ao salvar campanha.");
        return;
      }
      setCreateCampaignOpen(false);
      fetchAllData(period);
    } catch (e) {
      console.error(e);
    } finally {
      setCampLoading(false);
    }
  };

  const predefinedPlatforms = [
    "Shopee",
    "Mercado Livre",
    "Amazon",
    "AliExpress",
    "Magalu",
    "Shein",
    "TikTok Shop",
    "KaBuM!",
    "Americanas",
    "Hotmart",
    "Kiwify",
    "Eduzz",
    "Braip",
    "Monetizze",
    "Outra plataforma",
  ];

  const handleOpenCreateProduct = () => {
    setEditingProduct(null);
    setProdName("");
    setProdPlatform("Shopee");
    setCustomPlatformName("");
    setProdOfferUrl("");
    setProdCommission("");
    setCreateProductOpen(true);
  };

  const handleOpenEditProduct = (prod: ProductItem) => {
    setEditingProduct(prod);
    setProdName(prod.name);
    if (predefinedPlatforms.includes(prod.platform)) {
      setProdPlatform(prod.platform);
      setCustomPlatformName("");
    } else {
      setProdPlatform("Outra plataforma");
      setCustomPlatformName(prod.platform);
    }
    setProdOfferUrl("");
    setProdCommission("");
    setCreateProductOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setProdLoading(true);

    const finalPlatform =
      prodPlatform === "Outra plataforma" && customPlatformName.trim()
        ? customPlatformName.trim()
        : prodPlatform;

    try {
      if (editingProduct) {
        const res = await fetch(`/api/products/${editingProduct.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: prodName,
            platform: finalPlatform,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          alert(err.error || "Erro ao atualizar produto.");
          return;
        }
      } else {
        const res = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: prodName,
            platform: finalPlatform,
            initialOfferUrl: prodOfferUrl,
            commissionValue: prodCommission,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          alert(err.error || "Erro ao cadastrar produto.");
          return;
        }
      }

      setCreateProductOpen(false);
      setEditingProduct(null);
      setProdName("");
      setProdOfferUrl("");
      setProdCommission("");
      setCustomPlatformName("");
      fetchAllData(period);
    } catch (e) {
      console.error(e);
      alert("Falha na comunicação com o servidor.");
    } finally {
      setProdLoading(false);
    }
  };

  // Criar Oferta
  const handleCreateOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addOfferProductId) return;
    setOfferLoading(true);
    try {
      const res = await fetch(`/api/products/${addOfferProductId}/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: offerName,
          affiliateUrl: offerUrl,
          commissionValue: offerCommission,
        }),
      });
      if (res.ok) {
        setAddOfferProductId(null);
        setOfferName("");
        setOfferUrl("");
        setOfferCommission("");
        fetchAllData(period);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setOfferLoading(false);
    }
  };

  const activeTabTitles: Record<string, string> = {
    overview: "Visão Geral",
    links: "Meus Links",
    campaigns: "Campanhas",
    products: "Produtos & Ofertas",
    analytics: "Estatísticas & Analytics",
  };

  const domain = typeof window !== "undefined" ? window.location.host : "linkzivo.com";

  return (
    <div className="min-h-screen bg-[#0B0E17] text-slate-100 flex">
      {/* Sidebar Persistente Estilo Stitch com suporte a mobile recolhido */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={(tab) => handleTabChange(tab)}
        linkCount={links.length}
        user={user}
        onLogout={handleLogout}
        isMobileExpanded={isMobileExpanded}
        onToggleMobileExpanded={() => setIsMobileExpanded((prev) => !prev)}
      />

      {/* Conteúdo Principal com Header Superior (pl-16 para barra recolhida mobile, lg:pl-64 para desktop) */}
      <div className="flex-1 pl-16 lg:pl-64 flex flex-col min-w-0 transition-all duration-200">
        <Header
          activeTabTitle={activeTabTitles[activeTab] || "Painel"}
          onToggleMobileSidebar={() => setIsMobileExpanded((prev) => !prev)}
          onLogout={handleLogout}
          user={user}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {/* Alerta de Erro com Tentar Novamente */}
          {error && (
            <div className="stitch-card p-4 border-rose-500/30 bg-rose-500/10 flex items-center justify-between text-xs text-rose-300">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                onClick={() => fetchAllData(period)}
                className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 transition-colors flex items-center gap-1 cursor-pointer font-medium"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Tentar novamente</span>
              </button>
            </div>
          )}

          {/* Renderização Condicional da Aba Ativa */}
          {activeTab === "overview" && (
            <OverviewView
              user={user}
              analytics={analytics}
              links={links}
              period={period}
              onPeriodChange={handlePeriodChange}
              onFastShorten={handleFastShorten}
              onNavigateToLinks={() => handleTabChange("links")}
              loading={loading}
              shortDomain={domain}
            />
          )}

          {activeTab === "links" && (
            <LinksListView
              links={links}
              onOpenCreate={() => setCreateModalOpen(true)}
              onEditLink={(link) => setEditingLink(link)}
              onOpenHistory={handleOpenHistory}
              onOpenQr={handleOpenQr}
              onTogglePause={handleToggleLinkStatus}
              onDeleteLink={handleDeleteLink}
              loading={loading}
              shortDomain={domain}
              onRefresh={() => fetchAllData(period)}
            />
          )}

          {activeTab === "campaigns" && (
            <CampaignsView
              campaigns={campaigns}
              onOpenCreate={handleOpenCreateCampaign}
              onEditCampaign={handleOpenEditCampaign}
              onOpenDetails={handleOpenCampaignDetails}
              onToggleStatus={handleToggleCampaignStatus}
              onDeleteCampaign={handleDeleteCampaign}
              actionLoading={lifecycleActionLoading}
            />
          )}

          {activeTab === "products" && (
            <ProductsView
              products={products}
              onOpenCreate={handleOpenCreateProduct}
              onEditProduct={handleOpenEditProduct}
              onOpenAddOffer={(prodId) => setAddOfferProductId(prodId)}
              onOpenDetails={handleOpenProductDetails}
              onToggleStatus={handleToggleProductStatus}
              onDeleteProduct={handleDeleteProduct}
              actionLoading={lifecycleActionLoading}
            />
          )}

          {activeTab === "analytics" && (
            <AnalyticsView
              analytics={analytics}
              period={period}
              onPeriodChange={handlePeriodChange}
              loading={analyticsLoading}
            />
          )}
        </main>
      </div>

      {/* ======================================================== */}
      {/* MODAL 1: CRIAR SMART LINK & QR CODE */}
      {/* ======================================================== */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-5xl my-auto bg-[#0B0E17] border border-white/10 rounded-md shadow-2xl p-5 sm:p-7 max-h-[92vh] overflow-y-auto">
            <button
              onClick={() => setCreateModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer z-30"
              title="Fechar janela"
              aria-label="Fechar janela"
            >
              <X className="w-5 h-5" />
            </button>

            <LinkEditorView
              isEdit={false}
              campaigns={campaigns}
              products={products}
              onSave={handleSaveSmartLink}
              onCancel={() => setCreateModalOpen(false)}
              loading={createLoading}
              shortDomain={domain}
            />
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: EDITAR SMART LINK & QR CODE */}
      {/* ======================================================== */}
      {editingLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-5xl my-auto bg-[#0B0E17] border border-white/10 rounded-md shadow-2xl p-5 sm:p-7 max-h-[92vh] overflow-y-auto">
            <button
              onClick={() => setEditingLink(null)}
              className="absolute top-4 right-4 p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer z-30"
              title="Fechar janela"
              aria-label="Fechar janela"
            >
              <X className="w-5 h-5" />
            </button>

            <LinkEditorView
              isEdit={true}
              initialData={editingLink}
              campaigns={campaigns}
              products={products}
              onSave={handleSaveEditSmartLink}
              onCancel={() => setEditingLink(null)}
              loading={editLoading}
              shortDomain={domain}
            />
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: HISTÓRICO DE EDIÇÕES (AUDITORIA E TRANSPARÊNCIA) */}
      {/* ======================================================== */}
      {historyModalLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-xl bg-[#0F131F] border border-white/10 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div className="flex items-center gap-2 text-purple-400 font-semibold text-sm">
                <History className="w-4 h-4" />
                <span>Histórico de Alterações do Destino</span>
              </div>
              <button
                onClick={() => setHistoryModalLink(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-400">
              Smart Link: <span className="font-mono text-purple-300 font-semibold">/{historyModalLink.slug}</span>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2.5">
              {historyLoading ? (
                <div className="py-8 text-center text-xs text-slate-500 font-mono">
                  Carregando trilha de auditoria...
                </div>
              ) : historyItems.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 font-mono">
                  Nenhuma alteração de destino registrada. A URL original permanece inalterada.
                </div>
              ) : (
                historyItems.map((item) => (
                  <div key={item.id} className="p-3 rounded-xl bg-[#090C14] border border-white/[0.06] text-xs space-y-1.5">
                    <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                      <span>Alterado em: {formatBrDateTime(item.changedAt)}</span>
                    </div>
                    <div className="text-slate-400 truncate">
                      <span className="text-rose-400 font-mono">De:</span> {item.previousUrl}
                    </div>
                    <div className="text-slate-200 truncate">
                      <span className="text-emerald-400 font-mono">Para:</span> {item.newUrl}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 4: QR CODE PREVIEW E DOWNLOAD RÁPIDO */}
      {/* ======================================================== */}
      {qrModalLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-sm bg-[#0F131F] border border-white/10 rounded-2xl shadow-2xl p-6 text-center space-y-4">
            <button
              onClick={() => setQrModalLink(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-sm font-bold text-white">QR Code Dinâmico</div>
            <div className="text-xs text-purple-300 font-mono truncate">
              {domain}/{qrModalLink.slug}
            </div>

            <div className="p-4 rounded-xl bg-[#090C14] border border-white/[0.06] inline-block shadow-inner">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR Code" className="w-56 h-56 rounded-lg object-contain mx-auto" />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center text-slate-500 font-mono text-xs">
                  Renderizando...
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <a
                href={qrDataUrl || "#"}
                download={`qrcode_${qrModalLink.slug}.png`}
                className="btn-stitch-primary text-xs py-2 justify-center"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Baixar PNG</span>
              </a>
              <a
                href={`/api/links/${qrModalLink.id}/qr?format=svg`}
                download={`qrcode_${qrModalLink.slug}.svg`}
                className="btn-stitch-secondary text-xs py-2 justify-center"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Baixar SVG</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 5: DETALHES DA CAMPANHA (AUDITORIA E MÉTRICAS) */}
      {/* ======================================================== */}
      {campaignDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-2xl bg-[#0F131F] border border-white/10 rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div>
                <span className="text-[10px] uppercase font-mono text-purple-400 font-bold">Métricas da Campanha</span>
                <h3 className="text-lg font-bold text-white">{campaignDetail.campaign.name}</h3>
              </div>
              <button
                onClick={() => setCampaignDetail(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-[#090C14] border border-white/[0.04]">
                <div className="text-[10px] text-slate-400 font-mono">Cliques Totais</div>
                <div className="text-xl font-bold text-white font-mono">{campaignDetail.metrics.totalClicks}</div>
              </div>
              <div className="p-3 rounded-xl bg-[#090C14] border border-white/[0.04]">
                <div className="text-[10px] text-slate-400 font-mono">Cliques Únicos</div>
                <div className="text-xl font-bold text-emerald-400 font-mono">{campaignDetail.metrics.uniqueClicks ?? campaignDetail.metrics.totalClicks}</div>
              </div>
              <div className="p-3 rounded-xl bg-[#090C14] border border-white/[0.04]">
                <div className="text-[10px] text-slate-400 font-mono">QR Scans</div>
                <div className="text-xl font-bold text-purple-300 font-mono">{campaignDetail.metrics.totalQrScans}</div>
              </div>
              <div className="p-3 rounded-xl bg-[#090C14] border border-white/[0.04]">
                <div className="text-[10px] text-slate-400 font-mono">Links Vinculados</div>
                <div className="text-xl font-bold text-white font-mono">{campaignDetail.metrics.totalLinks}</div>
              </div>
            </div>

            <div className="pt-2">
              <div className="text-xs font-semibold text-white mb-2">Produtos Associados (N:N)</div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {campaignDetail.campaign.campaignProducts?.length === 0 ? (
                  <div className="text-xs text-slate-500 font-mono py-2">Nenhum produto associado.</div>
                ) : (
                  campaignDetail.campaign.campaignProducts?.map((cp) => (
                    <div key={cp.product.id} className="p-2.5 rounded-xl bg-[#090C14] border border-white/[0.04] flex items-center justify-between text-xs">
                      <span className="text-white font-medium">{cp.product.name}</span>
                      <span className="badge-stitch-purple text-[10px]">{cp.product.platform}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 6: DETALHES DO PRODUTO (MÉTRICAS & OFERTAS) */}
      {/* ======================================================== */}
      {productDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-2xl bg-[#0F131F] border border-white/10 rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div>
                <span className="text-[10px] uppercase font-mono text-purple-400 font-bold">Métricas do Produto</span>
                <h3 className="text-lg font-bold text-white">{productDetail.product.name}</h3>
              </div>
              <button
                onClick={() => setProductDetail(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-[#090C14] border border-white/[0.04]">
                <div className="text-[10px] text-slate-400 font-mono">Total de Ofertas</div>
                <div className="text-xl font-bold text-white font-mono">{productDetail.metrics.totalOffers}</div>
              </div>
              <div className="p-3 rounded-xl bg-[#090C14] border border-white/[0.04]">
                <div className="text-[10px] text-slate-400 font-mono">Cliques Totais</div>
                <div className="text-xl font-bold text-emerald-400 font-mono">{productDetail.metrics.totalClicks}</div>
              </div>
              <div className="p-3 rounded-xl bg-[#090C14] border border-white/[0.04]">
                <div className="text-[10px] text-slate-400 font-mono">Cliques Únicos</div>
                <div className="text-xl font-bold text-purple-300 font-mono">{productDetail.metrics.uniqueClicks ?? productDetail.metrics.totalClicks}</div>
              </div>
              <div className="p-3 rounded-xl bg-[#090C14] border border-white/[0.04]">
                <div className="text-[10px] text-slate-400 font-mono">Comissão Confirmada</div>
                <div className="text-base font-bold text-emerald-400 font-mono">R$ {productDetail.metrics.confirmedCommission.toFixed(2)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 7: NOVA CAMPANHA / EDIÇÃO N:N */}
      {/* ======================================================== */}
      {createCampaignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-lg bg-[#0F131F] border border-white/10 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <h3 className="text-base font-bold text-white">
                {editingCampaign ? "Editar Campanha (N:N)" : "Nova Campanha de Marketing"}
              </h3>
              <button
                onClick={() => setCreateCampaignOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCampaign} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nome da Campanha</label>
                <input
                  type="text"
                  required
                  value={campName}
                  onChange={(e) => setCampName(e.target.value)}
                  placeholder="Ex: Black Friday 2026"
                  className="w-full px-3 py-2 bg-[#090C14] border border-white/[0.08] rounded-xl text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={campDescription}
                  onChange={(e) => setCampDescription(e.target.value)}
                  placeholder="Objetivos e canais desta iniciativa"
                  className="w-full px-3 py-2 bg-[#090C14] border border-white/[0.08] rounded-xl text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Vincular Produtos do Catálogo (N:N)
                </label>
                <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 rounded-xl bg-[#090C14] border border-white/[0.06]">
                  {products.length === 0 ? (
                    <div className="text-xs text-slate-500 font-mono py-2 text-center">Nenhum produto cadastrado.</div>
                  ) : (
                    products.map((p) => {
                      const isChecked = campProductIds.includes(p.id);
                      return (
                        <label key={p.id} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white/[0.04] cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setCampProductIds((prev) =>
                                prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id]
                              );
                            }}
                            className="rounded border-white/20 bg-[#121622] text-purple-600 focus:ring-0"
                          />
                          <span className="text-white">{p.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">({p.platform})</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateCampaignOpen(false)}
                  className="btn-stitch-secondary text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={campLoading}
                  className="btn-stitch-primary text-xs"
                >
                  {campLoading ? "Salvando..." : "Salvar Campanha"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 8: NOVO PRODUTO / EDIÇÃO NO CATÁLOGO */}
      {/* ======================================================== */}
      {createProductOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-[#0F131F] border border-white/10 rounded-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <h3 className="text-base font-bold text-white">
                {editingProduct ? "Editar Produto" : "Novo Produto no Catálogo"}
              </h3>
              <button
                onClick={() => {
                  setCreateProductOpen(false);
                  setEditingProduct(null);
                }}
                className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
                title="Fechar janela"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nome do Produto <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  placeholder="Ex: Fone Bluetooth Pro Max"
                  className="w-full px-3 py-2 bg-[#090C14] border border-white/[0.08] focus:border-purple-500 rounded-md text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Plataforma de Venda <span className="text-rose-400">*</span>
                </label>
                <select
                  value={prodPlatform}
                  onChange={(e) => setProdPlatform(e.target.value)}
                  className="w-full px-3 py-2 bg-[#090C14] border border-white/[0.08] focus:border-purple-500 rounded-md text-xs text-white cursor-pointer"
                >
                  {predefinedPlatforms.map((plat) => (
                    <option key={plat} value={plat}>
                      {plat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Campo dinâmico quando selecionado 'Outra plataforma' */}
              {prodPlatform === "Outra plataforma" && (
                <div className="animate-in fade-in">
                  <label className="block text-xs font-medium text-purple-300 mb-1">
                    Nome da Plataforma Personalizada
                  </label>
                  <input
                    type="text"
                    required
                    value={customPlatformName}
                    onChange={(e) => setCustomPlatformName(e.target.value)}
                    placeholder="Ex: Nuvemshop, Shopify, Loja Própria..."
                    className="w-full px-3 py-2 bg-[#090C14] border border-purple-500/40 focus:border-purple-500 rounded-md text-xs text-white"
                  />
                </div>
              )}

              {/* Oferta Inicial apenas na criação de novo produto */}
              {!editingProduct && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      URL da Oferta Inicial (Link de Afiliado) <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="url"
                      required
                      value={prodOfferUrl}
                      onChange={(e) => setProdOfferUrl(e.target.value)}
                      placeholder="https://shopee.com.br/produto-exemplo?afiliado=123"
                      className="w-full px-3 py-2 bg-[#090C14] border border-white/[0.08] focus:border-purple-500 rounded-md text-xs text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Comissão Estimada (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={prodCommission}
                      onChange={(e) => setProdCommission(e.target.value)}
                      placeholder="Ex: 45.00"
                      className="w-full px-3 py-2 bg-[#090C14] border border-white/[0.08] focus:border-purple-500 rounded-md text-xs text-white font-mono"
                    />
                  </div>
                </>
              )}

              <div className="pt-2 flex justify-end gap-2 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => {
                    setCreateProductOpen(false);
                    setEditingProduct(null);
                  }}
                  className="btn-stitch-secondary text-xs px-3 py-1.5"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={prodLoading}
                  className="btn-stitch-primary text-xs px-4 py-1.5 disabled:opacity-50"
                >
                  {prodLoading ? "Salvando..." : editingProduct ? "Salvar Alterações" : "Cadastrar Produto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 9: NOVA OFERTA PARA PRODUTO */}
      {/* ======================================================== */}
      {addOfferProductId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-[#0F131F] border border-white/10 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <h3 className="text-base font-bold text-white">Nova Oferta do Produto</h3>
              <button
                onClick={() => setAddOfferProductId(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateOffer} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nome da Oferta</label>
                <input
                  type="text"
                  required
                  value={offerName}
                  onChange={(e) => setOfferName(e.target.value)}
                  placeholder="Ex: Oferta Black Friday / Upsell"
                  className="w-full px-3 py-2 bg-[#090C14] border border-white/[0.08] rounded-xl text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Link de Afiliado da Oferta</label>
                <input
                  type="url"
                  required
                  value={offerUrl}
                  onChange={(e) => setOfferUrl(e.target.value)}
                  placeholder="https://pay.kiwify.com.br/promo-upsell"
                  className="w-full px-3 py-2 bg-[#090C14] border border-white/[0.08] rounded-xl text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Comissão (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={offerCommission}
                  onChange={(e) => setOfferCommission(e.target.value)}
                  placeholder="97.00"
                  className="w-full px-3 py-2 bg-[#090C14] border border-white/[0.08] rounded-xl text-xs text-white font-mono"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAddOfferProductId(null)}
                  className="btn-stitch-secondary text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={offerLoading}
                  className="btn-stitch-primary text-xs"
                >
                  {offerLoading ? "Adicionando..." : "Salvar Oferta"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0B0E17] flex items-center justify-center">
          <div className="flex items-center gap-3 text-purple-400 font-mono text-xs">
            <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <span>Carregando telemetria Linkzivo...</span>
          </div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}

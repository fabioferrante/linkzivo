"use client";

import { useEffect, useState, useTransition, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  Calendar,
  History,
  X,
  Clock,
  User,
  Filter,
  RefreshCw,
  AlertCircle,
  ChevronRight,
  Monitor,
  Tag,
  Pause,
  Play,
  Power,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { formatBrDateTime } from "@/lib/date";

export interface LinkHistoryItem {
  id: string;
  smartLinkId: string;
  previousUrl: string;
  newUrl: string;
  changedAt: string;
  changedByUserId: string | null;
  changedByUserName?: string;
}

interface SmartLinkItem {
  id: string;
  slug: string;
  title: string | null;
  destinationUrl: string;
  clickCount: number;
  qrScanCount: number;
  status: string;
  createdAt: string;
  history?: LinkHistoryItem[];
  qrCode?: { fgColor: string; bgColor: string } | null;
  product?: { id: string; name: string } | null;
  offer?: { id: string; name: string; affiliateUrl?: string } | null;
  campaign?: { id: string; name: string } | null;
  channel?: { id: string; name: string } | null;
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

interface CampaignItem {
  id: string;
  name: string;
  status: string;
  description: string | null;
  budget?: number | null;
  smartLinks?: SmartLinkItem[];
  campaignProducts?: Array<{
    product: {
      id: string;
      name: string;
      platform: string;
      status: string;
    };
  }>;
  _count?: {
    smartLinks: number;
    conversions: number;
    campaignProducts?: number;
  };
}

interface ProductOffer {
  id: string;
  productId: string;
  name: string;
  affiliateUrl: string;
  commissionType: string | null;
  commissionValue: number | null;
  currency: string;
  status: string;
}

interface ProductItem {
  id: string;
  name: string;
  platform: string;
  status: string;
  description?: string | null;
  category?: string | null;
  brand?: string | null;
  offers?: ProductOffer[];
  smartLinks?: SmartLinkItem[];
  campaignProducts?: Array<{
    campaign: {
      id: string;
      name: string;
      status: string;
    };
  }>;
  _count?: {
    campaigns?: number;
    smartLinks: number;
  };
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

  // Sincroniza activeTab quando o parâmetro da URL mudar (ex: ao clicar nos botões da Navbar)
  useEffect(() => {
    if (
      tabParam === "campaigns" ||
      tabParam === "analytics" ||
      tabParam === "links" ||
      tabParam === "products" ||
      tabParam === "overview"
    ) {
      setActiveTab(tabParam);
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

  // Estado para destaque do dia no gráfico de telemetria
  const [hoveredDay, setHoveredDay] = useState<{
    date: string;
    label: string;
    clicks: number;
    qrScans: number;
  } | null>(null);

  // Dados da conta
  const [links, setLinks] = useState<SmartLinkItem[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  // Estados de Carregamento e Erro
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modais
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Modal de Edição de Link
  const [editingLink, setEditingLink] = useState<SmartLinkItem | null>(null);
  const [editDestinationUrl, setEditDestinationUrl] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editCampaignId, setEditCampaignId] = useState("");
  const [editProductId, setEditProductId] = useState("");
  const [editOfferId, setEditOfferId] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // Filtros de status de ciclo de vida
  const [linkFilter, setLinkFilter] = useState<"all" | "ACTIVE" | "PAUSED">("all");
  const [campaignFilter, setCampaignFilter] = useState<"all" | "ACTIVE" | "ENDED">("all");
  const [productFilter, setProductFilter] = useState<"all" | "ACTIVE" | "INACTIVE">("all");
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

  // Formulário de Criação de Link
  const [newUrl, setNewUrl] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedOfferId, setSelectedOfferId] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Formulário de Criação de Produto
  const [createProductOpen, setCreateProductOpen] = useState(false);
  const [prodName, setProdName] = useState("");
  const [prodPlatform, setProdPlatform] = useState("Hotmart");
  const [prodOfferUrl, setProdOfferUrl] = useState("");
  const [prodCommission, setProdCommission] = useState("");

  // Formulário de Criação / Edição de Campanha
  const [createCampaignOpen, setCreateCampaignOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<CampaignItem | null>(null);
  const [campName, setCampName] = useState("");
  const [campDescription, setCampDescription] = useState("");
  const [campStatus, setCampStatus] = useState("ACTIVE");
  const [campProductIds, setCampProductIds] = useState<string[]>([]);
  const [campLinkIds, setCampLinkIds] = useState<string[]>([]);
  const [campLoading, setCampLoading] = useState(false);

  // Carregamento inicial de todos os dados essenciais com no-store para evitar falsos deslogados
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

      const [linksRes, campRes, prodRes, anaRes] = await Promise.all([
        fetch("/api/links"),
        fetch("/api/campaigns"),
        fetch("/api/products"),
        fetch(`/api/analytics?period=${selectedPeriod}`),
      ]);

      if (!linksRes.ok || !campRes.ok || !prodRes.ok || !anaRes.ok) {
        throw new Error("Falha ao comunicar com os serviços do painel.");
      }

      const [linksData, campData, prodData, anaData] = await Promise.all([
        linksRes.json(),
        campRes.json(),
        prodRes.json(),
        anaRes.json(),
      ]);

      setLinks(linksData.links || []);
      setCampaigns(campData.campaigns || []);
      setProducts(prodData.products || []);
      setAnalytics(anaData);
    } catch (err: unknown) {
      console.error("[Dashboard Fetch Error]", err);
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar os dados. Verifique a conexão e tente novamente."
      );
    } finally {
      setLoading(false);
      setAnalyticsLoading(false);
    }
  };

  // Carregamento de Analytics isolado ao trocar o filtro de período
  const fetchAnalyticsOnly = async (newPeriod: "7d" | "30d" | "90d" | "all") => {
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`/api/analytics?period=${newPeriod}`);
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

  const handleOpenHistory = async (link: SmartLinkItem) => {
    setHistoryModalLink(link);
    setHistoryItems(link.history || []);
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

  const handleSaveEditLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLink || !editDestinationUrl.trim()) return;

    setEditLoading(true);
    try {
      const res = await fetch(`/api/links/${editingLink.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinationUrl: editDestinationUrl.trim(),
          title: editTitle.trim() || undefined,
          campaignId: editCampaignId || null,
          productId: editProductId || null,
          offerId: editOfferId || null,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        alert(d.error || "Erro ao atualizar");
        return;
      }

      setEditingLink(null);
      fetchAllData(period);
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
      fetchAllData(period);
    } catch (e) {
      console.error(e);
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

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("Deseja excluir este produto? Os links associados serão preservados.")) return;
    try {
      await fetch(`/api/products/${id}`, { method: "DELETE" });
      fetchAllData(period);
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
          offerId: selectedOfferId || undefined,
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
      setSelectedProductId("");
      setSelectedOfferId("");
      setSelectedCampaignId("");
      fetchAllData(period);
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
        fetchAllData(period);
      }
    } catch (e) {
      console.error(e);
    }
  };

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

  // Handlers de Ciclo de Vida: Smart Links (Pausar / Reativar)
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

  // Handlers de Ciclo de Vida: Campanhas (Encerrar / Reiniciar)
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

  // Handlers de Ciclo de Vida: Produtos (Desativar / Reativar)
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

  // Abertura do formulário de criação de campanha
  const handleOpenCreateCampaign = () => {
    setEditingCampaign(null);
    setCampName("");
    setCampDescription("");
    setCampProductIds([]);
    setCampLinkIds([]);
    setCampStatus("ACTIVE");
    setCreateCampaignOpen(true);
  };

  // Abertura do formulário de edição de campanha
  const handleOpenEditCampaign = (camp: CampaignItem) => {
    setEditingCampaign(camp);
    setCampName(camp.name);
    setCampDescription(camp.description || "");
    setCampProductIds(camp.campaignProducts?.map((cp) => cp.product.id) || []);
    setCampLinkIds(camp.smartLinks?.map((l) => l.id) || []);
    setCampStatus(camp.status || "ACTIVE");
    setCreateCampaignOpen(true);
  };

  // Salvar campanha (criação ou edição com sincronização de múltiplos produtos e links)
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
      setEditingCampaign(null);
      setCampName("");
      setCampDescription("");
      setCampProductIds([]);
      setCampLinkIds([]);
      fetchAllData(period);
      if (editingCampaign && campaignDetail && campaignDetail.campaign.id === editingCampaign.id) {
        handleOpenCampaignDetails(editingCampaign.id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCampLoading(false);
    }
  };

  // Alternar produto na seleção da campanha
  const handleToggleCampProduct = (prodId: string) => {
    setCampProductIds((prev) =>
      prev.includes(prodId) ? prev.filter((id) => id !== prodId) : [...prev, prodId]
    );
  };

  // Alternar link na seleção da campanha
  const handleToggleCampLink = (linkId: string) => {
    setCampLinkIds((prev) =>
      prev.includes(linkId) ? prev.filter((id) => id !== linkId) : [...prev, linkId]
    );
  };

  // Ofertas disponíveis do produto selecionado no modal de criação
  const selectedProductObj = products.find((p) => p.id === selectedProductId);
  const editingProductObj = products.find((p) => p.id === editProductId);

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0F19] text-slate-100">
      <Navbar user={user} onOpenAuth={() => setAuthModalOpen(true)} />

      <div className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        {/* Banner do Workspace (sem botão de sair duplicado, seguindo requisito 2) */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10 text-[#4267E9]">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white">
                  Painel de Operações &amp; Campanhas
                </h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#4267E9]/20 text-[#4267E9] font-mono font-medium">
                  {user ? user.workspacePlan : "DEMO"}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Acompanhe o tráfego em tempo real, gerencie campanhas e atribua ofertas de afiliados.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 w-full sm:w-auto">
            <button
              onClick={() => setCreateModalOpen(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-[#4267E9] hover:bg-[#3556D4] text-white font-medium text-xs rounded-lg transition-colors cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Criar Smart Link</span>
            </button>
          </div>
        </div>

        {/* Alerta de Erro com Ação de Tentar Novamente */}
        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 mb-6 flex items-center justify-between gap-3 text-xs text-rose-300">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => fetchAllData(period)}
              className="flex items-center gap-1 px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 rounded font-medium transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Tentar novamente</span>
            </button>
          </div>
        )}

        {/* Filtro de Período Global (Requisito 4) */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Filter className="w-3.5 h-3.5 text-[#4267E9]" />
            <span className="font-medium text-slate-300">Janela Temporal:</span>
            {analyticsLoading && (
              <span className="text-[11px] text-[#4267E9] flex items-center gap-1 font-mono animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin" /> Atualizando...
              </span>
            )}
          </div>

          <div className="inline-flex p-1 rounded-lg bg-slate-900 border border-slate-800 text-xs font-medium">
            <button
              onClick={() => handlePeriodChange("7d")}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                period === "7d"
                  ? "bg-[#4267E9] text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              7 dias
            </button>
            <button
              onClick={() => handlePeriodChange("30d")}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                period === "30d"
                  ? "bg-[#4267E9] text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              30 dias
            </button>
            <button
              onClick={() => handlePeriodChange("90d")}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                period === "90d"
                  ? "bg-[#4267E9] text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              90 dias
            </button>
            <button
              onClick={() => handlePeriodChange("all")}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                period === "all"
                  ? "bg-[#4267E9] text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Histórico Completo
            </button>
          </div>
        </div>

        {/* Métricas Principais (Cards em rounded-xl, escala 4px, com Skeleton discreto) */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Card 1: Total de Cliques */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2 text-xs">
              <span>Total de Cliques</span>
              <Activity className="w-4 h-4 text-[#4267E9]" />
            </div>
            {loading ? (
              <div className="h-8 w-24 bg-slate-800/60 rounded animate-pulse my-1" />
            ) : (
              <div className="text-2xl font-bold text-white font-mono">
                {analytics?.totalClicks ?? 0}
              </div>
            )}
            <span className="text-[11px] text-emerald-400 font-medium block mt-1">
              {period === "all" ? "Todo o histórico" : `Últimos ${period}`}
            </span>
          </div>

          {/* Card 2: Scans de QR Code */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2 text-xs">
              <span>Scans de QR Code</span>
              <QrCode className="w-4 h-4 text-sky-400" />
            </div>
            {loading ? (
              <div className="h-8 w-20 bg-slate-800/60 rounded animate-pulse my-1" />
            ) : (
              <div className="text-2xl font-bold text-white font-mono">
                {analytics?.totalQrScans ?? 0}
              </div>
            )}
            <span className="text-[11px] text-sky-400 font-medium block mt-1">
              Tráfego físico verificado
            </span>
          </div>

          {/* Card 3: Smart Links Criados */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2 text-xs">
              <span>Smart Links</span>
              <Link2 className="w-4 h-4 text-amber-400" />
            </div>
            {loading ? (
              <div className="h-8 w-16 bg-slate-800/60 rounded animate-pulse my-1" />
            ) : (
              <div className="text-2xl font-bold text-white font-mono">
                {analytics?.totalLinks ?? links.length}
              </div>
            )}
            <span className="text-[11px] text-slate-400 block mt-1">
              Destinos mutáveis ativos
            </span>
          </div>

          {/* Card 4: Comissão (Distinção clara entre Confirmada e Estimada - Requisito 2 e 6) */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2 text-xs">
              <span>Comissão Confirmada</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            {loading ? (
              <div className="h-8 w-28 bg-slate-800/60 rounded animate-pulse my-1" />
            ) : (
              <div className="text-2xl font-bold text-emerald-400 font-mono">
                R$ {(analytics?.confirmedCommission ?? 0).toFixed(2).replace(".", ",")}
              </div>
            )}
            <div className="text-[11px] text-slate-400 flex items-center justify-between mt-1">
              <span>Estimada:</span>
              <span className="text-amber-400/90 font-mono">
                R$ {(analytics?.estimatedCommission ?? 0).toFixed(2).replace(".", ",")}
              </span>
            </div>
          </div>
        </div>

        {/* Barra de Navegação por Abas (Mantendo as 4 abas originais + Visão Geral Consolidada) */}
        <div className="border-b border-slate-800 flex items-center gap-6 mb-6 overflow-x-auto scrollbar-none">
          <button
            onClick={() => handleTabChange("overview")}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === "overview"
                ? "border-[#4267E9] text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Visão Geral</span>
          </button>

          <button
            onClick={() => handleTabChange("links")}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === "links"
                ? "border-[#4267E9] text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Link2 className="w-4 h-4" />
            <span>Smart Links ({links.length})</span>
          </button>

          <button
            onClick={() => handleTabChange("campaigns")}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === "campaigns"
                ? "border-[#4267E9] text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Campanhas ({campaigns.length})</span>
          </button>

          <button
            onClick={() => handleTabChange("products")}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === "products"
                ? "border-[#4267E9] text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Produtos ({products.length})</span>
          </button>

          <button
            onClick={() => handleTabChange("analytics")}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === "analytics"
                ? "border-[#4267E9] text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Analytics Detalhado</span>
          </button>
        </div>

        {/* =========================================================================
            ABA 1: VISÃO GERAL CONSOLIDADA (Requisito 2)
            ========================================================================= */}
        {activeTab === "overview" && (
          <div className="space-y-8">
            {/* Seção 1: Evolução dos Cliques ao Longo do Tempo (Gráfico Diário Confiável) */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-6">
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#4267E9]" />
                    Evolução Diária de Cliques &amp; Scans
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Frequência de tráfego dia a dia nos últimos {period === "all" ? "30 dias" : period}.
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs font-mono">
                  {hoveredDay ? (
                    <div className="flex items-center gap-2 px-3 py-1 rounded bg-[#4267E9]/15 border border-[#4267E9]/40 text-xs font-mono text-white animate-fade-in shadow-sm">
                      <span className="text-[#4267E9] font-semibold">{hoveredDay.label}:</span>
                      <span className="text-white font-bold">{hoveredDay.clicks} cliques</span>
                      {hoveredDay.qrScans > 0 && (
                        <span className="text-sky-400 font-semibold">({hoveredDay.qrScans} QR)</span>
                      )}
                    </div>
                  ) : (
                    <>
                      <span className="flex items-center gap-1.5 text-slate-300">
                        <span className="w-3 h-3 rounded bg-[#4267E9]" />
                        Cliques Diretos
                      </span>
                      <span className="flex items-center gap-1.5 text-sky-400">
                        <span className="w-3 h-3 rounded bg-sky-400" />
                        QR Scans
                      </span>
                    </>
                  )}
                </div>
              </div>

              {loading || analyticsLoading ? (
                <div className="h-44 w-full bg-slate-800/30 rounded-lg animate-pulse flex items-center justify-center text-xs text-slate-500">
                  Carregando telemetria...
                </div>
              ) : !analytics?.dailyTimeline || analytics.dailyTimeline.every((d) => d.clicks === 0) ? (
                <div className="py-12 text-center rounded-lg border border-dashed border-slate-800 bg-slate-950/40">
                  <Activity className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
                  <p className="text-xs font-medium text-slate-300">
                    Nenhum tráfego registrado no período selecionado
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                    Compartilhe seus Smart Links ou escaneie um QR Code para começar a visualizar a evolução temporal de cliques.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="h-56 flex items-end gap-1.5 sm:gap-2 pt-14 pb-2 px-1 overflow-x-auto relative">
                    {(() => {
                      const maxClicks = Math.max(
                        ...analytics.dailyTimeline.map((d) => d.clicks),
                        1
                      );
                      return analytics.dailyTimeline.map((d, idx) => {
                        const heightPct = Math.max((d.clicks / maxClicks) * 100, 6);
                        const isQr = d.qrScans > 0;
                        return (
                          <div
                            key={idx}
                            onMouseEnter={() => setHoveredDay(d)}
                            onMouseLeave={() => setHoveredDay(null)}
                            className="flex-1 flex flex-col items-center justify-end h-full min-w-[20px] group relative group-hover:z-30 cursor-pointer"
                          >
                            {/* Tooltip ao passar o mouse: posicionado com folga garantida no topo interno do container para evitar corte */}
                            <div className="absolute top-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-950/95 border border-slate-700 text-[11px] text-white font-mono px-2.5 py-1 rounded-md shadow-2xl pointer-events-none whitespace-nowrap z-30">
                              {d.label}: {d.clicks} clique(s) {isQr ? `(${d.qrScans} QR)` : ""}
                            </div>

                            {/* Barra Diária */}
                            <div
                              style={{ height: `${heightPct}%` }}
                              className={`w-full rounded-t transition-all ${
                                isQr
                                  ? "bg-gradient-to-t from-[#4267E9] to-sky-400 group-hover:brightness-125"
                                  : "bg-[#4267E9] hover:bg-[#5b7ef8]"
                              }`}
                            />
                            <span className="text-[9px] font-mono text-slate-500 mt-2 truncate">
                              {d.label}
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* Seção 2: Grid Duplo (Desempenho por Dispositivo & Desempenho de Campanhas) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Desempenho por Dispositivo */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-[#4267E9]" />
                    Distribuição por Dispositivo
                  </span>
                  <span className="text-xs text-slate-500 font-mono font-normal">
                    {analytics?.totalClicks ?? 0} total
                  </span>
                </h3>

                {analytics?.deviceBreakdown?.length ? (
                  <div className="space-y-4">
                    {analytics.deviceBreakdown.map((item, i) => (
                      <div key={i}>
                        <div className="flex justify-between text-xs font-mono text-slate-300 mb-1">
                          <span className="flex items-center gap-1.5">
                            {item.name === "Desktop" ? (
                              <Monitor className="w-3.5 h-3.5 text-slate-400" />
                            ) : (
                              <Smartphone className="w-3.5 h-3.5 text-sky-400" />
                            )}
                            {item.name}
                          </span>
                          <span>
                            {item.count} ({item.pct}%)
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-950 rounded-lg overflow-hidden">
                          <div
                            className={`h-full rounded-lg ${
                              item.name === "Mobile" ? "bg-sky-400" : "bg-[#4267E9]"
                            }`}
                            style={{ width: `${item.pct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 text-center py-8">
                    Aguardando primeiros acessos no período.
                  </div>
                )}
              </div>

              {/* Desempenho de Campanhas Ativas */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    Desempenho de Campanhas
                  </h3>
                  <button
                    onClick={() => handleTabChange("campaigns")}
                    className="text-xs text-[#4267E9] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    Ver todas <ChevronRight className="w-3 h-3" />
                  </button>
                </div>

                {campaigns.length === 0 ? (
                  <div className="text-xs text-slate-500 text-center py-8">
                    Nenhuma campanha criada ainda. Crie campanhas para agrupar canais de tráfego.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {campaigns.slice(0, 4).map((camp) => {
                      const campClicks =
                        analytics?.campaignPerformance?.find((c) => c.id === camp.id)?.clicks || 0;
                      return (
                        <div
                          key={camp.id}
                          onClick={() => handleOpenCampaignDetails(camp.id)}
                          className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800/80 hover:border-slate-700 transition-colors cursor-pointer"
                        >
                          <div>
                            <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                              <span>{camp.name}</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                {camp.status}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {camp._count?.smartLinks || 0} links vinculados
                            </div>
                          </div>
                          <div className="text-right font-mono">
                            <span className="text-xs font-semibold text-white block">
                              {campClicks}
                            </span>
                            <span className="text-[10px] text-slate-500">cliques</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Seção 3: Desempenho de Produtos e Ofertas */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-amber-400" />
                  Produtos &amp; Ofertas no Período
                </h3>
                <button
                  onClick={() => handleTabChange("products")}
                  className="text-xs text-[#4267E9] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  Gerenciar catálogo <ChevronRight className="w-3 h-3" />
                </button>
              </div>

              {products.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-8">
                  Nenhum produto cadastrado no catálogo. Adicione produtos para vincular às suas ofertas de afiliados.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {products.slice(0, 3).map((prod) => {
                    const prodClicks =
                      analytics?.productPerformance?.find((p) => p.id === prod.id)?.clicks || 0;
                    return (
                      <div
                        key={prod.id}
                        onClick={() => handleOpenProductDetails(prod.id)}
                        className="p-4 bg-slate-950 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-semibold text-white truncate max-w-[150px]">
                            {prod.name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-[#4267E9] border border-blue-500/20 font-medium">
                            {prod.platform}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex justify-between mt-2 font-mono">
                          <span>{prod.offers?.length || 0} oferta(s)</span>
                          <span className="text-white font-semibold">{prodClicks} cliques</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Seção 4: Smart Links Recentes ou de Maior Atividade */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-[#4267E9]" />
                  Smart Links de Maior Atividade
                </h3>
                <button
                  onClick={() => handleTabChange("links")}
                  className="text-xs text-[#4267E9] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  Ver todos os {links.length} links <ChevronRight className="w-3 h-3" />
                </button>
              </div>

              {links.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-8">
                  Nenhum Smart Link criado. Crie seu primeiro link para gerar tráfego e atribuição.
                </div>
              ) : (
                <div className="divide-y divide-slate-800/80">
                  {links.slice(0, 5).map((link) => (
                    <div
                      key={link.id}
                      className="py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold font-mono text-white">
                            /{link.slug}
                          </span>
                          {link.title && (
                            <span className="text-[11px] text-slate-400 truncate max-w-xs">
                              • {link.title}
                            </span>
                          )}
                          {link.campaign && (
                            <span className="text-[10px] bg-[#4267E9]/15 text-[#4267E9] px-1.5 py-0.2 rounded font-medium border border-[#4267E9]/30">
                              {link.campaign.name}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono truncate max-w-md mt-0.5">
                          {link.destinationUrl}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0 font-mono text-xs">
                        <div className="text-right">
                          <span className="font-semibold text-white">{link.clickCount}</span>
                          <span className="text-slate-500 text-[10px] ml-1">cliques</span>
                        </div>
                        <div className="text-right">
                          <span className="font-semibold text-sky-400">{link.qrScanCount}</span>
                          <span className="text-slate-500 text-[10px] ml-1">scans</span>
                        </div>
                        <button
                          onClick={() => handleCopy(link.slug, link.id)}
                          className="p-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded border border-slate-800 cursor-pointer"
                          title="Copiar link"
                        >
                          {copiedId === link.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-[#4267E9]" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            ABA 2: SMART LINKS (Gestão Completa de Links e Ciclo de Vida)
            ========================================================================= */}
        {activeTab === "links" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
              <div>
                <h2 className="text-base font-semibold text-white">Smart Links</h2>
                <p className="text-xs text-slate-400">
                  Gerencie links curtos, destinos dinâmicos, ciclo de vida e atribuição a campanhas.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* Filtro de Status de Links */}
                <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                  <button
                    onClick={() => setLinkFilter("all")}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      linkFilter === "all"
                        ? "bg-[#4267E9] text-white font-medium"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Todos ({links.length})
                  </button>
                  <button
                    onClick={() => setLinkFilter("ACTIVE")}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      linkFilter === "ACTIVE"
                        ? "bg-emerald-600 text-white font-medium"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Ativos ({links.filter((l) => l.status !== "PAUSED").length})
                  </button>
                  <button
                    onClick={() => setLinkFilter("PAUSED")}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      linkFilter === "PAUSED"
                        ? "bg-amber-600 text-white font-medium"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Pausados ({links.filter((l) => l.status === "PAUSED").length})
                  </button>
                </div>

                <button
                  onClick={() => setCreateModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4267E9] hover:bg-[#3556D4] text-white text-xs font-medium rounded-lg transition-colors cursor-pointer shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Novo Link
                </button>
              </div>
            </div>

            {(() => {
              const filteredLinks = links.filter((l) => {
                if (linkFilter === "ACTIVE") return l.status !== "PAUSED";
                if (linkFilter === "PAUSED") return l.status === "PAUSED";
                return true;
              });

              if (filteredLinks.length === 0) {
                return (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-12 text-center">
                    <Link2 className="w-10 h-10 text-[#4267E9] mx-auto mb-3 opacity-60" />
                    <h3 className="text-base font-semibold text-white mb-1">
                      {linkFilter === "all"
                        ? "Nenhum Smart Link criado ainda"
                        : `Nenhum Smart Link com status "${linkFilter === "ACTIVE" ? "Ativo" : "Pausado"}"`}
                    </h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto mb-6">
                      Encurte uma URL para gerar seu primeiro link com QR Code dinâmico e rastreamento.
                    </p>
                    {linkFilter === "all" && (
                      <button
                        onClick={() => setCreateModalOpen(true)}
                        className="px-4 py-2 bg-[#4267E9] hover:bg-[#3556D4] text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                      >
                        Criar Primeiro Link
                      </button>
                    )}
                  </div>
                );
              }

              return (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden shadow-sm">
                  <div className="divide-y divide-slate-800">
                    {filteredLinks.map((link) => (
                      <div
                        key={link.id}
                        className={`p-4 sm:p-6 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                          link.status === "PAUSED"
                            ? "bg-amber-950/10 hover:bg-amber-950/20 border-l-2 border-l-amber-500"
                            : "hover:bg-slate-800/40"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-sm font-semibold font-mono text-white hover:text-[#4267E9] transition-colors">
                              /{link.slug}
                            </span>
                            {link.title && (
                              <span className="text-xs text-slate-400 truncate max-w-xs">
                                • {link.title}
                              </span>
                            )}

                            {/* Badge de Status de Ciclo de Vida */}
                            {link.status === "PAUSED" ? (
                              <span className="text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded font-medium flex items-center gap-1">
                                <Pause className="w-2.5 h-2.5" /> Pausado
                              </span>
                            ) : (
                              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-medium flex items-center gap-1">
                                <CheckCircle2 className="w-2.5 h-2.5" /> Ativo
                              </span>
                            )}

                            {link.campaign && (
                              <span className="text-[10px] bg-[#4267E9]/15 text-[#4267E9] px-2 py-0.5 rounded font-medium border border-[#4267E9]/30">
                                Campanha: {link.campaign.name}
                              </span>
                            )}
                            {link.product && (
                              <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded font-medium border border-amber-500/20">
                                Produto: {link.product.name}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-slate-400 truncate">
                            <span className="text-slate-500">Destino:</span>
                            <a
                              href={link.destinationUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-300 font-mono truncate max-w-md underline hover:text-[#4267E9]"
                            >
                              {link.destinationUrl}
                            </a>
                            {link.status === "PAUSED" && (
                              <span className="text-[11px] text-amber-400/90 font-sans italic ml-1">
                                (Redirecionamento bloqueado com segurança)
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono mt-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span>Criado em: {formatBrDateTime(link.createdAt)}</span>
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
                            {/* Ação de Ciclo de Vida: Pausar / Reativar */}
                            <button
                              onClick={() => handleToggleLinkStatus(link)}
                              disabled={lifecycleActionLoading === link.id}
                              className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                                link.status === "PAUSED"
                                  ? "bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border-emerald-800/80"
                                  : "bg-slate-950 hover:bg-amber-950/40 text-slate-300 hover:text-amber-400 border-slate-800"
                              }`}
                              title={
                                link.status === "PAUSED"
                                  ? "Reativar link curto"
                                  : "Pausar link (Interrompe redirecionamento público)"
                              }
                            >
                              {link.status === "PAUSED" ? (
                                <Play className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <Pause className="w-4 h-4 text-amber-400" />
                              )}
                            </button>

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
                              onClick={() => handleOpenHistory(link)}
                              className="p-2 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-purple-400 rounded-lg border border-slate-800 transition-colors cursor-pointer"
                              title="Ver Histórico de Alterações"
                            >
                              <History className="w-4 h-4 text-purple-400" />
                            </button>

                            <button
                              onClick={() => {
                                setEditingLink(link);
                                setEditDestinationUrl(link.destinationUrl);
                                setEditTitle(link.title || "");
                                setEditCampaignId(link.campaign?.id || "");
                                setEditProductId(link.product?.id || "");
                                setEditOfferId(link.offer?.id || "");
                              }}
                              className="p-2 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-800 transition-colors cursor-pointer"
                              title="Editar Destino e Associações"
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
              );
            })()}
          </div>
        )}

        {/* =========================================================================
            ABA 3: CAMPANHAS (Agrupamento Real & Ciclo de Vida)
            ========================================================================= */}
        {activeTab === "campaigns" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
              <div>
                <h2 className="text-base font-semibold text-white">Campanhas</h2>
                <p className="text-xs text-slate-400">
                  Agrupe múltiplos produtos e Smart Links para auditar tráfego de lançamentos e canais.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* Filtro de Status de Campanhas */}
                <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                  <button
                    onClick={() => setCampaignFilter("all")}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      campaignFilter === "all"
                        ? "bg-[#4267E9] text-white font-medium"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Todas ({campaigns.length})
                  </button>
                  <button
                    onClick={() => setCampaignFilter("ACTIVE")}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      campaignFilter === "ACTIVE"
                        ? "bg-emerald-600 text-white font-medium"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Ativas ({campaigns.filter((c) => c.status === "ACTIVE").length})
                  </button>
                  <button
                    onClick={() => setCampaignFilter("ENDED")}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      campaignFilter === "ENDED"
                        ? "bg-amber-600 text-white font-medium"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Encerradas ({campaigns.filter((c) => c.status === "ENDED").length})
                  </button>
                </div>

                <button
                  onClick={handleOpenCreateCampaign}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4267E9] hover:bg-[#3556D4] text-white text-xs font-medium rounded-lg transition-colors cursor-pointer shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nova Campanha
                </button>
              </div>
            </div>

            {(() => {
              const filteredCampaigns = campaigns.filter((c) => {
                if (campaignFilter === "ACTIVE") return c.status === "ACTIVE";
                if (campaignFilter === "ENDED") return c.status === "ENDED";
                return true;
              });

              if (filteredCampaigns.length === 0) {
                return (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-12 text-center text-slate-400 text-xs">
                    <Layers className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
                    {campaignFilter === "all"
                      ? "Nenhuma campanha criada. Crie campanhas para organizar o tráfego dos seus produtos e afiliados."
                      : `Nenhuma campanha com status "${campaignFilter === "ACTIVE" ? "Ativa" : "Encerrada"}".`}
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredCampaigns.map((camp) => (
                    <div
                      key={camp.id}
                      className={`rounded-xl border bg-slate-900/50 p-6 flex flex-col justify-between transition-colors ${
                        camp.status === "ENDED"
                          ? "border-slate-800/80 bg-slate-950/40 opacity-80"
                          : "border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-semibold text-white truncate max-w-[180px]">
                            {camp.name}
                          </h3>
                          {camp.status === "ENDED" ? (
                            <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-medium border border-slate-700 flex items-center gap-1">
                              <Power className="w-2.5 h-2.5 text-slate-400" /> Encerrada
                            </span>
                          ) : (
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-medium border border-emerald-500/20 flex items-center gap-1">
                              <CheckCircle2 className="w-2.5 h-2.5" /> Ativa
                            </span>
                          )}
                        </div>
                        {camp.description && (
                          <p className="text-xs text-slate-400 mb-3 line-clamp-2">{camp.description}</p>
                        )}
                      </div>

                      <div>
                        <div className="text-[11px] text-slate-400 pt-3 border-t border-slate-800 flex justify-between font-mono mb-3">
                          <span>Produtos: <strong className="text-slate-200">{camp.campaignProducts?.length || 0}</strong></span>
                          <span>Links: <strong className="text-slate-200">{camp._count?.smartLinks || 0}</strong></span>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => handleOpenCampaignDetails(camp.id)}
                            className="flex-1 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded text-xs font-medium transition-colors cursor-pointer text-center"
                          >
                            Ver Detalhes
                          </button>
                          <button
                            onClick={() => handleOpenEditCampaign(camp)}
                            className="p-1.5 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-amber-400 border border-slate-800 rounded cursor-pointer"
                            title="Editar Associações"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleCampaignStatus(camp.id, camp.status)}
                            disabled={lifecycleActionLoading === camp.id}
                            className={`p-1.5 rounded border transition-colors cursor-pointer ${
                              camp.status === "ENDED"
                                ? "bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border-emerald-800/80"
                                : "bg-slate-950 hover:bg-amber-950/40 text-slate-400 hover:text-amber-400 border-slate-800"
                            }`}
                            title={camp.status === "ENDED" ? "Reiniciar Campanha" : "Encerrar Campanha"}
                          >
                            {camp.status === "ENDED" ? (
                              <Play className="w-3.5 h-3.5" />
                            ) : (
                              <Power className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() => handleDeleteCampaign(camp.id)}
                            className="p-1.5 bg-slate-950 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-800 rounded cursor-pointer"
                            title="Excluir Campanha"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* =========================================================================
            ABA 4: PRODUTOS & OFERTAS (Catálogo & Ciclo de Vida)
            ========================================================================= */}
        {activeTab === "products" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
              <div>
                <h2 className="text-base font-semibold text-white">Catálogo de Produtos &amp; Ofertas</h2>
                <p className="text-xs text-slate-400">
                  Gerencie produtos, comissões e ofertas atribuíveis a múltiplas campanhas.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* Filtro de Status de Produtos */}
                <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                  <button
                    onClick={() => setProductFilter("all")}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      productFilter === "all"
                        ? "bg-[#4267E9] text-white font-medium"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Todos ({products.length})
                  </button>
                  <button
                    onClick={() => setProductFilter("ACTIVE")}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      productFilter === "ACTIVE"
                        ? "bg-emerald-600 text-white font-medium"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Ativos ({products.filter((p) => p.status !== "INACTIVE").length})
                  </button>
                  <button
                    onClick={() => setProductFilter("INACTIVE")}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      productFilter === "INACTIVE"
                        ? "bg-rose-600 text-white font-medium"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Desativados ({products.filter((p) => p.status === "INACTIVE").length})
                  </button>
                </div>

                <button
                  onClick={() => setCreateProductOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4267E9] hover:bg-[#3556D4] text-white text-xs font-medium rounded-lg transition-colors cursor-pointer shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Cadastrar Produto
                </button>
              </div>
            </div>

            {(() => {
              const filteredProducts = products.filter((p) => {
                if (productFilter === "ACTIVE") return p.status !== "INACTIVE";
                if (productFilter === "INACTIVE") return p.status === "INACTIVE";
                return true;
              });

              if (filteredProducts.length === 0) {
                return (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-12 text-center text-slate-400 text-xs">
                    <ShoppingBag className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
                    {productFilter === "all"
                      ? "Nenhum produto cadastrado no catálogo. Adicione ofertas para vinculá-las nos seus Smart Links."
                      : `Nenhum produto com status "${productFilter === "ACTIVE" ? "Ativo" : "Desativado"}".`}
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredProducts.map((prod) => (
                    <div
                      key={prod.id}
                      className={`rounded-xl border bg-slate-900/50 p-6 flex flex-col justify-between transition-colors ${
                        prod.status === "INACTIVE"
                          ? "border-rose-950/60 bg-slate-950/40 opacity-80"
                          : "border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-semibold text-white truncate max-w-[150px]">
                            {prod.name}
                          </h3>
                          <div className="flex items-center gap-1.5">
                            {prod.status === "INACTIVE" ? (
                              <span className="text-[10px] bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded font-medium border border-rose-500/20">
                                Desativado
                              </span>
                            ) : (
                              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-medium border border-emerald-500/20">
                                Ativo
                              </span>
                            )}
                            <span className="text-[10px] bg-[#4267E9]/15 text-[#4267E9] px-2 py-0.5 rounded font-medium border border-[#4267E9]/30">
                              {prod.platform}
                            </span>
                          </div>
                        </div>

                        <div className="text-xs text-slate-400 mb-3 space-y-1">
                          {prod.offers && prod.offers.length > 0 ? (
                            <div>
                              <span className="text-slate-500">Oferta principal:</span> R${" "}
                              {prod.offers[0].commissionValue?.toFixed(2) || "0,00"}
                            </div>
                          ) : (
                            <div className="text-slate-500">Nenhuma oferta vinculada</div>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] text-slate-400 pt-3 border-t border-slate-800 flex justify-between font-mono mb-3">
                          <span>Campanhas: <strong className="text-slate-200">{prod.campaignProducts?.length || 0}</strong></span>
                          <span>Links: <strong className="text-slate-200">{prod._count?.smartLinks || 0}</strong></span>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => handleOpenProductDetails(prod.id)}
                            className="flex-1 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded text-xs font-medium transition-colors cursor-pointer text-center"
                          >
                            Ver Detalhes
                          </button>
                          <button
                            onClick={() => handleToggleProductStatus(prod.id, prod.status)}
                            disabled={lifecycleActionLoading === prod.id}
                            className={`p-1.5 rounded border transition-colors cursor-pointer ${
                              prod.status === "INACTIVE"
                                ? "bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border-emerald-800/80"
                                : "bg-slate-950 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border-slate-800"
                            }`}
                            title={prod.status === "INACTIVE" ? "Reativar Produto" : "Desativar Produto"}
                          >
                            {prod.status === "INACTIVE" ? (
                              <Play className="w-3.5 h-3.5" />
                            ) : (
                              <Power className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(prod.id)}
                            className="p-1.5 bg-slate-950 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-800 rounded cursor-pointer"
                            title="Excluir Produto"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* =========================================================================
            ABA 5: ANALYTICS DETALHADO (Requisito 7)
            ========================================================================= */}
        {activeTab === "analytics" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Dispositivos */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-[#4267E9]" />
                  Dispositivos
                </h3>
                {analytics?.deviceBreakdown?.length ? (
                  <div className="space-y-3">
                    {analytics.deviceBreakdown.map((item, i) => (
                      <div key={i}>
                        <div className="flex justify-between text-xs font-mono text-slate-300 mb-1">
                          <span>{item.name}</span>
                          <span>{item.count} ({item.pct}%)</span>
                        </div>
                        <div className="w-full h-2 bg-slate-950 rounded-lg overflow-hidden">
                          <div
                            className="h-full bg-[#4267E9] rounded-lg"
                            style={{ width: `${item.pct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 text-center py-6">
                    Sem dados no período selecionado.
                  </div>
                )}
              </div>

              {/* Sistemas Operacionais */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-sky-400" />
                  Sistemas Operacionais
                </h3>
                {analytics?.osBreakdown?.length ? (
                  <div className="space-y-3">
                    {analytics.osBreakdown.map((item, i) => (
                      <div key={i}>
                        <div className="flex justify-between text-xs font-mono text-slate-300 mb-1">
                          <span>{item.name}</span>
                          <span>{item.count} ({item.pct}%)</span>
                        </div>
                        <div className="w-full h-2 bg-slate-950 rounded-lg overflow-hidden">
                          <div
                            className="h-full bg-sky-400 rounded-lg"
                            style={{ width: `${item.pct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 text-center py-6">
                    Sem dados no período selecionado.
                  </div>
                )}
              </div>

              {/* Países de Origem */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  Origem Geográfica
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
                    Nenhum tráfego geográfico registrado.
                  </div>
                )}
              </div>
            </div>

            {/* Tabela de Cliques Recentes Auditáveis */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-400" />
                Registros Recentes de Cliques no Período
              </h3>
              {analytics?.recentClicks?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="text-slate-400 border-b border-slate-800 pb-2">
                      <tr>
                        <th className="pb-2">Slug</th>
                        <th className="pb-2">Dispositivo</th>
                        <th className="pb-2">Sistema</th>
                        <th className="pb-2">Navegador</th>
                        <th className="pb-2">Origem</th>
                        <th className="pb-2">Data/Hora</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {analytics.recentClicks.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-800/20">
                          <td className="py-2.5 text-white font-semibold">/{c.slug}</td>
                          <td className="py-2.5">{c.device || "N/A"}</td>
                          <td className="py-2.5">{c.os || "N/A"}</td>
                          <td className="py-2.5">{c.browser || "N/A"}</td>
                          <td className="py-2.5">
                            {c.isQrScan ? (
                              <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[10px]">
                                QR Scan
                              </span>
                            ) : (
                              <span className="text-slate-500">Direto</span>
                            )}
                          </td>
                          <td className="py-2.5 text-slate-400">
                            {formatBrDateTime(c.timestamp)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-xs text-slate-500 text-center py-6">
                  Nenhum registro de clique no período.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          MODAL: CRIAR SMART LINK (Com associação a Campanha e Produto/Oferta)
          ========================================================================= */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 max-w-lg w-full shadow-lg">
            <h3 className="text-base font-semibold text-white mb-1">Criar Novo Smart Link</h3>
            <p className="text-xs text-slate-400 mb-4">
              Defina o destino e conecte opcionalmente aos seus produtos e campanhas.
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

              {/* Seletor de Campanha */}
              {campaigns.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Associar à Campanha (Opcional)
                  </label>
                  <select
                    value={selectedCampaignId}
                    onChange={(e) => setSelectedCampaignId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 outline-none focus:border-[#4267E9]"
                  >
                    <option value="">Sem campanha (Avulso)</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Seletor de Produto e Oferta Específica (Requisito 6) */}
              {products.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Vincular a Produto (Opcional)
                    </label>
                    <select
                      value={selectedProductId}
                      onChange={(e) => {
                        const pId = e.target.value;
                        setSelectedProductId(pId);
                        setSelectedOfferId("");
                      }}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 outline-none focus:border-[#4267E9]"
                    >
                      <option value="">Nenhum produto</option>
                      {products
                        .filter((p) => p.status !== "INACTIVE")
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.platform})
                          </option>
                        ))}
                    </select>
                  </div>

                  {selectedProductObj && (
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Oferta Específica
                      </label>
                      <select
                        value={selectedOfferId}
                        onChange={(e) => {
                          const offId = e.target.value;
                          setSelectedOfferId(offId);
                          const off = selectedProductObj.offers?.find((o) => o.id === offId);
                          if (off && !newUrl) {
                            setNewUrl(off.affiliateUrl);
                          }
                        }}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 outline-none focus:border-[#4267E9]"
                      >
                        <option value="">Selecione uma oferta</option>
                        {selectedProductObj.offers?.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name} (R$ {o.commissionValue || 0})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
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
                  className="flex-1 py-2 bg-slate-800 text-slate-300 text-xs font-medium rounded-lg cursor-pointer hover:bg-slate-700"
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

      {/* =========================================================================
          MODAL: EDITAR DESTINO E ASSOCIAÇÕES DO LINK (Requisitos 5, 6, 8)
          ========================================================================= */}
      {editingLink && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 max-w-md w-full shadow-lg">
            <h3 className="text-base font-semibold text-white mb-1">
              Editar Smart Link
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              O slug <span className="text-[#4267E9] font-mono">/{editingLink.slug}</span> e o QR Code
              permanecem idênticos. O histórico de destinos anteriores será auditado.
            </p>

            <form onSubmit={handleSaveEditLink} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  URL de Destino *
                </label>
                <input
                  type="text"
                  required
                  value={editDestinationUrl}
                  onChange={(e) => setEditDestinationUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 outline-none focus:border-[#4267E9]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Título
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Nome do link"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 outline-none focus:border-[#4267E9]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Campanha
                </label>
                <select
                  value={editCampaignId}
                  onChange={(e) => setEditCampaignId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 outline-none focus:border-[#4267E9]"
                >
                  <option value="">Sem campanha (Avulso)</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.status === "ENDED" ? "(Encerrada)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Produto
                  </label>
                  <select
                    value={editProductId}
                    onChange={(e) => {
                      setEditProductId(e.target.value);
                      setEditOfferId("");
                    }}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 outline-none focus:border-[#4267E9]"
                  >
                    <option value="">Nenhum</option>
                    {products
                      .filter((p) => p.status !== "INACTIVE" || p.id === editProductId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.status === "INACTIVE" ? "(Desativado)" : ""}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Oferta
                  </label>
                  <select
                    value={editOfferId}
                    onChange={(e) => setEditOfferId(e.target.value)}
                    disabled={!editingProductObj}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 outline-none focus:border-[#4267E9]"
                  >
                    <option value="">Nenhuma</option>
                    {editingProductObj?.offers?.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
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
                  {editLoading ? "Salvando..." : "Salvar Alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: DETALHES DA CAMPANHA (Requisito 5 & Ciclo de Vida)
          ========================================================================= */}
      {campaignDetail && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 max-w-2xl w-full shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-white">
                    {campaignDetail.campaign.name}
                  </h3>
                  {campaignDetail.campaign.status === "ENDED" ? (
                    <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-medium border border-slate-700 flex items-center gap-1">
                      <Power className="w-2.5 h-2.5" /> Encerrada
                    </span>
                  ) : (
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-medium border border-emerald-500/20 flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5" /> Ativa
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {campaignDetail.campaign.description || "Sem descrição informada."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    handleOpenEditCampaign(campaignDetail.campaign);
                  }}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg border border-slate-700 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                  Editar Associações
                </button>
                <button
                  onClick={() => setCampaignDetail(null)}
                  className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Ação de Ciclo de Vida */}
            <div className="py-2.5 px-3 my-2 rounded-lg bg-slate-950/70 border border-slate-800/80 flex items-center justify-between text-xs shrink-0">
              <span className="text-slate-400">
                {campaignDetail.campaign.status === "ENDED"
                  ? "Esta campanha está encerrada. Links e métricas continuam preservados no histórico."
                  : "Campanha em andamento. Links e métricas ativas."}
              </span>
              <button
                onClick={() =>
                  handleToggleCampaignStatus(
                    campaignDetail.campaign.id,
                    campaignDetail.campaign.status
                  )
                }
                disabled={lifecycleActionLoading === campaignDetail.campaign.id}
                className={`px-3 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer flex items-center gap-1.5 ${
                  campaignDetail.campaign.status === "ENDED"
                    ? "bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 border-emerald-800"
                    : "bg-amber-950/50 hover:bg-amber-900/60 text-amber-300 border-amber-800"
                }`}
              >
                {campaignDetail.campaign.status === "ENDED" ? (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    Reiniciar Campanha
                  </>
                ) : (
                  <>
                    <Power className="w-3.5 h-3.5" />
                    Encerrar Campanha
                  </>
                )}
              </button>
            </div>

            {/* Grid de Métricas Reais Consolidadas */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-3 border-b border-slate-800 text-center font-mono shrink-0">
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <span className="block text-[10px] text-slate-500">Cliques Totais</span>
                <span className="text-base font-bold text-white">
                  {campaignDetail.metrics.totalClicks}
                </span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <span className="block text-[10px] text-slate-500">Cliques Únicos</span>
                <span className="text-base font-bold text-[#4267E9]">
                  {campaignDetail.metrics.uniqueClicks ?? campaignDetail.metrics.totalClicks}
                </span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <span className="block text-[10px] text-slate-500">QR Scans</span>
                <span className="text-base font-bold text-sky-400">
                  {campaignDetail.metrics.totalQrScans}
                </span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <span className="block text-[10px] text-slate-500">Comissão Confirmada</span>
                <span className="text-base font-bold text-emerald-400">
                  R$ {campaignDetail.metrics.confirmedCommission?.toFixed(2) || "0.00"}
                </span>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 py-3 space-y-4 pr-1">
              {/* Produtos Participantes da Campanha */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
                    Produtos Participantes ({campaignDetail.campaign.campaignProducts?.length || 0}):
                  </h4>
                  <button
                    onClick={() => handleOpenEditCampaign(campaignDetail.campaign)}
                    className="text-[11px] text-[#4267E9] hover:underline cursor-pointer"
                  >
                    + Vincular Produtos
                  </button>
                </div>

                {!campaignDetail.campaign.campaignProducts?.length ? (
                  <div className="text-xs text-slate-500 p-3 bg-slate-950/60 rounded border border-dashed border-slate-800 text-center">
                    Nenhum produto associado diretamente a esta campanha ainda.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {campaignDetail.campaign.campaignProducts.map((cp) => (
                      <div
                        key={cp.product.id}
                        className="p-2.5 bg-slate-950 rounded border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-white truncate block">
                            {cp.product.name}
                          </span>
                          <span className="text-[10px] text-[#4267E9] font-mono">
                            {cp.product.platform}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {cp.product.status === "INACTIVE" && (
                            <span className="text-[9px] bg-rose-500/10 text-rose-400 px-1 py-0.2 rounded border border-rose-500/20">
                              Desativado
                            </span>
                          )}
                          <button
                            onClick={() => {
                              setCampaignDetail(null);
                              handleOpenProductDetails(cp.product.id);
                            }}
                            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded cursor-pointer"
                            title="Ver detalhes do produto"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Smart Links Associados */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 text-[#4267E9]" />
                    Smart Links Associados ({campaignDetail.campaign.smartLinks?.length || 0}):
                  </h4>
                  <button
                    onClick={() => handleOpenEditCampaign(campaignDetail.campaign)}
                    className="text-[11px] text-[#4267E9] hover:underline cursor-pointer"
                  >
                    + Vincular Links
                  </button>
                </div>

                {!campaignDetail.campaign.smartLinks?.length ? (
                  <div className="text-xs text-slate-500 p-3 bg-slate-950/60 rounded border border-dashed border-slate-800 text-center">
                    Nenhum Smart Link associado a esta campanha ainda.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {campaignDetail.campaign.smartLinks.map((l) => (
                      <div
                        key={l.id}
                        className="p-2.5 bg-slate-950 rounded border border-slate-800 flex items-center justify-between text-xs font-mono"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-white font-semibold">/{l.slug}</span>
                            {l.title && <span className="text-slate-400 truncate">({l.title})</span>}
                            {l.status === "PAUSED" && (
                              <span className="text-[9px] bg-amber-500/15 text-amber-400 px-1.5 py-0.2 rounded border border-amber-500/30 font-sans">
                                Pausado
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500 truncate block mt-0.5">
                            {l.destinationUrl}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ml-2">
                          <span className="text-slate-300 font-semibold">{l.clickCount} cliques</span>
                          <span className="text-sky-400">{l.qrScanCount} scans</span>
                          <button
                            onClick={() => handleCopy(l.slug, l.id)}
                            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded cursor-pointer"
                            title="Copiar link"
                          >
                            {copiedId === l.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-[#4267E9]" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setCampaignDetail(null)}
                className="px-4 py-2 bg-slate-800 text-slate-200 text-xs font-medium rounded-lg cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: DETALHES DO PRODUTO & OFERTAS (Requisito 6 & Ciclo de Vida)
          ========================================================================= */}
      {productDetail && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 max-w-xl w-full shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-white">
                    {productDetail.product.name}
                  </h3>
                  {productDetail.product.status === "INACTIVE" ? (
                    <span className="text-[10px] bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded font-medium border border-rose-500/20">
                      Desativado
                    </span>
                  ) : (
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-medium border border-emerald-500/20">
                      Ativo
                    </span>
                  )}
                </div>
                <span className="text-xs text-[#4267E9]">
                  Plataforma: {productDetail.product.platform}
                </span>
              </div>
              <button
                onClick={() => setProductDetail(null)}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Ação de Ciclo de Vida: Desativar / Reativar */}
            <div className="py-2.5 px-3 my-2 rounded-lg bg-slate-950/70 border border-slate-800/80 flex items-center justify-between text-xs shrink-0">
              <span className="text-slate-400">
                {productDetail.product.status === "INACTIVE"
                  ? "Produto desativado para novas campanhas. Links existentes continuam ativos."
                  : "Produto ativo e disponível para seleção em campanhas."}
              </span>
              <button
                onClick={() =>
                  handleToggleProductStatus(
                    productDetail.product.id,
                    productDetail.product.status
                  )
                }
                disabled={lifecycleActionLoading === productDetail.product.id}
                className={`px-3 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer flex items-center gap-1.5 ${
                  productDetail.product.status === "INACTIVE"
                    ? "bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 border-emerald-800"
                    : "bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border-rose-800"
                }`}
              >
                {productDetail.product.status === "INACTIVE" ? (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    Reativar Produto
                  </>
                ) : (
                  <>
                    <Power className="w-3.5 h-3.5" />
                    Desativar Produto
                  </>
                )}
              </button>
            </div>

            {/* Grid de Métricas Consolidadas */}
            <div className="grid grid-cols-4 gap-2 py-3 border-b border-slate-800 text-center font-mono shrink-0">
              <div className="bg-slate-950 p-2 rounded border border-slate-800">
                <span className="block text-[10px] text-slate-500">Ofertas</span>
                <span className="text-sm font-bold text-white">
                  {productDetail.metrics.totalOffers}
                </span>
              </div>
              <div className="bg-slate-950 p-2 rounded border border-slate-800">
                <span className="block text-[10px] text-slate-500">Links</span>
                <span className="text-sm font-bold text-white">
                  {productDetail.metrics.totalLinks}
                </span>
              </div>
              <div className="bg-slate-950 p-2 rounded border border-slate-800">
                <span className="block text-[10px] text-slate-500">Cliques</span>
                <span className="text-sm font-bold text-[#4267E9]">
                  {productDetail.metrics.totalClicks}
                </span>
              </div>
              <div className="bg-slate-950 p-2 rounded border border-slate-800">
                <span className="block text-[10px] text-slate-500">Confirmada</span>
                <span className="text-sm font-bold text-emerald-400">
                  R$ {productDetail.metrics.confirmedCommission?.toFixed(2) || "0.00"}
                </span>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 py-3 space-y-4 pr-1">
              {/* Campanhas em que este produto participa */}
              <div>
                <h4 className="text-xs font-semibold text-slate-200 mb-2 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  Campanhas Participantes ({productDetail.product.campaignProducts?.length || 0}):
                </h4>
                {!productDetail.product.campaignProducts?.length ? (
                  <div className="text-xs text-slate-500 p-3 bg-slate-950/60 rounded border border-dashed border-slate-800 text-center">
                    Este produto ainda não foi vinculado a nenhuma campanha.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {productDetail.product.campaignProducts.map((cp) => (
                      <div
                        key={cp.campaign.id}
                        className="p-2.5 bg-slate-950 rounded border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-semibold text-white block">
                            {cp.campaign.name}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Status: {cp.campaign.status === "ENDED" ? "Encerrada" : "Ativa"}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            setProductDetail(null);
                            handleOpenCampaignDetails(cp.campaign.id);
                          }}
                          className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded cursor-pointer"
                          title="Ver detalhes da campanha"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Ofertas Disponíveis */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-sky-400" />
                    Ofertas &amp; Checkouts Cadastrados ({productDetail.product.offers?.length || 0}):
                  </h4>
                  <button
                    onClick={() => {
                      setAddOfferProductId(productDetail.product.id);
                    }}
                    className="px-2 py-1 bg-[#4267E9] text-white text-[11px] font-medium rounded hover:bg-[#3556D4] cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Adicionar Oferta
                  </button>
                </div>

                {!productDetail.product.offers?.length ? (
                  <div className="text-xs text-slate-500 p-3 bg-slate-950/60 rounded border border-dashed border-slate-800 text-center">
                    Nenhuma oferta cadastrada para este produto.
                  </div>
                ) : (
                  productDetail.product.offers.map((off) => (
                    <div
                      key={off.id}
                      className="p-3 bg-slate-950 rounded border border-slate-800 space-y-1 text-xs mb-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white">{off.name}</span>
                        <span className="text-emerald-400 font-mono font-medium">
                          Comissão: R$ {off.commissionValue?.toFixed(2) || "0.00"}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono truncate">
                        {off.affiliateUrl}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setProductDetail(null)}
                className="px-4 py-2 bg-slate-800 text-slate-200 text-xs font-medium rounded-lg cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: ADICIONAR OFERTA A PRODUTO
          ========================================================================= */}
      {addOfferProductId && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 max-w-md w-full shadow-lg">
            <h3 className="text-base font-semibold text-white mb-1">Nova Oferta</h3>
            <p className="text-xs text-slate-400 mb-4">
              Cadastre um checkout ou link de afiliado específico para este produto.
            </p>

            <form onSubmit={handleCreateOffer} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nome da Oferta *
                </label>
                <input
                  type="text"
                  required
                  value={offerName}
                  onChange={(e) => setOfferName(e.target.value)}
                  placeholder="Ex: Checkout Black Friday / Upsell"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 outline-none focus:border-[#4267E9]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  URL de Afiliado / Checkout *
                </label>
                <input
                  type="text"
                  required
                  value={offerUrl}
                  onChange={(e) => setOfferUrl(e.target.value)}
                  placeholder="https://go.hotmart.com/XYZ987"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 outline-none focus:border-[#4267E9]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Valor da Comissão (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={offerCommission}
                  onChange={(e) => setOfferCommission(e.target.value)}
                  placeholder="150.00"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 outline-none focus:border-[#4267E9]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddOfferProductId(null)}
                  className="flex-1 py-2 bg-slate-800 text-slate-300 text-xs font-medium rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={offerLoading}
                  className="flex-1 py-2 bg-[#4267E9] hover:bg-[#3556D4] text-white text-xs font-medium rounded-lg cursor-pointer"
                >
                  {offerLoading ? "Salvando..." : "Salvar Oferta"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: QR CODE DINÂMICO
          ========================================================================= */}
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
                  className="flex-1 py-2 px-3 bg-[#4267E9] text-white text-xs font-medium rounded-lg transition-colors cursor-pointer text-center"
                >
                  Baixar PNG
                </a>
              )}
              <a
                href={`/api/links/${qrModalLink.id}/qr?format=svg`}
                download
                className="flex-1 py-2 px-3 bg-slate-800 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-colors cursor-pointer text-center"
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

      {/* =========================================================================
          MODAL: CRIAR PRODUTO NO LINK VAULT
          ========================================================================= */}
      {createProductOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 max-w-md w-full shadow-lg">
            <h3 className="text-base font-semibold text-white mb-1">
              Cadastrar Produto no Catálogo
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Salve ofertas da Hotmart, Kiwify ou Eduzz para reaproveitar em seus Smart Links.
            </p>

            <form onSubmit={handleCreateProduct} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nome do Produto *
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
                  Link de Checkout / Afiliado (Oferta Principal) *
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

      {/* =========================================================================
          MODAL: CRIAR / EDITAR CAMPANHA & ASSOCIAÇÕES (Requisito 4 & 5)
          ========================================================================= */}
      {createCampaignOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 max-w-xl w-full shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <div>
                <h3 className="text-base font-semibold text-white">
                  {editingCampaign ? "Editar Campanha & Associações" : "Nova Campanha"}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {editingCampaign
                    ? "Altere os dados, associe produtos do catálogo e Smart Links a esta iniciativa."
                    : "Agrupe múltiplos produtos e links para auditar tráfego de lançamentos e canais."}
                </p>
              </div>
              <button
                onClick={() => {
                  setCreateCampaignOpen(false);
                  setEditingCampaign(null);
                }}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCampaign} className="overflow-y-auto flex-1 py-4 space-y-4 pr-1">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nome da Campanha *
                </label>
                <input
                  type="text"
                  required
                  value={campName}
                  onChange={(e) => setCampName(e.target.value)}
                  placeholder="Ex: Black Friday 2026 / Lançamento Tráfego Pago"
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
                  placeholder="Estratégia e contexto para divulgação de ofertas."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 outline-none focus:border-[#4267E9]"
                  rows={2}
                />
              </div>

              {editingCampaign && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Estado do Ciclo de Vida
                  </label>
                  <select
                    value={campStatus}
                    onChange={(e) => setCampStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 outline-none focus:border-[#4267E9]"
                  >
                    <option value="ACTIVE">Ativa (Em andamento)</option>
                    <option value="ENDED">Encerrada (Histórico preservado)</option>
                  </select>
                </div>
              )}

              {/* Seleção Múltipla de Produtos (Somente produtos ativos podem ser associados) */}
              <div className="pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
                    Produtos Participantes ({campProductIds.length} selecionado{campProductIds.length === 1 ? "" : "s"})
                  </label>
                  <span className="text-[11px] text-slate-500">
                    Apenas produtos ativos
                  </span>
                </div>

                {(() => {
                  const activeProds = products.filter((p) => p.status !== "INACTIVE");
                  if (activeProds.length === 0) {
                    return (
                      <div className="p-3 bg-slate-950/60 rounded-lg border border-dashed border-slate-800 text-center text-xs text-slate-400">
                        Nenhum produto ativo disponível. Cadastre ou reative produtos no catálogo.
                      </div>
                    );
                  }
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                      {activeProds.map((prod) => {
                        const isSelected = campProductIds.includes(prod.id);
                        return (
                          <div
                            key={prod.id}
                            onClick={() => handleToggleCampProduct(prod.id)}
                            className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all flex items-center justify-between ${
                              isSelected
                                ? "bg-[#4267E9]/15 border-[#4267E9] text-white"
                                : "bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700"
                            }`}
                          >
                            <div className="min-w-0 flex-1 pr-2">
                              <span className="font-medium truncate block">{prod.name}</span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {prod.platform}
                              </span>
                            </div>
                            <div
                              className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                                isSelected
                                  ? "bg-[#4267E9] border-[#4267E9] text-white"
                                  : "border-slate-700 bg-slate-900"
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Seleção de Smart Links para Atribuição */}
              <div className="pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 text-[#4267E9]" />
                    Smart Links Vinculados ({campLinkIds.length} selecionado{campLinkIds.length === 1 ? "" : "s"})
                  </label>
                  <span className="text-[11px] text-slate-500">
                    Atribuição inequívoca
                  </span>
                </div>

                {links.length === 0 ? (
                  <div className="p-3 bg-slate-950/60 rounded-lg border border-dashed border-slate-800 text-center text-xs text-slate-400">
                    Nenhum Smart Link criado. Crie links na aba Smart Links para vinculá-los.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1 font-mono text-xs">
                    {links.map((link) => {
                      const isSelected = campLinkIds.includes(link.id);
                      const isOtherCamp = link.campaign && (!editingCampaign || link.campaign.id !== editingCampaign.id);
                      return (
                        <div
                          key={link.id}
                          onClick={() => handleToggleCampLink(link.id)}
                          className={`p-2 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                            isSelected
                              ? "bg-[#4267E9]/15 border-[#4267E9] text-white"
                              : "bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700"
                          }`}
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-200">/{link.slug}</span>
                              {link.title && (
                                <span className="text-slate-400 text-[11px] font-sans truncate">
                                  ({link.title})
                                </span>
                              )}
                              {isOtherCamp && (
                                <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded font-sans">
                                  Em: {link.campaign?.name}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-500 truncate block mt-0.5">
                              {link.destinationUrl}
                            </span>
                          </div>
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                              isSelected
                                ? "bg-[#4267E9] border-[#4267E9] text-white"
                                : "border-slate-700 bg-slate-900"
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setCreateCampaignOpen(false);
                    setEditingCampaign(null);
                  }}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={campLoading}
                  className="flex-1 py-2 bg-[#4267E9] hover:bg-[#3556D4] text-white text-xs font-medium rounded-lg cursor-pointer transition-colors"
                >
                  {campLoading ? "Salvando..." : editingCampaign ? "Salvar Alterações" : "Criar Campanha"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: HISTÓRICO DE ALTERAÇÕES (Requisito 8)
          ========================================================================= */}
      {historyModalLink && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 max-w-xl w-full shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-purple-400" />
                  <h3 className="text-base font-semibold text-white">
                    Histórico de Alterações
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Smart Link <span className="text-[#4267E9] font-mono font-semibold">/{historyModalLink.slug}</span>
                  {historyModalLink.title ? ` • ${historyModalLink.title}` : ""}
                </p>
              </div>
              <button
                onClick={() => setHistoryModalLink(null)}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-2 text-xs text-slate-400 border-b border-slate-800/60 flex items-center justify-between shrink-0">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                Criado em: <strong className="text-slate-200 font-mono">{formatBrDateTime(historyModalLink.createdAt)}</strong>
              </span>
              <span className="text-[11px] text-slate-500">
                {historyItems.length} alteração(ões) registrada(s)
              </span>
            </div>

            <div className="overflow-y-auto flex-1 py-4 space-y-3 pr-1">
              {historyLoading ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  Carregando registros de histórico...
                </div>
              ) : historyItems.length === 0 ? (
                <div className="py-8 text-center rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-6">
                  <History className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs font-medium text-slate-300">
                    Nenhuma alteração registrada
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                    O destino deste Smart Link nunca foi alterado. O redirecionamento continua apontando para a URL definida na criação original.
                  </p>
                </div>
              ) : (
                historyItems.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="p-3.5 rounded-lg border border-slate-800 bg-slate-950/60 hover:border-slate-700/80 transition-colors space-y-2"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-mono text-purple-400 font-medium flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {formatBrDateTime(item.changedAt)}
                      </span>
                      <span className="text-slate-400 flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-500" />
                        <span className="text-slate-300 font-medium">
                          {item.changedByUserName || item.changedByUserId || "Administrador"}
                        </span>
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs font-mono">
                      <div className="p-2 rounded bg-rose-950/20 border border-rose-900/30 text-rose-300 break-all">
                        <span className="text-[10px] uppercase font-sans font-semibold tracking-wider text-rose-400 block mb-0.5">
                          Destino Anterior:
                        </span>
                        {item.previousUrl}
                      </div>
                      <div className="p-2 rounded bg-emerald-950/20 border border-emerald-900/30 text-emerald-300 break-all">
                        <span className="text-[10px] uppercase font-sans font-semibold tracking-wider text-emerald-400 block mb-0.5">
                          Novo Destino:
                        </span>
                        {item.newUrl}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setHistoryModalLink(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg cursor-pointer transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Autenticação */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={() => fetchAllData(period)}
      />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0B0F19] text-slate-100 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-[#4267E9] border-t-transparent animate-spin" />
            <span className="text-xs text-slate-400 font-mono">Carregando painel de operações...</span>
          </div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}

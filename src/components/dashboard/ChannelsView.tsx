"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Radio,
  Plus,
  Edit3,
  Trash2,
  Search,
  ExternalLink,
  Layers,
  Link2,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  X,
  Loader2,
  Camera,
  MessageCircle,
  Video,
  Tv,
  Megaphone,
  Target,
  Share2,
  Globe,
  Mail,
  Send,
} from "lucide-react";

export interface ChannelItem {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  isCustom: boolean;
  createdAt: string;
  _count?: {
    smartLinks: number;
  };
}

interface ChannelsViewProps {
  shortDomain?: string;
  onNavigateToLinks?: (channelId?: string) => void;
}

const COLOR_PRESETS = [
  { name: "Roxo Linkzivo", value: "#8B5CF6" },
  { name: "Rosa Instagram", value: "#E1306C" },
  { name: "Verde WhatsApp", value: "#25D366" },
  { name: "Ciano TikTok", value: "#00F2FE" },
  { name: "Vermelho YouTube", value: "#FF0000" },
  { name: "Azul Meta Ads", value: "#0668E1" },
  { name: "Amarelo Google", value: "#FBBC05" },
  { name: "Esmeralda", value: "#10B981" },
  { name: "Laranja Vibrante", value: "#F97316" },
];

const ICON_PRESETS = [
  { id: "instagram", label: "Instagram", icon: Camera },
  { id: "message-circle", label: "WhatsApp", icon: MessageCircle },
  { id: "video", label: "TikTok", icon: Video },
  { id: "youtube", label: "YouTube", icon: Tv },
  { id: "megaphone", label: "Meta Ads", icon: Megaphone },
  { id: "target", label: "Google Ads", icon: Target },
  { id: "share-2", label: "Redes / Compartilhar", icon: Share2 },
  { id: "globe", label: "Site / Blog", icon: Globe },
  { id: "mail", label: "E-mail Marketing", icon: Mail },
  { id: "send", label: "Telegram", icon: Send },
  { id: "radio", label: "Geral", icon: Radio },
];

function renderChannelIcon(iconName: string | null | undefined, className = "w-5 h-5") {
  const match = ICON_PRESETS.find((p) => p.id === (iconName || "radio").toLowerCase());
  const IconComponent = match ? match.icon : Radio;
  return <IconComponent className={className} />;
}

export function ChannelsView({ shortDomain = "linkzivo.com", onNavigateToLinks }: ChannelsViewProps) {
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Modais de Criação/Edição e Exclusão
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<ChannelItem | null>(null);
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState("#8B5CF6");
  const [formIcon, setFormIcon] = useState("radio");
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Confirmação de Exclusão
  const [deletingChannel, setDeletingChannel] = useState<ChannelItem | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Carregamento dos Canais
  const fetchChannels = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/channels");
      if (!res.ok) {
        if (res.status === 401) {
          setError("Sessão expirada. Faça login novamente.");
          return;
        }
        throw new Error("Falha ao carregar canais.");
      }
      const data = await res.json();
      setChannels(data.channels || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido ao carregar canais.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  // Filtragem por busca
  const filteredChannels = useMemo(() => {
    if (!search.trim()) return channels;
    const term = search.toLowerCase().trim();
    return channels.filter(
      (c) => c.name.toLowerCase().includes(term) || c.slug.toLowerCase().includes(term)
    );
  }, [channels, search]);

  // Estatísticas calculadas
  const totalChannels = channels.length;
  const customChannelsCount = channels.filter((c) => c.isCustom).length;
  const totalLinkedSmartLinks = channels.reduce(
    (sum, c) => sum + (c._count?.smartLinks || 0),
    0
  );

  // Abertura do Modal de Criação
  const handleOpenCreate = () => {
    setEditingChannel(null);
    setFormName("");
    setFormColor("#8B5CF6");
    setFormIcon("radio");
    setFormError(null);
    setIsModalOpen(true);
  };

  // Abertura do Modal de Edição
  const handleOpenEdit = (channel: ChannelItem) => {
    setEditingChannel(channel);
    setFormName(channel.name);
    setFormColor(channel.color || "#8B5CF6");
    setFormIcon(channel.icon || "radio");
    setFormError(null);
    setIsModalOpen(true);
  };

  // Submissão de Formulário (Criação / Edição)
  const handleSaveChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError("Informe o nome do canal.");
      return;
    }

    try {
      setModalSubmitting(true);
      setFormError(null);

      const url = editingChannel ? `/api/channels/${editingChannel.id}` : "/api/channels";
      const method = editingChannel ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          color: formColor,
          icon: formIcon,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erro ao salvar canal.");
      }

      setIsModalOpen(false);
      await fetchChannels();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro inesperado ao salvar canal.";
      setFormError(msg);
    } finally {
      setModalSubmitting(false);
    }
  };

  // Exclusão com Validação de Segurança
  const handleConfirmDelete = async () => {
    if (!deletingChannel) return;

    try {
      setDeleteSubmitting(true);
      setDeleteError(null);

      const res = await fetch(`/api/channels/${deletingChannel.id}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Não foi possível excluir o canal.");
      }

      setDeletingChannel(null);
      await fetchChannels();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro inesperado ao excluir canal.";
      setDeleteError(msg);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Cabeçalho com Ação Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono tracking-wider uppercase text-purple-400 font-semibold mb-1 flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5" />
            Atribuição & Distribuição
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Canais de Divulgação
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Gerencie os canais de tráfego utilizados na criação e rastreamento de Smart Links.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-sm font-semibold transition-all shadow-lg shadow-purple-900/30 active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          Novo Canal
        </button>
      </div>

      {/* 2. Cards de Métricas do Ecossistema de Canais */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total de Canais */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total de Canais</span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
              <Radio className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white mt-2">
            {loading ? "..." : totalChannels}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Redes sociais, canais de anúncios e mensageria
          </div>
        </div>

        {/* Canais Personalizados */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Canais Personalizados</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white mt-2">
            {loading ? "..." : customChannelsCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Criados exclusivamente para o seu workspace
          </div>
        </div>

        {/* Links Associados */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Smart Links Atribuídos</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Link2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white mt-2">
            {loading ? "..." : totalLinkedSmartLinks}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Links ativos categorizados por canal
          </div>
        </div>
      </div>

      {/* 3. Barra de Busca e Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/40 border border-slate-800/80">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar canal por nome ou slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-950/70 border border-slate-800 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-purple-500/60 transition-colors"
          />
        </div>
        {search && (
          <button
            onClick={() => setSearch("")}
            className="px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 transition-colors"
          >
            Limpar busca
          </button>
        )}
      </div>

      {/* 4. Lista e Grid de Canais */}
      {loading ? (
        <div className="py-16 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Carregando canais de divulgação...</p>
        </div>
      ) : error ? (
        <div className="p-6 rounded-xl bg-red-950/20 border border-red-800/50 text-center">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-red-200">{error}</p>
          <button
            onClick={fetchChannels}
            className="mt-3 px-4 py-1.5 rounded-lg bg-red-600/30 hover:bg-red-600/50 text-red-200 text-xs font-medium transition-colors"
          >
            Tentar Novamente
          </button>
        </div>
      ) : filteredChannels.length === 0 ? (
        <div className="py-16 px-4 text-center rounded-2xl bg-slate-900/20 border border-dashed border-slate-800">
          <Radio className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-white">Nenhum canal encontrado</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mt-1 mb-5">
            {search
              ? "Nenhum canal corresponde ao termo de busca informado."
              : "Você ainda não possui canais cadastrados. Crie um canal para organizar seus Smart Links."}
          </p>
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-all shadow-md active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Criar Primeiro Canal
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredChannels.map((channel) => {
            const linksCount = channel._count?.smartLinks || 0;
            const channelColor = channel.color || "#8B5CF6";

            return (
              <div
                key={channel.id}
                className="p-5 rounded-xl bg-slate-900/60 border border-slate-800/90 hover:border-slate-700/80 transition-all flex flex-col justify-between group relative overflow-hidden"
              >
                {/* Indicador de cor do canal no topo */}
                <div
                  className="absolute top-0 left-0 right-0 h-1 opacity-70 group-hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: channelColor }}
                />

                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
                        style={{
                          backgroundColor: `${channelColor}18`,
                          borderColor: `${channelColor}40`,
                          color: channelColor,
                        }}
                      >
                        {renderChannelIcon(channel.icon, "w-5 h-5")}
                      </div>
                      <div>
                        <h4 className="text-base font-semibold text-white group-hover:text-purple-300 transition-colors">
                          {channel.name}
                        </h4>
                        <span className="text-xs font-mono text-slate-500 block">
                          /{channel.slug}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${
                        channel.isCustom
                          ? "bg-purple-500/10 border-purple-500/30 text-purple-400"
                          : "bg-slate-800/60 border-slate-700/50 text-slate-400"
                      }`}
                    >
                      {channel.isCustom ? "Custom" : "Padrão"}
                    </span>
                  </div>

                  {/* Informações de Vínculo */}
                  <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5 text-slate-500" />
                      Smart Links associados:
                    </span>
                    <span className="font-semibold text-white bg-slate-800 px-2 py-0.5 rounded text-xs">
                      {linksCount}
                    </span>
                  </div>
                </div>

                {/* Ações */}
                <div className="mt-4 pt-3 border-t border-slate-800/40 flex items-center justify-end gap-2">
                  <button
                    onClick={() => handleOpenEdit(channel)}
                    title="Editar canal"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => {
                      setDeleteError(null);
                      setDeletingChannel(channel);
                    }}
                    title="Excluir canal"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. Modal de Criação / Edição de Canal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 relative overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{
                    backgroundColor: `${formColor}20`,
                    color: formColor,
                  }}
                >
                  {renderChannelIcon(formIcon, "w-4 h-4")}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {editingChannel ? "Editar Canal" : "Novo Canal de Divulgação"}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {editingChannel
                      ? "Atualize as informações do canal de tráfego"
                      : "Defina o nome, ícone e cor visual do canal"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formulário */}
            <form onSubmit={handleSaveChannel} className="space-y-4 mt-5">
              {formError && (
                <div className="p-3 rounded-lg bg-red-950/40 border border-red-800 text-red-200 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Nome */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nome do Canal <span className="text-purple-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: TikTok Ads, Canal VIP Telegram, Blog Oficial"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  maxLength={60}
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              {/* Seletor de Ícone */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Ícone Representativo
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {ICON_PRESETS.map((p) => {
                    const isSelected = formIcon === p.id;
                    const IconComp = p.icon;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setFormIcon(p.id)}
                        title={p.label}
                        className={`p-2.5 rounded-lg flex items-center justify-center border transition-all ${
                          isSelected
                            ? "bg-purple-600/20 border-purple-500 text-purple-300 shadow-sm"
                            : "bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                        }`}
                      >
                        <IconComp className="w-4 h-4" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Seletor de Cores */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Cor de Identificação
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {COLOR_PRESETS.map((preset) => {
                    const isSelected = formColor.toUpperCase() === preset.value.toUpperCase();
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setFormColor(preset.value)}
                        title={preset.name}
                        className={`w-7 h-7 rounded-full transition-transform border ${
                          isSelected
                            ? "scale-110 ring-2 ring-purple-400 ring-offset-2 ring-offset-slate-900 border-white"
                            : "border-transparent hover:scale-105"
                        }`}
                        style={{ backgroundColor: preset.value }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Preview em Tempo Real */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80">
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block mb-2">
                  Pré-visualização do Canal
                </span>
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center border"
                    style={{
                      backgroundColor: `${formColor}20`,
                      borderColor: `${formColor}40`,
                      color: formColor,
                    }}
                  >
                    {renderChannelIcon(formIcon, "w-4 h-4")}
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-white block">
                      {formName.trim() || "Nome do Canal"}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      /{formName.trim() ? formName.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "slug-do-canal"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={modalSubmitting}
                  className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-sm font-semibold transition-all shadow-md active:scale-98 disabled:opacity-50"
                >
                  {modalSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Salvando...
                    </>
                  ) : editingChannel ? (
                    "Atualizar Canal"
                  ) : (
                    "Criar Canal"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Modal de Confirmação de Exclusão com Trava de Segurança */}
      {deletingChannel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 relative">
            <div className="flex items-start gap-3.5 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Excluir canal &ldquo;{deletingChannel.name}&rdquo;?
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Esta ação é irreversível e removerá o cadastro do canal do seu workspace.
                </p>
              </div>
            </div>

            {deleteError && (
              <div className="mb-4 p-3 rounded-lg bg-red-950/40 border border-red-800 text-red-200 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                <span>{deleteError}</span>
              </div>
            )}

            {/* Aviso de Trava caso haja Smart Links associados */}
            {(deletingChannel._count?.smartLinks || 0) > 0 && (
              <div className="mb-4 p-3 rounded-lg bg-amber-950/30 border border-amber-800/60 text-amber-200 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <div>
                  <strong className="block text-amber-300 font-semibold mb-0.5">
                    Exclusão Bloqueada por Segurança
                  </strong>
                  Existem <strong>{deletingChannel._count?.smartLinks}</strong> Smart Link(s) vinculados a este canal.
                  Para preservar a integridade do seu rastreamento, desvincule os links antes de excluir o canal.
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDeletingChannel(null)}
                disabled={deleteSubmitting}
                className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 transition-colors"
              >
                Voltar
              </button>

              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleteSubmitting || (deletingChannel._count?.smartLinks || 0) > 0}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all shadow-md active:scale-98"
              >
                {deleteSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  "Confirmar Exclusão"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

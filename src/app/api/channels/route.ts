import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Canais padrão do sistema semeados para novos workspaces
const DEFAULT_PRESET_CHANNELS = [
  { name: "Instagram", slug: "instagram", icon: "instagram", color: "#E1306C" },
  { name: "WhatsApp", slug: "whatsapp", icon: "message-circle", color: "#25D366" },
  { name: "TikTok", slug: "tiktok", icon: "video", color: "#00F2FE" },
  { name: "YouTube", slug: "youtube", icon: "youtube", color: "#FF0000" },
  { name: "Meta Ads", slug: "meta-ads", icon: "megaphone", color: "#0668E1" },
  { name: "Google Ads", slug: "google-ads", icon: "target", color: "#FBBC05" },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

/**
 * GET /api/channels
 * Lista todos os canais do workspace autenticado com contagem de Smart Links associados.
 * Se o workspace ainda não tiver canais, semeia de forma resiliente os canais padrão do ecossistema.
 */
export async function GET(request: NextRequest) {
  const session = await getSession(request);

  if (!session || !session.workspaceId) {
    return NextResponse.json(
      { error: "Não autenticado. Faça login para gerenciar canais de divulgação." },
      { status: 401 }
    );
  }

  const workspaceId = session.workspaceId;

  // Busca canais existentes do workspace com isolamento atômico
  let channels = await db.channel.findMany({
    where: { workspaceId },
    include: {
      _count: {
        select: { smartLinks: true },
      },
    },
    orderBy: [{ isCustom: "asc" }, { name: "asc" }],
  });

  // Se o workspace não possui canais ainda, cria os presets iniciais
  if (channels.length === 0) {
    try {
      await db.channel.createMany({
        data: DEFAULT_PRESET_CHANNELS.map((p) => ({
          workspaceId,
          name: p.name,
          slug: p.slug,
          icon: p.icon,
          color: p.color,
          isCustom: false,
        })),
        skipDuplicates: true,
      });

      channels = await db.channel.findMany({
        where: { workspaceId },
        include: {
          _count: {
            select: { smartLinks: true },
          },
        },
        orderBy: [{ isCustom: "asc" }, { name: "asc" }],
      });
    } catch {
      // Se colidir em concorrência, apenas recarrega
      channels = await db.channel.findMany({
        where: { workspaceId },
        include: {
          _count: {
            select: { smartLinks: true },
          },
        },
        orderBy: [{ isCustom: "asc" }, { name: "asc" }],
      });
    }
  }

  return NextResponse.json({
    channels,
    total: channels.length,
  });
}

/**
 * POST /api/channels
 * Cria um novo canal personalizado no workspace do usuário.
 * Valida unicidade de nome dentro do mesmo workspace e formato dos campos.
 */
export async function POST(request: NextRequest) {
  const session = await getSession(request);

  if (!session || !session.workspaceId) {
    return NextResponse.json(
      { error: "Não autenticado." },
      { status: 401 }
    );
  }

  const workspaceId = session.workspaceId;

  try {
    const body = await request.json();
    const { name, icon, color } = body;

    // 1. Validação do Nome
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "O nome do canal é obrigatório." },
        { status: 400 }
      );
    }

    const cleanName = name.trim();
    if (cleanName.length > 60) {
      return NextResponse.json(
        { error: "O nome do canal não pode exceder 60 caracteres." },
        { status: 400 }
      );
    }

    const generatedSlug = slugify(cleanName);
    if (!generatedSlug) {
      return NextResponse.json(
        { error: "Nome de canal inválido (deve conter caracteres alfanuméricos)." },
        { status: 400 }
      );
    }

    // 2. Verificação de Duplicidade no Workspace
    const existing = await db.channel.findFirst({
      where: {
        workspaceId,
        OR: [
          { name: { equals: cleanName, mode: "insensitive" } },
          { slug: generatedSlug },
        ],
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Já existe um canal com o nome '${cleanName}' neste workspace.` },
        { status: 409 }
      );
    }

    // 3. Sanitização de Cor e Ícone
    let cleanColor = typeof color === "string" ? color.trim() : null;
    if (cleanColor && !/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(cleanColor)) {
      cleanColor = "#8B5CF6"; // Roxo padrão seguro
    }

    const cleanIcon = typeof icon === "string" ? icon.trim().toLowerCase().slice(0, 40) : "radio";

    // 4. Criação do Canal com isolamento garantido
    const channel = await db.channel.create({
      data: {
        workspaceId,
        name: cleanName,
        slug: generatedSlug,
        icon: cleanIcon,
        color: cleanColor || "#8B5CF6",
        isCustom: true,
      },
      include: {
        _count: {
          select: { smartLinks: true },
        },
      },
    });

    return NextResponse.json(
      { success: true, channel },
      { status: 201 }
    );
  } catch (err: unknown) {
    console.error("[Create Channel Error]", err);
    const message = err instanceof Error ? err.message : "Erro ao criar canal.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

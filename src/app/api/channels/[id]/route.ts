import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

/**
 * GET /api/channels/[id]
 * Detalhamento individual do canal com seus Smart Links associados.
 * Isolamento multi-tenant garantido diretamente na consulta ao banco.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(request);

  if (!session || !session.workspaceId) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await params;
  const workspaceId = session.workspaceId;

  // Consulta com filtro simultâneo por id e workspaceId (prevenção atômica de IDOR)
  const channel = await db.channel.findFirst({
    where: {
      id,
      workspaceId,
    },
    include: {
      smartLinks: {
        select: {
          id: true,
          slug: true,
          title: true,
          destinationUrl: true,
          status: true,
          clickCount: true,
          qrScanCount: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
      _count: {
        select: { smartLinks: true },
      },
    },
  });

  if (!channel) {
    return NextResponse.json(
      { error: "Canal não encontrado ou acesso não autorizado." },
      { status: 404 }
    );
  }

  return NextResponse.json({ channel });
}

/**
 * PUT /api/channels/[id]
 * Atualiza nome, ícone e cor de um canal existente.
 * Valida que o canal pertence ao workspace e impede nomes duplicados.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(request);

  if (!session || !session.workspaceId) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await params;
  const workspaceId = session.workspaceId;

  // 1. Confirma existência e pertencimento ao workspace
  const existingChannel = await db.channel.findFirst({
    where: { id, workspaceId },
  });

  if (!existingChannel) {
    return NextResponse.json(
      { error: "Canal não encontrado ou acesso não autorizado." },
      { status: 404 }
    );
  }

  try {
    const body = await request.json();
    const { name, icon, color } = body;

    const dataToUpdate: {
      name?: string;
      slug?: string;
      icon?: string;
      color?: string;
    } = {};

    // 2. Validação e unicidade do novo nome (se alterado)
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json(
          { error: "O nome do canal não pode ser vazio." },
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

      const newSlug = slugify(cleanName);

      // Verifica se outro canal no mesmo workspace já usa este nome ou slug
      const duplicate = await db.channel.findFirst({
        where: {
          workspaceId,
          id: { not: id },
          OR: [
            { name: { equals: cleanName, mode: "insensitive" } },
            { slug: newSlug },
          ],
        },
      });

      if (duplicate) {
        return NextResponse.json(
          { error: `Já existe outro canal com o nome '${cleanName}' neste workspace.` },
          { status: 409 }
        );
      }

      dataToUpdate.name = cleanName;
      dataToUpdate.slug = newSlug;
    }

    if (color !== undefined) {
      let cleanColor = typeof color === "string" ? color.trim() : null;
      if (cleanColor && !/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(cleanColor)) {
        cleanColor = "#8B5CF6";
      }
      dataToUpdate.color = cleanColor || "#8B5CF6";
    }

    if (icon !== undefined) {
      dataToUpdate.icon = typeof icon === "string" ? icon.trim().toLowerCase().slice(0, 40) : "radio";
    }

    // 3. Persistência da atualização
    const updated = await db.channel.update({
      where: { id },
      data: dataToUpdate,
      include: {
        _count: {
          select: { smartLinks: true },
        },
      },
    });

    return NextResponse.json({ success: true, channel: updated });
  } catch (err: unknown) {
    console.error("[Update Channel Error]", err);
    const message = err instanceof Error ? err.message : "Erro ao atualizar canal.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * DELETE /api/channels/[id]
 * Exclui com segurança um canal.
 * 
 * Regra Mandatória de Segurança de Negócio:
 * Se o canal possuir Smart Links vinculados, a exclusão é IMPEDIDA com HTTP 409,
 * informando ao usuário quantos links estão associados e exigindo desvinculação prévia.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(request);

  if (!session || !session.workspaceId) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await params;
  const workspaceId = session.workspaceId;

  // Busca o canal garantindo que pertence ao workspace e contando vínculos ativos
  const channel = await db.channel.findFirst({
    where: { id, workspaceId },
    include: {
      _count: {
        select: { smartLinks: true },
      },
    },
  });

  if (!channel) {
    return NextResponse.json(
      { error: "Canal não encontrado ou acesso não autorizado." },
      { status: 404 }
    );
  }

  const linksCount = channel._count?.smartLinks || 0;

  // Bloqueio preventivo se houver vínculos ativos
  if (linksCount > 0) {
    return NextResponse.json(
      {
        error: `Não é possível excluir o canal '${channel.name}' porque ele possui ${linksCount} Smart Link(s) associado(s). Desvincule os links antes de excluir.`,
        code: "CHANNEL_HAS_ACTIVE_LINKS",
        linksCount,
      },
      { status: 409 }
    );
  }

  // Exclusão segura no banco
  await db.channel.delete({
    where: { id },
  });

  return NextResponse.json({
    success: true,
    message: `Canal '${channel.name}' excluído com sucesso.`,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/links/[id]/history
 * Retorna o histórico de alterações de destino do Smart Link.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const link = await db.smartLink.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      destinationUrl: true,
      workspaceId: true,
      createdAt: true,
      history: {
        orderBy: { changedAt: "desc" },
      },
    },
  });

  if (!link) {
    return NextResponse.json({ error: "Link não encontrado." }, { status: 404 });
  }

  // Proteção IDOR: Garante que o link pertence ao workspace do usuário autenticado
  if (link.workspaceId !== session.workspaceId && session.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });
  }

  // Busca os nomes/emails dos usuários responsáveis pelas alterações
  const userIds = Array.from(
    new Set(
      link.history
        .map((h) => h.changedByUserId)
        .filter((uid): uid is string => Boolean(uid))
    )
  );

  const users = userIds.length > 0
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];

  const userMap = new Map(users.map((u) => [u.id, u.name || u.email]));

  const formattedHistory = link.history.map((item) => ({
    id: item.id,
    smartLinkId: item.smartLinkId,
    previousUrl: item.previousUrl,
    newUrl: item.newUrl,
    changedAt: item.changedAt,
    changedByUserId: item.changedByUserId,
    changedByUserName: item.changedByUserId
      ? userMap.get(item.changedByUserId) || "Usuário do Workspace"
      : "Sistema / Anônimo",
  }));

  return NextResponse.json({
    link: {
      id: link.id,
      slug: link.slug,
      title: link.title,
      destinationUrl: link.destinationUrl,
      createdAt: link.createdAt,
    },
    history: formattedHistory,
  });
}

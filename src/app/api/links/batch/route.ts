import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/links/batch
 * Ações em lote seguras: pausar, reativar e excluir links selecionados.
 * Protegido por tenant/workspaceId para impedir manipulação indevida (IDOR).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !session.workspaceId) {
      return NextResponse.json(
        { error: "Sessão inválida ou expirada. Faça login novamente." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action, linkIds } = body;

    if (!Array.isArray(linkIds) || linkIds.length === 0) {
      return NextResponse.json(
        { error: "Nenhum link selecionado para a operação." },
        { status: 400 }
      );
    }

    if (!["pause", "resume", "delete"].includes(action)) {
      return NextResponse.json(
        { error: "Ação inválida. Ações permitidas: pause, resume, delete." },
        { status: 400 }
      );
    }

    // 1. Filtragem estrita dos links pertencentes ao workspace do usuário autenticado
    const ownedLinks = await db.smartLink.findMany({
      where: {
        id: { in: linkIds },
        workspaceId: session.workspaceId,
      },
      select: { id: true, status: true, slug: true },
    });

    const ownedIds = ownedLinks.map((l) => l.id);
    const unauthorizedCount = linkIds.length - ownedIds.length;

    if (ownedIds.length === 0) {
      return NextResponse.json(
        { error: "Nenhum dos links selecionados pertence à sua conta ou workspace." },
        { status: 403 }
      );
    }

    // 2. Execução da ação com base no tipo
    if (action === "pause") {
      const result = await db.smartLink.updateMany({
        where: {
          id: { in: ownedIds },
          workspaceId: session.workspaceId,
          status: "ACTIVE",
        },
        data: {
          status: "PAUSED",
        },
      });

      return NextResponse.json({
        success: true,
        action: "pause",
        affectedCount: result.count,
        unauthorizedCount,
        message: `${result.count} link(s) pausado(s) com sucesso.`,
      });
    }

    if (action === "resume") {
      const result = await db.smartLink.updateMany({
        where: {
          id: { in: ownedIds },
          workspaceId: session.workspaceId,
          status: "PAUSED",
        },
        data: {
          status: "ACTIVE",
        },
      });

      return NextResponse.json({
        success: true,
        action: "resume",
        affectedCount: result.count,
        unauthorizedCount,
        message: `${result.count} link(s) reativado(s) com sucesso.`,
      });
    }

    if (action === "delete") {
      const result = await db.smartLink.deleteMany({
        where: {
          id: { in: ownedIds },
          workspaceId: session.workspaceId,
        },
      });

      return NextResponse.json({
        success: true,
        action: "delete",
        affectedCount: result.count,
        unauthorizedCount,
        message: `${result.count} link(s) excluído(s) permanentemente.`,
      });
    }

    return NextResponse.json({ error: "Ação não processada." }, { status: 400 });
  } catch (error: any) {
    console.error("[Batch Link Action Error]", error);
    return NextResponse.json(
      { error: "Erro interno ao processar a operação em lote no banco de dados." },
      { status: 500 }
    );
  }
}

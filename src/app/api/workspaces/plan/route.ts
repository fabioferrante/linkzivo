import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { changeWorkspacePlan } from "@/lib/plans";

export const dynamic = "force-dynamic";

/**
 * POST /api/workspaces/plan
 * Executa a transição de plano (Upgrade ou Downgrade) com congelamento ou restauração atômica.
 * Protegido por autenticação de sessão e validação de propriedade do workspace.
 */
export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session || !session.id) {
    return NextResponse.json(
      { error: "Autenticação obrigatória.", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Payload JSON malformado ou ausente.", code: "INVALID_JSON" },
      { status: 400 }
    );
  }

  const { workspaceId, targetPlan } = body || {};

  if (!workspaceId || typeof workspaceId !== "string") {
    return NextResponse.json(
      { error: "O campo 'workspaceId' é obrigatório.", code: "INVALID_INPUT" },
      { status: 400 }
    );
  }

  if (!targetPlan || typeof targetPlan !== "string") {
    return NextResponse.json(
      { error: "O campo 'targetPlan' é obrigatório.", code: "INVALID_INPUT" },
      { status: 400 }
    );
  }

  const normalizedPlan = (targetPlan || "").trim().toUpperCase();

  // 1. Planos Pro e Agency são restritos e sob consulta
  if (normalizedPlan === "PRO" || normalizedPlan === "AGENCY") {
    return NextResponse.json(
      {
        error: "A contratação dos planos Pro e Agency está disponível exclusivamente sob consulta.",
        code: "FEATURE_NOT_IMPLEMENTED",
      },
      { status: 400 }
    );
  }

  // 2. Validação estrita de planos aceitos
  if (normalizedPlan !== "FREE" && normalizedPlan !== "CREATOR") {
    return NextResponse.json(
      {
        error: `Plano '${targetPlan}' é inválido. Planos permitidos: FREE ou CREATOR.`,
        code: "INVALID_PLAN",
      },
      { status: 400 }
    );
  }

  // 3. Bloqueio de Upgrade Gratuito por chamada direta de API
  // A promoção comercial para Creator exige confirmação de pagamento via gateway/checkout
  if (normalizedPlan === "CREATOR") {
    return NextResponse.json(
      {
        error: "A promoção para o plano Creator requer contratação ativa através de checkout oficial. A alteração direta de plano por API não é permitida.",
        code: "UPGRADE_PAYMENT_REQUIRED",
      },
      { status: 403 }
    );
  }

  // 4. Downgrade voluntário para o plano FREE
  const result = await changeWorkspacePlan(workspaceId, "FREE", db, {
    expectedUserId: session.id,
  });

  if (!result.success) {
    let statusCode = 400;
    if (result.code === "FORBIDDEN") {
      statusCode = 403;
    } else if (result.code === "WORKSPACE_NOT_FOUND") {
      statusCode = 404;
    } else if (result.code === "FEATURE_NOT_IMPLEMENTED") {
      statusCode = 400;
    } else if (result.code === "DATABASE_ERROR") {
      statusCode = 500;
    }

    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: statusCode }
    );
  }

  return NextResponse.json(result);
}

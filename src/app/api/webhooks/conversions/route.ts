import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  verifyWorkspaceWebhookSecret,
  normalizePostbackPayload,
  processConversionWebhook,
} from "@/lib/webhooks";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/conversions
 * Endpoint universal de ingestão segura de conversões de afiliados.
 *
 * Autenticação:
 * - Header `X-Linkzivo-Secret: lz_wh_<workspaceId>.<hmac>`
 * - Header `Authorization: Bearer lz_wh_<workspaceId>.<hmac>`
 * - Query param `?secret=lz_wh_<workspaceId>.<hmac>`
 *
 * Adaptadores suportados:
 * - Canônico Linkzivo (padrão)
 * - Hotmart Webhook 2.0 (automático ou via X-Platform: hotmart)
 * - Kiwify Webhook (automático ou via X-Platform: kiwify)
 * - Braip e Monetizze (explicitamente pendentes para fases posteriores)
 */
export async function POST(request: NextRequest) {
  // 1. Extração do segredo de autenticação
  const secretFromHeader =
    request.headers.get("x-linkzivo-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const secretFromQuery =
    request.nextUrl.searchParams.get("secret") ||
    request.nextUrl.searchParams.get("token");

  const providedSecret = (secretFromHeader || secretFromQuery || "").trim();

  if (!providedSecret) {
    return NextResponse.json(
      {
        error: "Segredo de autenticação de postback não informado. Forneça o segredo via header 'X-Linkzivo-Secret' ou parâmetro '?secret='.",
        code: "UNAUTHORIZED",
      },
      { status: 401 }
    );
  }

  // 2. Validação criptográfica do segredo via HMAC-SHA256 em tempo constante
  const verification = verifyWorkspaceWebhookSecret(providedSecret);
  if (!verification.valid || !verification.workspaceId) {
    return NextResponse.json(
      {
        error: "Segredo de webhook inválido, corrompido ou não autorizado.",
        code: "UNAUTHORIZED",
      },
      { status: 401 }
    );
  }

  const authenticatedWorkspaceId = verification.workspaceId;

  // 3. Verificação de existência do workspace no banco de dados
  const workspace = await db.workspace.findUnique({
    where: { id: authenticatedWorkspaceId },
    select: { id: true, plan: true },
  });

  if (!workspace) {
    return NextResponse.json(
      {
        error: "Workspace associado ao segredo não foi encontrado no sistema.",
        code: "WORKSPACE_NOT_FOUND",
      },
      { status: 404 }
    );
  }

  // 4. Leitura do corpo da requisição e captura de rawPayload para auditoria
  let rawBodyText = "";
  let rawBodyJson: any;

  try {
    rawBodyText = await request.text();
    rawBodyJson = JSON.parse(rawBodyText);
  } catch {
    return NextResponse.json(
      {
        error: "Corpo da requisição deve ser um JSON válido e bem-formado.",
        code: "INVALID_JSON",
      },
      { status: 400 }
    );
  }

  // 5. Normalização do Payload através dos adaptadores
  const platformHeader =
    request.headers.get("x-platform") ||
    request.nextUrl.searchParams.get("platform");

  const normalized = normalizePostbackPayload(rawBodyJson, platformHeader);

  if (!normalized.success) {
    return NextResponse.json(
      {
        error: normalized.error,
        code: normalized.code,
      },
      { status: 400 }
    );
  }

  // 6. Processamento da conversão com validação de relações, idempotência e concorrência
  const result = await processConversionWebhook(
    authenticatedWorkspaceId,
    normalized.payload,
    rawBodyText
  );

  if (!result.success) {
    return NextResponse.json(
      {
        error: result.error,
        code: result.code,
      },
      { status: result.status }
    );
  }

  const httpStatus = result.action === "CREATED" ? 201 : 200;
  return NextResponse.json(result, { status: httpStatus });
}

export async function GET() {
  return NextResponse.json(
    {
      error: "Método não permitido. O endpoint de postback aceita exclusivamente requisições HTTP POST.",
      code: "METHOD_NOT_ALLOWED",
    },
    { status: 405 }
  );
}

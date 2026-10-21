import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createOidcChallenge } from "@/lib/oidc";
import { getSession, isSecureCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json(
      {
        error: "Google OAuth não está configurado neste ambiente (GOOGLE_CLIENT_ID ausente).",
      },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const intent = searchParams.get("intent");

  let targetUserId: string | undefined;
  if (intent === "connect") {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Você precisa estar autenticado para conectar uma conta Google." },
        { status: 401 }
      );
    }
    targetUserId = session.id;
  }

  // 1. Cria o desafio OIDC no banco com PKCE (state, nonce, codeVerifier)
  const { challengeId, state, nonce, codeChallenge } = await createOidcChallenge(targetUserId);

  // 2. Define o cookie transitório opaco contendo apenas o challengeId
  const cookieStore = await cookies();
  cookieStore.set("linkzivo_oidc_flow", challengeId, {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax",
    path: "/api/auth/google/callback",
    maxAge: 300, // 5 minutos
  });

  // 3. Determina a URL base para o callback
  const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const baseUrl = rawAppUrl ? new URL(rawAppUrl).origin : new URL(request.url).origin;
  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  // 4. Monta a URL de autorização oficial do Google OIDC
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("prompt", "select_account");

  return NextResponse.redirect(authUrl.toString(), 302);
}

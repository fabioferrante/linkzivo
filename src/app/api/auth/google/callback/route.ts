import { NextRequest, NextResponse } from "next/server";
import {
  consumeOidcChallenge,
  exchangeGoogleCode,
  verifyGoogleIdToken,
  resolveGoogleIdentity,
} from "@/lib/oidc";
import { createSessionCookie, isSecureCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const googleError = searchParams.get("error");

  const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const baseUrl = rawAppUrl ? new URL(rawAppUrl).origin : new URL(request.url).origin;

  const challengeId = request.cookies.get("linkzivo_oidc_flow")?.value;

  // Helper para limpar o cookie de fluxo e redirecionar com erro amigável
  const redirectWithError = (errorCode: string) => {
    const res = NextResponse.redirect(`${baseUrl}/?auth_error=${errorCode}`, 302);
    res.cookies.set("linkzivo_oidc_flow", "", {
      httpOnly: true,
      secure: isSecureCookie(),
      sameSite: "lax",
      path: "/api/auth/google/callback",
      maxAge: 0,
      expires: new Date(0),
    });
    return res;
  };

  // 1. Tratamento de cancelamento ou erro do Google
  if (googleError) {
    return redirectWithError("google_access_denied");
  }

  // 2. Validação básica de parâmetros
  if (!code || !state || !challengeId) {
    return redirectWithError("invalid_callback_params");
  }

  // 3. Consumo atômico do desafio OIDC (valida state e elimina replay imediatamente)
  const challenge = await consumeOidcChallenge(challengeId, state);
  if (!challenge) {
    return redirectWithError("invalid_or_expired_state");
  }

  // 4. Troca do código de autorização pelo ID Token via back-channel
  const redirectUri = `${baseUrl}/api/auth/google/callback`;
  let idToken: string;
  try {
    const tokenResponse = await exchangeGoogleCode(code, challenge.codeVerifier, redirectUri);
    idToken = tokenResponse.id_token;
  } catch (err: unknown) {
    console.error("[OIDC Callback Error] Falha na troca do código de autorização:", err instanceof Error ? err.name : "ExchangeError");
    return redirectWithError("token_exchange_failed");
  }

  // 5. Validação criptográfica do ID Token com a biblioteca 'jose' (JWKS, iss, aud, azp, nonce, email_verified)
  let claims;
  try {
    claims = await verifyGoogleIdToken(idToken, challenge.nonce);
  } catch (err: unknown) {
    console.error("[OIDC Callback Error] Validação do ID Token rejeitada:", err instanceof Error ? err.message : "ValidationError");
    return redirectWithError("token_validation_failed");
  }

  // 6. Resolução segura de identidade (novo usuário, usuário existente ou bloqueio de auto-link cego)
  const resolution = await resolveGoogleIdentity(claims, challenge.targetUserId);

  if (!resolution.success || !resolution.user) {
    if (resolution.status === 409) {
      // E-mail já existe com senha: NÃO VINCULA AUTOMATICAMENTE
      return redirectWithError("account_exists_login_required");
    }
    if (resolution.status === 403) {
      return redirectWithError("account_suspended");
    }
    return redirectWithError("identity_resolution_failed");
  }

  // 7. Redirecionamento seguro para o Dashboard com criação da sessão e limpeza do cookie de fluxo
  const response = NextResponse.redirect(`${baseUrl}/dashboard`, 302);
  await createSessionCookie(resolution.user, response);

  response.cookies.set("linkzivo_oidc_flow", "", {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax",
    path: "/api/auth/google/callback",
    maxAge: 0,
    expires: new Date(0),
  });

  return response;
}

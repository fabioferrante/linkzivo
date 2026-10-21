import crypto from "crypto";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { db } from "./db";
import { normalizeEmail, getOrCreateDefaultWorkspace, SessionUser } from "./auth";
import type { OidcChallenge } from "@prisma/client";

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

const googleJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL), {
  cacheMaxAge: 1000 * 60 * 60 * 6, // 6 horas
  cooldownDuration: 1000 * 30, // 30 segundos
});

export interface GoogleClaims {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

export interface ResolveIdentityResult {
  success: boolean;
  user?: SessionUser;
  action?: "LOGGED_IN" | "CREATED" | "LINKED";
  error?: string;
  status?: number;
}

/**
 * Validação de tempo constante segura contra diferenças de tamanho de buffer (via hash SHA-256 prévio).
 */
export function timingSafeStringCompare(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const hashA = crypto.createHash("sha256").update(a, "utf8").digest();
  const hashB = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Valida se a origem da requisição corresponde estritamente ao NEXT_PUBLIC_APP_URL canônico.
 */
export function validateRequestOrigin(request: Request): boolean {
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configuredAppUrl) return false;

  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(configuredAppUrl).origin;
  } catch {
    return false;
  }

  const originHeader = request.headers.get("origin");
  const refererHeader = request.headers.get("referer");

  let candidateOrigin: string | null = null;
  if (originHeader) {
    try {
      candidateOrigin = new URL(originHeader).origin;
    } catch {
      return false;
    }
  } else if (refererHeader) {
    try {
      candidateOrigin = new URL(refererHeader).origin;
    } catch {
      return false;
    }
  } else {
    return false;
  }

  return candidateOrigin === expectedOrigin;
}

/**
 * Cria e persiste um OidcChallenge no PostgreSQL contendo state, nonce e codeVerifier do PKCE.
 * O navegador recebe apenas o challengeId opaco aleatório de 256 bits de entropia.
 */
export async function createOidcChallenge(targetUserId?: string): Promise<{
  challengeId: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}> {
  const challengeId = crypto.randomBytes(32).toString("hex");
  const state = crypto.randomBytes(32).toString("hex");
  const nonce = crypto.randomBytes(32).toString("hex");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutos de validade

  await db.oidcChallenge.create({
    data: {
      id: challengeId,
      state,
      nonce,
      codeVerifier,
      targetUserId: targetUserId || null,
      expiresAt,
    },
  });

  return { challengeId, state, nonce, codeChallenge };
}

/**
 * Consome atomicamente um OidcChallenge.
 * Se o state não corresponder, NÃO remove o desafio para evitar DoS por state forjado.
 */
export async function consumeOidcChallenge(
  challengeId: string,
  receivedState: string
): Promise<OidcChallenge | null> {
  if (!challengeId || !receivedState) return null;

  try {
    return await db.$transaction(async (tx) => {
      const challenge = await tx.oidcChallenge.findUnique({
        where: { id: challengeId },
      });

      if (!challenge) return null;
      if (challenge.expiresAt < new Date()) {
        await tx.oidcChallenge.delete({ where: { id: challengeId } }).catch(() => {});
        return null;
      }

      // Validação estrita do state com tempo constante
      if (!timingSafeStringCompare(challenge.state, receivedState)) {
        return null;
      }

      // Consumo atômico: remove o desafio legítimo para impedir qualquer replay
      await tx.oidcChallenge.delete({
        where: { id: challengeId },
      });

      return challenge;
    });
  } catch {
    return null;
  }
}

/**
 * Troca o código de autorização OIDC do Google por tokens via back-channel.
 */
export async function exchangeGoogleCode(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<{ id_token: string; access_token?: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error("[OIDC Configuration Error] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.");
  }

  const params = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`[OIDC Token Exchange Error] Google token endpoint returned HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!data.id_token || typeof data.id_token !== "string") {
    throw new Error("[OIDC Token Exchange Error] ID Token was not returned by Google.");
  }

  return { id_token: data.id_token, access_token: data.access_token };
}

/**
 * Valida a assinatura, emissor, audiência, azp, nonce e e-mail verificado do ID Token com a biblioteca 'jose'.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  expectedNonce: string,
  customJwks = googleJwks
): Promise<GoogleClaims> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error("[OIDC Configuration Error] GOOGLE_CLIENT_ID is missing.");
  }

  const { payload } = await jwtVerify(idToken, customJwks, {
    issuer: GOOGLE_ISSUERS,
    audience: clientId,
    algorithms: ["RS256"],
    clockTolerance: 10,
  });

  // Validação de azp (Authorized Party) conforme Seção 3.1.3.7 do OIDC Core 1.0
  if (payload.azp && payload.azp !== clientId) {
    throw new Error("[OIDC Security Error] azp claim does not match GOOGLE_CLIENT_ID.");
  }

  // Validação estrita do nonce
  if (!payload.nonce || !timingSafeStringCompare(String(payload.nonce), expectedNonce)) {
    throw new Error("[OIDC Security Error] ID Token nonce does not match session challenge nonce.");
  }

  // Validação obrigatória de e-mail verificado
  if (payload.email_verified !== true) {
    throw new Error("[OIDC Security Error] Google account email is not verified.");
  }

  if (!payload.sub || typeof payload.sub !== "string") {
    throw new Error("[OIDC Security Error] ID Token sub claim is missing or invalid.");
  }

  if (!payload.email || typeof payload.email !== "string") {
    throw new Error("[OIDC Security Error] ID Token email claim is missing or invalid.");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: typeof payload.name === "string" ? payload.name : undefined,
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
  };
}

/**
 * Resolução determinística da identidade Google conforme as regras de negócio:
 * 1. Se targetUserId presente: vincula à conta logada (impede roubo se já vinculada a outro).
 * 2. Se Account com 'sub' existir: autentica diretamente (se status ativo).
 * 3. Se User com 'email' coincidente existir: REJEITA vinculação cega; exige login por senha.
 * 4. Se for novo usuário: cria User + Workspace (CREATOR / OWNER) + Member + Account atomicamente.
 */
export async function resolveGoogleIdentity(
  claims: GoogleClaims,
  targetUserId?: string | null
): Promise<ResolveIdentityResult> {
  const normalizedEmail = normalizeEmail(claims.email);
  if (!normalizedEmail) {
    return { success: false, error: "Endereço de e-mail inválido retornado pelo provedor.", status: 400 };
  }

  // 1. Cenário de vinculação in-app para usuário já autenticado
  if (targetUserId) {
    const existingAccount = await db.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "google",
          providerAccountId: claims.sub,
        },
      },
    });

    if (existingAccount) {
      if (existingAccount.userId !== targetUserId) {
        return {
          success: false,
          error: "Esta conta Google já está vinculada a outro usuário do LINKZIVO.",
          status: 409,
        };
      }
      // Já vinculado a este mesmo usuário
      const user = await db.user.findUnique({
        where: { id: targetUserId },
        include: { workspace: true },
      });
      if (!user || user.status !== "ACTIVE") {
        return { success: false, error: "Conta de usuário inativa ou inexistente.", status: 403 };
      }
      const defaultWs = user.workspace || (await getOrCreateDefaultWorkspace(user.id));
      return {
        success: true,
        action: "LINKED",
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          workspaceId: defaultWs.id,
          workspaceName: defaultWs.name,
          workspacePlan: defaultWs.plan,
        },
      };
    }

    // Cria a vinculação para o usuário autenticado
    try {
      await db.account.create({
        data: {
          userId: targetUserId,
          provider: "google",
          providerAccountId: claims.sub,
          email: normalizedEmail,
        },
      });
    } catch (err: unknown) {
      const isP2002 =
        err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002";

      if (isP2002) {
        return {
          success: false,
          error: "Esta conta Google já está vinculada ou em processo de vinculação.",
          status: 409,
        };
      }

      return {
        success: false,
        error: "Falha interna ao vincular conta Google.",
        status: 500,
      };
    }

    const user = await db.user.findUnique({
      where: { id: targetUserId },
      include: { workspace: true },
    });
    if (!user || user.status !== "ACTIVE") {
      return { success: false, error: "Conta de usuário inativa.", status: 403 };
    }
    const defaultWs = user.workspace || (await getOrCreateDefaultWorkspace(user.id));
    return {
      success: true,
      action: "LINKED",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        workspaceId: defaultWs.id,
        workspaceName: defaultWs.name,
        workspacePlan: defaultWs.plan,
      },
    };
  }

  // 2. Busca por vínculo existente (por identificador estável Google 'sub')
  const linkedAccount = await db.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "google",
        providerAccountId: claims.sub,
      },
    },
    include: {
      user: {
        include: {
          workspace: true,
        },
      },
    },
  });

  if (linkedAccount) {
    const user = linkedAccount.user;
    if (!user || user.status !== "ACTIVE") {
      return { success: false, error: "Sua conta de usuário está suspensa ou desativada.", status: 403 };
    }

    const defaultWs = user.workspace || (await getOrCreateDefaultWorkspace(user.id));
    return {
      success: true,
      action: "LOGGED_IN",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        workspaceId: defaultWs.id,
        workspaceName: defaultWs.name,
        workspacePlan: defaultWs.plan,
      },
    };
  }

  // 3. Verificação de conta preexistente por e-mail (Prevenção estrita de Pre-Account Takeover)
  const existingUserByEmail = await db.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUserByEmail) {
    // PROIBIDO vínculo automático: orienta o usuário a entrar na conta existente com senha
    return {
      success: false,
      error:
        "Já existe uma conta cadastrada com este e-mail. Para sua segurança, faça login com sua senha para acessar sua conta.",
      status: 409,
    };
  }

  // 4. Criação atômica de novo usuário via Google OIDC
  try {
    const creationResult = await db.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name: claims.name || "Usuário",
          email: normalizedEmail,
          passwordHash: null, // Sem senha local
          avatarUrl: claims.picture || null,
          status: "ACTIVE",
        },
      });

      const workspace = await getOrCreateDefaultWorkspace(newUser.id, tx);

      await tx.account.create({
        data: {
          userId: newUser.id,
          provider: "google",
          providerAccountId: claims.sub,
          email: normalizedEmail,
        },
      });

      return {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        workspacePlan: workspace.plan,
      };
    });

    return {
      success: true,
      action: "CREATED",
      user: creationResult,
    };
  } catch (err: unknown) {
    // Tratamento de concorrência com Prisma P2002
    const isP2002 =
      err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002";

    if (isP2002) {
      // Se outra requisição simultânea criou a Account
      const concurrentAccount = await db.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: "google",
            providerAccountId: claims.sub,
          },
        },
        include: {
          user: {
            include: { workspace: true },
          },
        },
      });

      if (concurrentAccount && concurrentAccount.user && concurrentAccount.user.status === "ACTIVE") {
        const u = concurrentAccount.user;
        const defaultWs = u.workspace || (await getOrCreateDefaultWorkspace(u.id));
        return {
          success: true,
          action: "LOGGED_IN",
          user: {
            id: u.id,
            email: u.email,
            name: u.name,
            role: u.role,
            workspaceId: defaultWs.id,
            workspaceName: defaultWs.name,
            workspacePlan: defaultWs.plan,
          },
        };
      }

      return {
        success: false,
        error: "Conflito de unicidade ao processar login. Tente novamente.",
        status: 409,
      };
    }

    return {
      success: false,
      error: "Falha interna ao provisionar conta de usuário.",
      status: 500,
    };
  }
}

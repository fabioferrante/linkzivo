import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "./db";

const SESSION_COOKIE_NAME = "linkzivo_session";

/**
 * Obtém e valida o segredo de autenticação.
 * Em produção: exige impreterivelmente AUTH_SECRET válido com no mínimo 32 caracteres.
 * Em desenvolvimento/testes locais: provê fallback conveniente sem reintroduzir segredo fraco em produção.
 */
function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  const isValid = typeof secret === "string" && secret.trim().length >= 32;

  if (process.env.NODE_ENV === "production") {
    if (!isValid) {
      throw new Error(
        "[Fatal Security Error] AUTH_SECRET environment variable is missing or has less than 32 characters in production."
      );
    }
    return secret.trim();
  }

  return isValid ? secret.trim() : "linkzivo-dev-local-salt-32chars-minimum-token";
}

/**
 * Assina um payload de sessão utilizando HMAC-SHA256.
 * Retorna no formato: <payload>.<hex_hmac>
 */
export function signSessionToken(payload: string): string {
  const secret = getAuthSecret();
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

/**
 * Valida a assinatura de um token de sessão com comparação de tempo constante (timingSafeEqual).
 * Retorna o payload original se válido, ou null se inválido, adulterado ou malformado.
 */
export function verifySessionToken(token: string): string | null {
  if (!token || typeof token !== "string") return null;

  let decodedToken = token;
  try {
    if (token.includes("%")) {
      decodedToken = decodeURIComponent(token);
    }
  } catch {
    return null;
  }

  const lastDotIndex = decodedToken.lastIndexOf(".");
  if (lastDotIndex === -1) return null;

  const payload = decodedToken.slice(0, lastDotIndex);
  const signature = decodedToken.slice(lastDotIndex + 1);

  if (!payload || !signature) return null;

  const secret = getAuthSecret();
  const expectedSignature = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  const sigBuffer = Buffer.from(signature, "utf-8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf-8");

  if (sigBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null;
  }

  return payload;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  workspaceId: string;
  workspaceName: string;
  workspacePlan: string;
}

/**
 * Garante que um workspace e usuário padrão existam para ambiente de teste inicial.
 */
export async function getOrCreateDefaultWorkspace(userId: string) {
  let member = await db.workspaceMember.findFirst({
    where: { userId },
    include: { workspace: true },
  });

  if (!member) {
    const workspace = await db.workspace.create({
      data: {
        name: "Meu Workspace",
        slug: `ws-${userId.slice(0, 8)}`,
        plan: "CREATOR",
      },
    });

    member = await db.workspaceMember.create({
      data: {
        userId,
        workspaceId: workspace.id,
        role: "OWNER",
      },
      include: { workspace: true },
    });
  }

  return member.workspace;
}

/**
 * Autentica usuário com email e senha.
 */
export async function authenticateUser(email: string, password: string): Promise<SessionUser | null> {
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: {
      workspaces: {
        include: { workspace: true },
      },
    },
  });

  if (!user) return null;

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  if (!isValidPassword) return null;

  const defaultWs =
    user.workspaces[0]?.workspace || (await getOrCreateDefaultWorkspace(user.id));

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    workspaceId: defaultWs.id,
    workspaceName: defaultWs.name,
    workspacePlan: defaultWs.plan,
  };
}

/**
 * Registra novo usuário com hash seguro.
 */
export async function registerUser(name: string, email: string, password: string): Promise<SessionUser> {
  const existing = await db.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (existing) {
    throw new Error("Já existe uma conta cadastrada com este e-mail.");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await db.user.create({
    data: {
      name,
      email: email.toLowerCase().trim(),
      passwordHash,
    },
  });

  const workspace = await getOrCreateDefaultWorkspace(user.id);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    workspacePlan: workspace.plan,
  };
}

/**
 * Retorna o usuário autenticado na requisição atual através do cookie seguro assinado.
 * Valida a assinatura HMAC, a existência e status do usuário e a filiação ativa em WorkspaceMember.
 */
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) return null;

  try {
    // 1. Validação estrita da assinatura criptográfica (sem tocar no banco se for forjado)
    const verifiedPayload = verifySessionToken(sessionToken);
    if (!verifiedPayload) return null;

    const parts = verifiedPayload.split(":");
    if (parts.length !== 3) {
      // Rejeita tokens legados de 2 partes ou malformados sem sessionId rastreável
      return null;
    }

    const [sessionId, userId, workspaceId] = parts;
    if (!sessionId || !userId || !workspaceId) return null;

    // 2. Verificação server-side da sessão individual persistida no PostgreSQL
    const sessionRecord = await db.session.findUnique({
      where: { id: sessionId },
      include: {
        user: true,
      },
    });

    if (!sessionRecord) return null;

    // 3. Validação de revogação e expiração server-side
    if (sessionRecord.revokedAt !== null) {
      // Sessão foi explicitamente revogada (logout anterior)
      return null;
    }

    if (sessionRecord.expiresAt < new Date()) {
      // Sessão expirou temporalmente
      return null;
    }

    // 4. Integridade relacional: a sessão pertence exatamente ao usuário e workspace indicados
    if (sessionRecord.userId !== userId || sessionRecord.workspaceId !== workspaceId) {
      return null;
    }

    const user = sessionRecord.user;
    if (!user || user.status !== "ACTIVE") return null;

    // 5. Validação rigorosa do workspace e da associação em WorkspaceMember
    let workspace: { id: string; name: string; plan: string } | null = null;

    if (user.role === "ADMIN") {
      const ws = await db.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, name: true, plan: true },
      });
      if (!ws) return null;
      workspace = ws;
    } else {
      const membership = await db.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId: user.id,
          },
        },
        include: {
          workspace: {
            select: { id: true, name: true, plan: true },
          },
        },
      });

      if (!membership || !membership.workspace) {
        return null;
      }
      workspace = membership.workspace;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspacePlan: workspace.plan,
    };
  } catch {
    return null;
  }
}

/**
 * Determina se os cookies de sessão devem ser emitidos com o atributo Secure.
 *
 * Diretrizes de Segurança Rigorosas:
 * 1. Em produção (NODE_ENV === "production"): Sempre retorna true incondicionalmente,
 *    independentemente de NEXT_PUBLIC_APP_URL. Não há exceções implícitas por hostname.
 * 2. Validação diagnóstica de NEXT_PUBLIC_APP_URL via URL absoluta: Registra avisos em caso
 *    de URL malformada ou configurada com protocolo HTTP em produção.
 * 3. Em desenvolvimento local (NODE_ENV !== "production"): Retorna false para permitir testes
 *    em HTTP local sem que o navegador descarte o cookie, a menos que uma URL HTTPS explícita seja fornecida.
 * 4. Não consulta cabeçalhos arbitrários fornecidos pelo cliente para prevenir spoofing externo.
 */
export function isSecureCookie(): boolean {
  const isProd = process.env.NODE_ENV === "production";
  const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  // Validação diagnóstica de NEXT_PUBLIC_APP_URL
  if (rawAppUrl) {
    try {
      const parsedUrl = new URL(rawAppUrl);
      if (isProd && parsedUrl.protocol !== "https:") {
        console.warn(
          `[Security Warning] Insecure protocol '${parsedUrl.protocol}' configured in NEXT_PUBLIC_APP_URL for production. Enforcing Secure=true.`
        );
      }
    } catch {
      if (isProd) {
        console.warn(
          "[Security Warning] NEXT_PUBLIC_APP_URL is malformed or not an absolute URL in production. Enforcing Secure=true."
        );
      }
    }
  }

  // 1. Em produção, Secure é estritamente obrigatório
  if (isProd) {
    return true;
  }

  // 2. Em desenvolvimento / ambiente não-produção:
  if (rawAppUrl) {
    try {
      const parsedUrl = new URL(rawAppUrl);
      if (parsedUrl.protocol === "https:") {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Define o cookie de sessão seguro e assinado criptograficamente (HttpOnly, SameSite=Lax, Secure em HTTPS/produção).
 * Persiste a sessão individualmente no PostgreSQL com validade de 30 dias.
 */
export async function createSessionCookie(user: SessionUser) {
  const cookieStore = await cookies();

  // 1. Cria a sessão individual persistida no PostgreSQL
  const session = await db.session.create({
    data: {
      userId: user.id,
      workspaceId: user.workspaceId,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 dias
    },
  });

  // 2. Monta o payload unívoco de 3 partes: sessionId:userId:workspaceId
  const rawPayload = `${session.id}:${user.id}:${user.workspaceId}`;
  const signedToken = signSessionToken(rawPayload);

  cookieStore.set(SESSION_COOKIE_NAME, signedToken, {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 dias
  });
}

/**
 * Retorna as opções padronizadas para emissão do cookie de expiração imediata.
 * Em produção: preserva estritamente Secure=true, HttpOnly e SameSite=Lax.
 */
export function getLogoutCookieOptions() {
  return {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  };
}

export interface LogoutResult {
  success: boolean;
  revoked: boolean;
  error?: string;
}

/**
 * Revoga a sessão ativa no servidor (PostgreSQL) e emite o cookie de expiração imediata.
 * Preserva os atributos Secure, HttpOnly e SameSite=Lax sem sobrescrita.
 * Garante que o cookie de expiração é emitido mesmo se a revogação no banco falhar,
 * registrando erros sem expor dados sensíveis e informando o status da operação ao chamador.
 */
export async function destroySessionCookie(): Promise<LogoutResult> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  // 1. Emite SEMPRE o cookie de expiração com os atributos de segurança corretos
  // ATENÇÃO: NÃO chamar cookieStore.delete() logo após, pois o Next.js App Router
  // sobrescreve os atributos customizados (Secure, HttpOnly, SameSite) com valores default.
  cookieStore.set(SESSION_COOKIE_NAME, "", getLogoutCookieOptions());

  // 2. Se não havia token enviado, a expiração local foi emitida e não há sessão no banco para revogar
  if (!sessionToken) {
    return { success: true, revoked: false };
  }

  const verifiedPayload = verifySessionToken(sessionToken);
  if (!verifiedPayload) {
    return { success: true, revoked: false };
  }

  const parts = verifiedPayload.split(":");
  if (parts.length !== 3) {
    return { success: true, revoked: false };
  }

  const [sessionId] = parts;
  if (!sessionId) {
    return { success: true, revoked: false };
  }

  // 3. Tenta revogar a sessão no PostgreSQL com registro de erro seguro
  try {
    await db.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
    return { success: true, revoked: true };
  } catch (err: unknown) {
    // Registra falha de infraestrutura sem expor tokens, hashes ou dados pessoais
    console.error(
      "[Auth Error] Falha ao revogar sessão no banco de dados durante logout:",
      err instanceof Error ? err.name : "DatabaseError"
    );
    return {
      success: false,
      revoked: false,
      error: "Falha ao registrar encerramento da sessão no banco de dados.",
    };
  }
}

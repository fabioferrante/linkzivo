import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { db } from "./db";

const SESSION_COOKIE_NAME = "linkzivo_session";

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
 * Retorna o usuário autenticado na requisição atual através do cookie seguro.
 */
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) return null;

  try {
    const [userId, workspaceId] = sessionToken.split(":");
    if (!userId || !workspaceId) return null;

    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.status !== "ACTIVE") return null;

    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) return null;

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
 * Define o cookie de sessão seguro (HttpOnly, SameSite=Lax, Secure em produção).
 */
export async function createSessionCookie(user: SessionUser) {
  const cookieStore = await cookies();
  const token = `${user.id}:${user.workspaceId}`;

  const isLocalhost = process.env.NEXT_PUBLIC_APP_URL?.includes("localhost") || process.env.PORT !== undefined;
  const isSecure = process.env.NODE_ENV === "production" && !isLocalhost;

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 dias
  });
}

/**
 * Remove o cookie de sessão de forma explícita com expiração imediata.
 */
export async function destroySessionCookie() {
  const cookieStore = await cookies();
  const isLocalhost = process.env.NEXT_PUBLIC_APP_URL?.includes("localhost") || process.env.PORT !== undefined;
  const isSecure = process.env.NODE_ENV === "production" && !isLocalhost;

  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
  cookieStore.delete(SESSION_COOKIE_NAME);
}

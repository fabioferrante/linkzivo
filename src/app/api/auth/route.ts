import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, createSessionCookie, getSession, destroySessionCookie, registerUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false, user: null });
  }
  return NextResponse.json({ authenticated: true, user: session });
}

export async function DELETE() {
  await destroySessionCookie();
  return NextResponse.json({ success: true, message: "Sessão encerrada com sucesso." });
}

export async function POST(request: NextRequest) {
  try {
    const { action, email, password, name } = await request.json();

    if (action === "logout") {
      await destroySessionCookie();
      return NextResponse.json({ success: true });
    }

    if (action === "register") {
      if (!email || !password || !name) {
        return NextResponse.json({ error: "Preencha todos os campos obrigatórios." }, { status: 400 });
      }
      if (password.length < 6) {
        return NextResponse.json({ error: "A senha deve ter no mínimo 6 caracteres." }, { status: 400 });
      }

      const user = await registerUser(name, email, password);
      await createSessionCookie(user);
      return NextResponse.json({ success: true, user });
    }

    // Default: Login
    if (!email || !password) {
      return NextResponse.json({ error: "Informe e-mail e senha." }, { status: 400 });
    }

    const user = await authenticateUser(email, password);
    if (!user) {
      return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
    }

    await createSessionCookie(user);
    return NextResponse.json({ success: true, user });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro na autenticação.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, createSessionCookie, getSession, destroySessionCookie, registerUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false, user: null }, { headers: NO_CACHE_HEADERS });
  }
  return NextResponse.json({ authenticated: true, user: session }, { headers: NO_CACHE_HEADERS });
}

export async function DELETE() {
  const result = await destroySessionCookie();
  if (!result.success) {
    return NextResponse.json(
      { success: false, error: "Falha ao registrar encerramento da sessão no servidor." },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
  return NextResponse.json(
    { success: true, message: "Sessão encerrada com sucesso." },
    { headers: NO_CACHE_HEADERS }
  );
}

export async function POST(request: NextRequest) {
  try {
    const { action, email, password, name } = await request.json();

    if (action === "logout") {
      const result = await destroySessionCookie();
      if (!result.success) {
        return NextResponse.json(
          { success: false, error: "Falha ao registrar encerramento da sessão no servidor." },
          { status: 500, headers: NO_CACHE_HEADERS }
        );
      }
      return NextResponse.json({ success: true }, { headers: NO_CACHE_HEADERS });
    }

    if (action === "register") {
      if (!email || !password || !name) {
        return NextResponse.json(
          { error: "Preencha todos os campos obrigatórios." },
          { status: 400, headers: NO_CACHE_HEADERS }
        );
      }
      if (password.length < 6) {
        return NextResponse.json(
          { error: "A senha deve ter no mínimo 6 caracteres." },
          { status: 400, headers: NO_CACHE_HEADERS }
        );
      }

      const user = await registerUser(name, email, password);
      await createSessionCookie(user);
      return NextResponse.json({ success: true, user }, { headers: NO_CACHE_HEADERS });
    }

    // Default: Login
    if (!email || !password) {
      return NextResponse.json(
        { error: "Informe e-mail e senha." },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const user = await authenticateUser(email, password);
    if (!user) {
      return NextResponse.json(
        { error: "E-mail ou senha incorretos." },
        { status: 401, headers: NO_CACHE_HEADERS }
      );
    }

    await createSessionCookie(user);
    return NextResponse.json({ success: true, user }, { headers: NO_CACHE_HEADERS });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro na autenticação.";
    return NextResponse.json({ error: message }, { status: 400, headers: NO_CACHE_HEADERS });
  }
}

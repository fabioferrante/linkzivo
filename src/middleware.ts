import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Proteção estrita da área restrita do Dashboard
  if (pathname.startsWith("/dashboard")) {
    const sessionCookie = request.cookies.get("linkzivo_session")?.value;

    if (!sessionCookie) {
      // Redireciona para home pública impedindo acesso sem autenticação
      const redirectUrl = new URL("/", request.url);
      const response = NextResponse.redirect(redirectUrl);
      
      // Impede que o navegador sirva o dashboard a partir de cache ou BFCache
      response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      response.headers.set("Pragma", "no-cache");
      response.headers.set("Expires", "0");
      return response;
    }

    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*"],
};

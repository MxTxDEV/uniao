import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifyToken } from "@/lib/token";

// Camada de conveniência (redireciona quem não tem sessão válida).
// A autorização real é feita no servidor em cada página/action/serviço.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const payload = await verifyToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/login") {
    if (payload) return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  }
  if (!payload) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};

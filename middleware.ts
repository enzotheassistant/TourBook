import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = new Set(["/login"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isStaticAsset =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$/.test(pathname);

  if (isStaticAsset || pathname.startsWith("/api/")) {
    return updateSession(request);
  }

  const response = await updateSession(request);

  const accessToken = request.cookies.get("sb-access-token")?.value;
  const refreshToken = request.cookies.get("sb-refresh-token")?.value;
  const hasSession = Boolean(accessToken && refreshToken);

  if (PUBLIC_PATHS.has(pathname)) {
    if (hasSession) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return response;
  }

  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

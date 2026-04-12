import { NextRequest, NextResponse } from "next/server";
import { createProxySupabaseClient } from "@/lib/supabase/server";

const PUBLIC_PATHS = ["/login"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicPath = PUBLIC_PATHS.includes(pathname);
  const isStaticAsset =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/api/");

  if (isStaticAsset) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const supabase = createProxySupabaseClient(request, response);
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (isPublicPath) {
    if (user) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return response;
  }

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

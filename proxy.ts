import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

const PUBLIC_PATHS = new Set(["/login"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isStaticAsset =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$/.test(pathname);

  const { response, user } = await updateSession(request);

  if (isStaticAsset || pathname.startsWith("/api/")) {
    return response;
  }

  if (PUBLIC_PATHS.has(pathname)) {
    if (user) {
      const inviteToken = request.nextUrl.searchParams.get("inviteToken")?.trim()
        || request.nextUrl.searchParams.get("token")?.trim();
      if (inviteToken) {
        // Authenticated user arrived at /login with an invite token —
        // send them straight to the accept-invite page so the flow is not lost.
        const destination = new URL("/accept-invite", request.url);
        destination.searchParams.set("token", inviteToken);
        return NextResponse.redirect(destination);
      }
      return NextResponse.redirect(new URL("/", request.url));
    }
    return response;
  }

  if (!user) {
    const destination = new URL("/login", request.url);
    const inviteToken = request.nextUrl.searchParams.get("inviteToken")?.trim();
    if (inviteToken) {
      destination.searchParams.set("inviteToken", inviteToken);
    }
    return NextResponse.redirect(destination);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

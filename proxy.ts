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

  // Deliberately NOT redirecting to /login here when `user` is null.
  //
  // The session lives in two places: the browser's localStorage (source of
  // truth for the client) and the sb-* cookies this middleware reads. They
  // can legitimately desync -- e.g. a background token refresh rotates the
  // refresh token, and the one-shot POST that syncs the new token into
  // cookies fails (flaky mobile network, backgrounded tab). Supabase refresh
  // tokens are single-use, so once that happens the cookie is permanently
  // dead even though localStorage still holds a perfectly live session.
  //
  // AppContextProvider (mounted for every route from the root layout) runs
  // its own, more complete recovery on every page load: localStorage first,
  // then a backup refresh-token cookie, then a repair-and-retry against
  // /api/me/context using a Bearer token that doesn't depend on cookies at
  // all. Redirecting here, before that client code ever gets to run, is
  // exactly what turns a recoverable hiccup into a forced re-login. Every
  // API route independently enforces its own auth regardless of what this
  // middleware decides, so letting the page load through is not a security
  // gap -- it just gives the client a chance to repair itself first. If it
  // can't, AppContextProvider.routeToLogin() sends the user to /login
  // itself (preserving any inviteToken the same way this file used to).
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

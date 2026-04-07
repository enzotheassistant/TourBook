import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE_NAME, CREW_SESSION_COOKIE_NAME, SESSION_COOKIE_VALUE } from '@/lib/auth';

const PUBLIC_PATHS = ['/login', '/admin/unlock'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicPath = PUBLIC_PATHS.includes(pathname);
  const isStaticAsset =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/api/auth/login') ||
    pathname.startsWith('/api/auth/logout') ||
    pathname.startsWith('/api/auth/admin-login');

  if (isPublicPath || isStaticAsset) {
    return NextResponse.next();
  }

  const crewSessionCookie = request.cookies.get(CREW_SESSION_COOKIE_NAME)?.value;
  const isCrewLoggedIn = crewSessionCookie === SESSION_COOKIE_VALUE;

  if (!isCrewLoggedIn) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith('/admin')) {
    const adminSessionCookie = request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value;
    const isAdminLoggedIn = adminSessionCookie === SESSION_COOKIE_VALUE;

    if (!isAdminLoggedIn) {
      const unlockUrl = new URL('/admin/unlock', request.url);
      return NextResponse.redirect(unlockUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};

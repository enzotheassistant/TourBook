import { NextRequest, NextResponse } from 'next/server';
import { applySessionCookies, clearSessionCookies, getAuthCookieValuesFromRequest, getAuthStateFromRequest } from '@/lib/auth';

const PUBLIC_PATHS = ['/login'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicPath = PUBLIC_PATHS.includes(pathname);
  const isStaticAsset =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/api/');

  if (isStaticAsset) {
    return NextResponse.next();
  }

  const authState = await getAuthStateFromRequest(request);

  if (isPublicPath) {
    if (!authState) {
      const hasSessionCookies = Object.values(getAuthCookieValuesFromRequest(request)).some(Boolean);
      return hasSessionCookies ? clearSessionCookies(NextResponse.next()) : NextResponse.next();
    }

    const response = NextResponse.redirect(new URL('/', request.url));
    return authState.refreshedSession ? applySessionCookies(response, authState.refreshedSession) : response;
  }

  if (!authState) {
    const loginUrl = new URL('/login', request.url);
    return clearSessionCookies(NextResponse.redirect(loginUrl));
  }

  const response = NextResponse.next();
  return authState.refreshedSession ? applySessionCookies(response, authState.refreshedSession) : response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};

import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getServerSupabaseConfig } from '@/lib/supabase/server';

export const ACCESS_TOKEN_COOKIE_NAME = 'tourbook_access_token';
export const REFRESH_TOKEN_COOKIE_NAME = 'tourbook_refresh_token';
export const AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

type AuthenticatedUser = {
  id: string;
  email: string | null;
};

type SessionCookiePayload = {
  access_token: string;
  refresh_token: string;
};

export type AuthState = {
  user: AuthenticatedUser;
  refreshedSession: SessionCookiePayload | null;
};

export function hasSupabaseAuthEnv() {
  try {
    getServerSupabaseConfig();
    return true;
  } catch {
    return false;
  }
}

async function getAuthCookieValuesFromStore() {
  const cookieStore = await cookies();

  return {
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value ?? null,
    refreshToken: cookieStore.get(REFRESH_TOKEN_COOKIE_NAME)?.value ?? null,
  };
}

export function getAuthCookieValuesFromRequest(request: NextRequest) {
  return {
    accessToken: request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value ?? null,
    refreshToken: request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)?.value ?? null,
  };
}

export async function getAuthCookieValues() {
  return getAuthCookieValuesFromStore();
}

async function getUserFromAccessToken(accessToken: string): Promise<AuthenticatedUser | null> {
  if (!accessToken || !hasSupabaseAuthEnv()) {
    return null;
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.auth.getUser(accessToken);

    if (error || !data.user) {
      return null;
    }

    return {
      id: data.user.id,
      email: data.user.email ?? null,
    };
  } catch {
    return null;
  }
}

async function refreshSession(refreshToken: string): Promise<SessionCookiePayload | null> {
  if (!refreshToken || !hasSupabaseAuthEnv()) {
    return null;
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });

    if (error || !data.session?.access_token || !data.session.refresh_token) {
      return null;
    }

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    };
  } catch {
    return null;
  }
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const { accessToken, refreshToken } = await getAuthCookieValuesFromStore();
  const user = accessToken ? await getUserFromAccessToken(accessToken) : null;
  if (user) return user;

  if (!refreshToken) return null;

  const refreshedSession = await refreshSession(refreshToken);
  if (!refreshedSession) return null;

  return getUserFromAccessToken(refreshedSession.access_token);
}

export async function getAuthStateFromRequest(request: NextRequest): Promise<AuthState | null> {
  const { accessToken, refreshToken } = getAuthCookieValuesFromRequest(request);

  const existingUser = accessToken ? await getUserFromAccessToken(accessToken) : null;
  if (existingUser) {
    return {
      user: existingUser,
      refreshedSession: null,
    };
  }

  if (!refreshToken) {
    return null;
  }

  const refreshedSession = await refreshSession(refreshToken);
  if (!refreshedSession) {
    return null;
  }

  const refreshedUser = await getUserFromAccessToken(refreshedSession.access_token);
  if (!refreshedUser) {
    return null;
  }

  return {
    user: refreshedUser,
    refreshedSession,
  };
}

export async function isAuthenticated() {
  const user = await getAuthenticatedUser();
  return Boolean(user);
}

export async function isAdminAuthenticated() {
  return isAuthenticated();
}

export async function requireApiAuth(request: NextRequest): Promise<AuthState | NextResponse> {
  const authState = await getAuthStateFromRequest(request);
  if (authState) return authState;

  return clearSessionCookies(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
}

export async function requireAdminApiAuth(request: NextRequest) {
  return requireApiAuth(request);
}

export function applySessionCookies(response: NextResponse, session: SessionCookiePayload) {
  const secure = process.env.NODE_ENV === 'production';

  response.cookies.set({
    name: ACCESS_TOKEN_COOKIE_NAME,
    value: session.access_token,
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
  });

  response.cookies.set({
    name: REFRESH_TOKEN_COOKIE_NAME,
    value: session.refresh_token,
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
  });

  return response;
}

export function finalizeAuthResponse(response: NextResponse, authState: AuthState) {
  if (authState.refreshedSession) {
    applySessionCookies(response, authState.refreshedSession);
  }

  return response;
}

export function clearSessionCookies(response: NextResponse) {
  const secure = process.env.NODE_ENV === 'production';

  for (const name of [ACCESS_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_NAME]) {
    response.cookies.set({
      name,
      value: '',
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }

  return response;
}

export function getRequestAccessToken(request: NextRequest) {
  return request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value ?? null;
}

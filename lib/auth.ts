import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { RT_COOKIE, EMAIL_COOKIE } from "@/lib/supabase/constants";
import { createRouteHandlerSupabaseClient, createServerSupabaseClient, getServerSupabaseConfig } from "@/lib/supabase/server";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

export type AuthState = {
  user: AuthenticatedUser;
  response: NextResponse;
  supabase: SupabaseClient;
};

export function hasSupabaseAuthEnv() {
  try {
    getServerSupabaseConfig();
    return true;
  } catch {
    return false;
  }
}

function mapUser(user: { id: string; email?: string | null }): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email ?? null,
  };
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  if (!hasSupabaseAuthEnv()) return null;

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return mapUser(data.user);
  } catch {
    return null;
  }
}

export async function getAuthStateFromRequest(request: NextRequest): Promise<AuthState | null> {
  if (!hasSupabaseAuthEnv()) return null;

  const response = NextResponse.next();

  try {
    const supabase = createRouteHandlerSupabaseClient(request, response);
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) {
      return { user: mapUser(data.user), response, supabase };
    }
  } catch {
    // Fall through to bearer token fallback.
  }

  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.toLowerCase().startsWith("bearer ")) return null;

    const token = authHeader.slice(7).trim();
    if (!token) return null;

    const { url, anonKey } = getServerSupabaseConfig();
    const supabase = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return { user: mapUser(data.user), response, supabase };
  } catch {
    return null;
  }
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
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function requireApiAuthForWorkspaceAdmin(
  request: NextRequest,
  workspaceId: string,
): Promise<AuthState | NextResponse> {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const normalizedWorkspaceId = workspaceId.trim();
  if (!normalizedWorkspaceId) {
    return NextResponse.json({ error: 'workspaceId is required.' }, { status: 400 });
  }

  const { data, error } = await authState.supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', normalizedWorkspaceId)
    .eq('user_id', authState.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const role = String(data?.role ?? '');
  if (role !== 'owner' && role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return authState;
}

/** @deprecated Use requireApiAuthForWorkspaceAdmin() with explicit workspace scope. */
export async function requireAdminApiAuth(request: NextRequest) {
  return NextResponse.json(
    { error: 'Deprecated auth helper. Use requireApiAuthForWorkspaceAdmin with explicit workspaceId.' },
    { status: 500 },
  );
}

/**
 * Get the remembered email from the server-side cookie.
 * Use this in Server Components to prefill the login form without client-side timing issues.
 * Returns null if no email cookie is found.
 */
export async function getRememberedEmailFromCookies(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const email = cookieStore.get(EMAIL_COOKIE)?.value;
    return email ?? null;
  } catch (err) {
    // cookies() throws if called outside of Server Component context
    return null;
  }
}

export function finalizeAuthResponse(response: NextResponse, authState?: AuthState) {
  if (!authState) return response;

  for (const cookie of authState.response.cookies.getAll()) {
    response.cookies.set(cookie);
  }

  return response;
}

export function clearSessionCookies(request: NextRequest, response: NextResponse) {
  const cookieNames = new Set<string>([RT_COOKIE]);

  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith('sb-')) {
      cookieNames.add(cookie.name);
    }
  }

  for (const cookie of authStateCookieCandidates()) {
    cookieNames.add(cookie);
  }

  for (const cookieName of cookieNames) {
    response.cookies.set(cookieName, '', {
      maxAge: 0,
      path: '/',
    });
  }

  return response;
}

function authStateCookieCandidates() {
  return [
    'sb-access-token',
    'sb-refresh-token',
  ];
}

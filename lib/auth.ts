import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerSupabaseClient, createServerSupabaseClient, getServerSupabaseConfig } from "@/lib/supabase/server";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

export type AuthState = {
  user: AuthenticatedUser;
  response: NextResponse;
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
      return { user: mapUser(data.user), response };
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
    return { user: mapUser(data.user), response };
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

export async function requireAdminApiAuth(request: NextRequest) {
  return requireApiAuth(request);
}

export function finalizeAuthResponse(response: NextResponse, authState?: AuthState) {
  if (!authState) return response;

  for (const cookie of authState.response.cookies.getAll()) {
    response.cookies.set(cookie);
  }

  return response;
}

export function clearSessionCookies(response: NextResponse) {
  for (const cookie of response.cookies.getAll()) {
    if (cookie.name.startsWith("sb-")) {
      response.cookies.set(cookie.name, "", {
        maxAge: 0,
        path: "/",
      });
    }
  }

  return response;
}

import { NextRequest, NextResponse } from "next/server";
import {
  createRouteHandlerSupabaseClient,
  createServerComponentSupabaseClient,
  getServerSupabaseConfig,
} from "@/lib/supabase/server";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

export type AuthState = {
  user: AuthenticatedUser;
  authResponse: NextResponse;
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
    const supabase = await createServerComponentSupabaseClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return mapUser(data.user);
  } catch {
    return null;
  }
}

export async function getAuthStateFromRequest(request: NextRequest): Promise<AuthState | null> {
  if (!hasSupabaseAuthEnv()) return null;

  try {
    const authResponse = NextResponse.next();
    const supabase = createRouteHandlerSupabaseClient(request, authResponse);
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return {
      user: mapUser(data.user),
      authResponse,
    };
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

  for (const cookie of authState.authResponse.cookies.getAll()) {
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

import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";

export type CookieToSet = { name: string; value: string; options?: CookieOptions };

export function getServerSupabaseConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase auth env is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).",
    );
  }

  return { url, anonKey, serviceRoleKey };
}

export async function createServerSupabaseClient() {
  const { url, anonKey } = getServerSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components may not be allowed to write cookies.
        }
      },
    },
  });
}

export function createRouteHandlerSupabaseClient(request: NextRequest, response: NextResponse) {
  const { url, anonKey } = getServerSupabaseConfig();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });
}

export function createProxySupabaseClient(request: NextRequest, response: NextResponse) {
  return createRouteHandlerSupabaseClient(request, response);
}

export function createServiceRoleSupabaseClient() {
  const { url, serviceRoleKey } = getServerSupabaseConfig();

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for privileged bootstrap queries.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

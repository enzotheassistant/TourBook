import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createProxySupabaseClient } from "@/lib/supabase/server";

export async function updateSession(request: NextRequest): Promise<{ response: NextResponse; user: User | null }> {
  const response = NextResponse.next({ request });
  const supabase = createProxySupabaseClient(request, response);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}

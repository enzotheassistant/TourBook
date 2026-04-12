import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";

    if (!email || !password) {
      return NextResponse.json({ message: "Email and password are required." }, { status: 400 });
    }

    const response = NextResponse.json({ ok: true });
    const supabase = createRouteHandlerSupabaseClient(request, response);
    const { error, data } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
      return NextResponse.json({ message: error?.message ?? "Invalid credentials." }, { status: 401 });
    }

    return response;
  } catch (error) {
    console.error("Unable to login with Supabase Auth", error);
    return NextResponse.json({ message: "Unable to login." }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { applySessionCookies, clearSessionCookies } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = body.email?.trim().toLowerCase() ?? '';
    const password = body.password ?? '';

    if (!email || !password) {
      return NextResponse.json({ message: 'Email and password are required.' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      return clearSessionCookies(
        NextResponse.json({ message: error?.message ?? 'Invalid credentials.' }, { status: 401 }),
      );
    }

    return applySessionCookies(NextResponse.json({ ok: true, user: { id: data.user.id, email: data.user.email ?? null } }), data.session);
  } catch (error) {
    console.error('Unable to login with Supabase Auth', error);
    return NextResponse.json({ message: 'Unable to login.' }, { status: 500 });
  }
}

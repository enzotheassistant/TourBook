import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE_NAME, CREW_SESSION_COOKIE_NAME } from '@/lib/auth';

export async function POST() {
  const cookieStore = await cookies();

  for (const name of [CREW_SESSION_COOKIE_NAME, ADMIN_SESSION_COOKIE_NAME]) {
    cookieStore.set({
      name,
      value: '',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    });
  }

  return NextResponse.json({ ok: true });
}

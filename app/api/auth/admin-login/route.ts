import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE_NAME, ADMIN_SESSION_MAX_AGE_SECONDS, createSessionValue, isAdminPasswordValid } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { password?: string };
    const password = body.password ?? '';

    if (!isAdminPasswordValid(password)) {
      return NextResponse.json({ message: 'Invalid admin password.' }, { status: 401 });
    }

    const cookieStore = await cookies();

    cookieStore.set({
      name: ADMIN_SESSION_COOKIE_NAME,
      value: createSessionValue(),
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: 'Unable to unlock admin.' }, { status: 500 });
  }
}

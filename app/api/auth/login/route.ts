import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createSessionValue, isPasswordValid, SESSION_COOKIE_NAME } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { password?: string };
    const password = body.password ?? '';

    // APP_PASSWORD is validated here against the submitted shared crew password.
    if (!isPasswordValid(password)) {
      return NextResponse.json({ message: 'Invalid password.' }, { status: 401 });
    }

    const cookieStore = await cookies();

    cookieStore.set({
      name: SESSION_COOKIE_NAME,
      value: createSessionValue(),
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 14,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: 'Unable to login.' }, { status: 500 });
  }
}

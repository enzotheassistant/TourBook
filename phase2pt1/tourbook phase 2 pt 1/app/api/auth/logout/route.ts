import { NextResponse } from 'next/server';
import { clearSessionCookies } from '@/lib/auth';

export async function POST() {
  return clearSessionCookies(NextResponse.json({ ok: true }));
}

import { createHash, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const CREW_SESSION_COOKIE_NAME = 'tourbook_session';
export const ADMIN_SESSION_COOKIE_NAME = 'tourbook_admin_session';
export const SESSION_COOKIE_VALUE = 'authenticated';
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 45;

function sha256(value: string) {
  return createHash('sha256').update(value).digest();
}

function safeCompare(input: string, configured: string) {
  const inputHash = sha256(input);
  const configuredHash = sha256(configured);
  return timingSafeEqual(inputHash, configuredHash);
}

export function isCrewPasswordValid(inputPassword: string) {
  const configuredPassword = process.env.APP_PASSWORD;

  if (!configuredPassword) {
    throw new Error('APP_PASSWORD is not set.');
  }

  return safeCompare(inputPassword, configuredPassword);
}

export function isAdminPasswordValid(inputPassword: string) {
  const configuredPassword = process.env.ADMIN_PASSWORD ?? process.env.APP_PASSWORD;

  if (!configuredPassword) {
    throw new Error('ADMIN_PASSWORD is not set.');
  }

  return safeCompare(inputPassword, configuredPassword);
}

export function createSessionValue() {
  return SESSION_COOKIE_VALUE;
}

export async function isAuthenticated() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(CREW_SESSION_COOKIE_NAME)?.value;

  return sessionCookie === SESSION_COOKIE_VALUE;
}

export async function isAdminAuthenticated() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;

  return sessionCookie === SESSION_COOKIE_VALUE;
}

export async function requireApiAuth() {
  const ok = await isAuthenticated();
  if (ok) return null;
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function requireAdminApiAuth() {
  const ok = await isAdminAuthenticated();
  if (ok) return null;
  return NextResponse.json({ error: 'Admin unlock required.' }, { status: 401 });
}

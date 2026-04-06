import { createHash, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';

export const SESSION_COOKIE_NAME = 'tourbook_session';
export const SESSION_COOKIE_VALUE = 'authenticated';

function sha256(value: string) {
  return createHash('sha256').update(value).digest();
}

export function isPasswordValid(inputPassword: string) {
  // APP_PASSWORD is the only shared crew password used by the app.
  // Set it in .env.local for local dev and in Vercel env vars for production.
  const configuredPassword = process.env.APP_PASSWORD;

  if (!configuredPassword) {
    throw new Error('APP_PASSWORD is not set.');
  }

  const inputHash = sha256(inputPassword);
  const configuredHash = sha256(configuredPassword);

  return timingSafeEqual(inputHash, configuredHash);
}

export function createSessionValue() {
  return SESSION_COOKIE_VALUE;
}

export async function isAuthenticated() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  return sessionCookie === SESSION_COOKIE_VALUE;
}

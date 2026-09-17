export const RT_COOKIE = 'tb-rt';
export const EMAIL_COOKIE = 'tb-email';
export const REMEMBER_EMAIL_PREF_COOKIE = 'tb-remember-email';

// Shared so the client-side backup write (lib/supabase/client.ts) and the
// server-side backup write (app/api/auth/session/route.ts) always agree.
export const RT_COOKIE_MAX_AGE_S = 60 * 24 * 60 * 60; // 60 days

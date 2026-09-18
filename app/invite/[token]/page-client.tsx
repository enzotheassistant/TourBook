'use client';

import { useEffect } from 'react';
import { getBrowserSupabaseClient, authLog } from '@/lib/supabase/client';
import { buildInviteContinuationHref } from '@/lib/invites/login-redirect';

interface InviteTokenBootstrapClientProps {
  token: string;
}

export function InviteTokenBootstrapClient({ token }: InviteTokenBootstrapClientProps) {
  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const supabase = getBrowserSupabaseClient();

      // A signup/invite email confirmation link lands here with the new
      // session encoded only in the URL's hash fragment -- exchange it for
      // a real session before checking auth, the same way /reset-password
      // handles a password-recovery link. Without this, a brand-new user
      // who just confirmed their email gets treated as unauthenticated and
      // sent back to /login to type the password they just created again.
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const accessToken = (hash.get('access_token') || '').trim();
      const refreshToken = (hash.get('refresh_token') || '').trim();

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!active) return;
        if (error) {
          authLog('invite: setSession from confirmation link failed', error);
        } else {
          window.history.replaceState(null, '', window.location.pathname);
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!active) return;

      if (data.session) {
        window.location.replace(buildInviteContinuationHref(token));
        return;
      }

      window.location.replace(`/login?inviteToken=${encodeURIComponent(token)}`);
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 p-5 text-center shadow-2xl">
        <p className="text-sm uppercase tracking-[0.2em] text-zinc-400">TourBook</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Joining your workspace…</h1>
        <p className="mt-3 text-sm text-zinc-400">One moment while we confirm your account.</p>
      </div>
    </main>
  );
}

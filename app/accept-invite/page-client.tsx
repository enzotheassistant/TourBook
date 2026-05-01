'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { acceptWorkspaceInvite } from '@/lib/data-client';
import { clearPendingInviteToken, writePendingInviteScope, writePendingInviteToken, type PendingInviteScope } from '@/lib/app-context-storage';
import { getBrowserSupabaseClient } from '@/lib/supabase/client';
import { hasResolvedInviteContext } from '@/lib/invites/join-resolution';
import { resolveActiveContextSelection } from '@/lib/ui/context-bootstrap';
import { trackInviteEvent } from '@/lib/invite-telemetry';
import type { BootstrapContext } from '@/lib/types/tenant';

interface InviteContinuationClientProps {
  token: string;
}

async function fetchBootstrapContext(session: Session | null): Promise<BootstrapContext> {
  const response = await fetch('/api/me/context', {
    method: 'GET',
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
    credentials: 'same-origin',
    cache: 'no-store',
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: 'Unable to refresh workspace access.' }));
    throw new Error(payload.error ?? 'Unable to refresh workspace access.');
  }

  return response.json() as Promise<BootstrapContext>;
}

function contextHasInviteAccess(context: BootstrapContext, pendingScope: PendingInviteScope) {
  const resolved = resolveActiveContextSelection(
    context,
    { workspaceId: null, projectId: null, tourId: null },
    pendingScope,
  );

  return hasResolvedInviteContext(
    {
      workspaceId: pendingScope.workspaceId,
      scopeType: pendingScope.scopeType,
      projectIds: pendingScope.projectIds,
      tourIds: pendingScope.tourIds,
    },
    resolved,
  );
}

export function InviteContinuationClient({ token }: InviteContinuationClientProps) {
  const [message, setMessage] = useState('Accepting your invite…');
  const [error, setError] = useState<string | null>(null);

  const trimmedToken = useMemo(() => token.trim(), [token]);

  useEffect(() => {
    if (!trimmedToken) {
      window.location.replace('/');
      return;
    }

    writePendingInviteToken(trimmedToken);

    let cancelled = false;

    void (async () => {
      try {
        const accepted = await acceptWorkspaceInvite(trimmedToken);
        const pendingScope: PendingInviteScope = {
          workspaceId: accepted.invite.workspaceId,
          scopeType: accepted.invite.scopeType,
          projectIds: accepted.invite.projectIds,
          tourIds: accepted.invite.tourIds,
          acceptedAt: Date.now(),
        };

        writePendingInviteScope(pendingScope);
        setMessage('Invite accepted. Loading your workspace access…');
        await trackInviteEvent({ event: 'invite.accepted', workspaceId: accepted.invite.workspaceId, inviteId: accepted.invite.id, role: accepted.invite.role });

        const supabase = getBrowserSupabaseClient();
        const delays = [0, 250, 500, 1000, 1500, 2500, 4000];

        for (const delay of delays) {
          if (cancelled) return;
          if (delay > 0) {
            await new Promise((resolve) => window.setTimeout(resolve, delay));
            if (cancelled) return;
          }

          const { data } = await supabase.auth.getSession();
          const context = await fetchBootstrapContext(data.session ?? null);
          if (contextHasInviteAccess(context, pendingScope)) {
            clearPendingInviteToken();
            window.location.replace('/');
            return;
          }
        }

        throw new Error('Invite accepted, but TourBook is still waiting for that workspace to appear in your session.');
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : 'Unable to continue invite access.';
        if (!cancelled) {
          setError(reason);
          setMessage(reason);
          await trackInviteEvent({ event: 'invite.failed', reason });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [trimmedToken]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl">
        <p className="text-sm uppercase tracking-[0.2em] text-zinc-400">TourBook</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">
          {error ? 'Invite needs attention' : 'Joining workspace'}
        </h1>
        <p className="mt-3 text-sm text-zinc-300">{message}</p>
        {!error ? (
          <div className="mt-4 flex items-center gap-2 text-xs text-sky-300">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-sky-400/80" aria-hidden="true" />
            Applying access before entering the app…
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 space-y-3">
            <button
              type="button"
              onClick={() => window.location.replace(`/accept-invite?token=${encodeURIComponent(trimmedToken)}`)}
              className="inline-flex h-11 items-center justify-center rounded-full border border-sky-400/30 bg-sky-500/15 px-4 text-sm font-medium text-sky-100 transition hover:bg-sky-500/20"
            >
              Retry invite access
            </button>
            <div>
              <button
                type="button"
                onClick={() => window.location.replace('/')}
                className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 px-4 text-sm font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.05]"
              >
                Go to crew view
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

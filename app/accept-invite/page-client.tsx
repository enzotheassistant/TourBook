'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { acceptWorkspaceInvite } from '@/lib/data-client';
import { clearPendingInviteToken, writePendingInviteScope, writePendingInviteToken, type PendingInviteScope } from '@/lib/app-context-storage';
import { getBrowserSupabaseClient } from '@/lib/supabase/client';
import { hasResolvedInviteContext } from '@/lib/invites/join-resolution';
import { resolveActiveContextSelection } from '@/lib/ui/context-bootstrap';
import { trackInviteEvent } from '@/lib/invite-telemetry';
import { appendInviteDebugNote, readInviteDebugRecord, summarizeBootstrapContext, summarizeInvite, writeInviteDebugRecord } from '@/lib/invites/debug';
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
  const [debugRecord, setDebugRecord] = useState(() => readInviteDebugRecord());

  const trimmedToken = useMemo(() => token.trim(), [token]);

  useEffect(() => {
    if (!trimmedToken) {
      writeInviteDebugRecord({
        source: 'accept-invite',
        tokenDetected: false,
        redirectAttempted: { at: Date.now(), to: '/', reason: 'missing_token' },
      });
      setDebugRecord(readInviteDebugRecord());
      window.location.replace('/');
      return;
    }

    writePendingInviteToken(trimmedToken);
    writeInviteDebugRecord({
      source: 'accept-invite',
      tokenDetected: true,
      acceptSucceeded: false,
      acceptError: null,
      redirectAttempted: null,
      latestContext: null,
      contextSnapshots: [],
      notes: ['accept-invite page loaded'],
    });
    setDebugRecord(readInviteDebugRecord());

    let cancelled = false;

    void (async () => {
      try {
        const supabase = getBrowserSupabaseClient();
        const { data: sessionData } = await supabase.auth.getSession();
        writeInviteDebugRecord((current) => ({
          ...(current ?? { source: 'accept-invite' }),
          tokenDetected: true,
          authUserId: sessionData.session?.user?.id ?? null,
          authEmail: sessionData.session?.user?.email ?? null,
          acceptAttemptedAt: Date.now(),
        }));
        setDebugRecord(readInviteDebugRecord());

        const accepted = await acceptWorkspaceInvite(trimmedToken);
        const pendingScope: PendingInviteScope = {
          workspaceId: accepted.invite.workspaceId,
          scopeType: accepted.invite.scopeType,
          projectIds: accepted.invite.projectIds,
          tourIds: accepted.invite.tourIds,
          acceptedAt: Date.now(),
        };

        writePendingInviteScope(pendingScope);
        writeInviteDebugRecord((current) => ({
          ...(current ?? { source: 'accept-invite' }),
          acceptSucceeded: true,
          acceptError: null,
          acceptedInvite: summarizeInvite(accepted.invite),
          pendingScope,
        }));
        setDebugRecord(readInviteDebugRecord());
        setMessage('Invite accepted. Loading your workspace access…');
        await trackInviteEvent({ event: 'invite.accepted', workspaceId: accepted.invite.workspaceId, inviteId: accepted.invite.id, role: accepted.invite.role });

        const delays = [0, 250, 500, 1000, 1500, 2500, 4000];

        for (const delay of delays) {
          if (cancelled) return;
          if (delay > 0) {
            await new Promise((resolve) => window.setTimeout(resolve, delay));
            if (cancelled) return;
          }

          const { data } = await supabase.auth.getSession();
          const context = await fetchBootstrapContext(data.session ?? null);
          const hasInviteAccess = contextHasInviteAccess(context, pendingScope);
          const snapshot = summarizeBootstrapContext(context, { hasInviteAccess });
          writeInviteDebugRecord((current) => ({
            ...(current ?? { source: 'accept-invite' }),
            latestContext: snapshot,
            contextSnapshots: [...(current?.contextSnapshots ?? []), snapshot].slice(-8),
            pendingScope,
          }));
          setDebugRecord(readInviteDebugRecord());
          if (hasInviteAccess) {
            clearPendingInviteToken();
            appendInviteDebugNote('invite access detected in /api/me/context');
            writeInviteDebugRecord((current) => ({
              ...(current ?? { source: 'accept-invite' }),
              redirectAttempted: { at: Date.now(), to: '/', reason: 'invite_context_resolved' },
            }));
            setDebugRecord(readInviteDebugRecord());
            window.location.replace('/');
            return;
          }
        }

        throw new Error('Invite accepted, but TourBook is still waiting for that workspace to appear in your session.');
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : 'Unable to continue invite access.';
        writeInviteDebugRecord((current) => ({
          ...(current ?? { source: 'accept-invite' }),
          acceptError: reason,
        }));
        setDebugRecord(readInviteDebugRecord());
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

        {debugRecord ? (
          <section className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/5 p-4 text-xs text-amber-100/90">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold uppercase tracking-[0.18em] text-amber-200">Invite debug</h2>
              <span className="text-[11px] text-amber-200/70">temporary diagnostics</span>
            </div>
            <div className="mt-3 space-y-1.5 text-zinc-200">
              <p>Token detected: {String(Boolean(debugRecord.tokenDetected))}</p>
              <p>Authenticated user: {debugRecord.authEmail || 'unknown'} {debugRecord.authUserId ? `(${debugRecord.authUserId})` : ''}</p>
              <p>Accept result: {debugRecord.acceptSucceeded ? 'success' : debugRecord.acceptError ? 'error' : 'pending'}</p>
              {debugRecord.acceptError ? <p>Accept error: {debugRecord.acceptError}</p> : null}
              <p>Pending scope: {debugRecord.pendingScope ? `${debugRecord.pendingScope.scopeType} · workspace ${debugRecord.pendingScope.workspaceId}` : 'not set'}</p>
              {debugRecord.pendingScope?.projectIds?.length ? <p>Pending projects: {debugRecord.pendingScope.projectIds.join(', ')}</p> : null}
              {debugRecord.pendingScope?.tourIds?.length ? <p>Pending tours: {debugRecord.pendingScope.tourIds.join(', ')}</p> : null}
              <p>/api/me/context empty after accept: {debugRecord.latestContext ? String(debugRecord.latestContext.isEmpty) : 'unknown'}</p>
              <p>Latest context counts: {debugRecord.latestContext ? `memberships ${debugRecord.latestContext.membershipCount}, workspaces ${debugRecord.latestContext.workspaceCount}, projects ${debugRecord.latestContext.projectCount}, tours ${debugRecord.latestContext.tourCount}` : 'none yet'}</p>
              <p>Invite access resolved in context: {typeof debugRecord.latestContext?.hasInviteAccess === 'boolean' ? String(debugRecord.latestContext.hasInviteAccess) : 'unknown'}</p>
              <p>Redirect attempted: {debugRecord.redirectAttempted ? `yes → ${debugRecord.redirectAttempted.to} (${debugRecord.redirectAttempted.reason})` : 'no'}</p>
              {debugRecord.notes?.length ? <p>Notes: {debugRecord.notes.join(' · ')}</p> : null}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

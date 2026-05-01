'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { WorkspaceInviteSummary } from '@/lib/types/tenant';
import { ActivationEmptyState } from '@/components/activation-empty-state';
import { OfflineStatus } from '@/components/offline-status';
import { ShowCard } from '@/components/show-card';
import { useAppContext } from '@/hooks/use-app-context';
import { isPastShow, yearFromDate } from '@/lib/date';
import { acceptWorkspaceInvite, createArtist, createWorkspace, listShows, peekCachedShows } from '@/lib/data-client';
import { trackInviteEvent } from '@/lib/invite-telemetry';
import { getWorkspaceRole, canCreateDates, hasAnyAdminAccess } from '@/lib/roles';
import { getCrewNoArtistsState, getCrewNoUpcomingDatesState } from '@/lib/activation/first-run';
import { clearPendingInviteToken, readPendingInviteToken, writePendingInviteScope, writePendingInviteToken } from '@/lib/app-context-storage';
import { hasResolvedInviteContext } from '@/lib/invites/join-resolution';
import { Show } from '@/lib/types';


type InviteFlowState =
  | { phase: 'idle' }
  | { phase: 'accepting' }
  | { phase: 'joining'; invite: WorkspaceInviteSummary; startedAt: number; attempts: number; lastError?: string | null }
  | { phase: 'error'; token: string; message: string; invite?: WorkspaceInviteSummary | null };

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalizeTourName(value: string) {
  return value.trim() || 'All';
}

function sortTourNamesForUpcoming(shows: Show[]) {
  const byTour = new Map<string, string>();
  for (const show of shows) {
    const tour = normalizeTourName(show.tour_name);
    const current = byTour.get(tour);
    if (!current || show.date < current) byTour.set(tour, show.date);
  }
  return Array.from(byTour.entries()).sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0])).map(([tour]) => tour);
}

function sortTourNamesForPast(shows: Show[]) {
  const byTour = new Map<string, string>();
  for (const show of shows) {
    const tour = normalizeTourName(show.tour_name);
    const current = byTour.get(tour);
    if (!current || show.date > current) byTour.set(tour, show.date);
  }
  return Array.from(byTour.entries()).sort((a, b) => b[1].localeCompare(a[1]) || a[0].localeCompare(b[0])).map(([tour]) => tour);
}

function summarizeDayTypes(shows: Show[]) {
  return shows.reduce(
    (counts, show) => {
      if (show.day_type === 'travel') counts.travel += 1;
      else if (show.day_type === 'off') counts.off += 1;
      else counts.show += 1;
      return counts;
    },
    { show: 0, travel: 0, off: 0 },
  );
}

function FilterSelect({ value, onChange, options, ariaLabel }: { value: string; onChange: (value: string) => void; options: string[]; ariaLabel: string }) {
  return (
    <div className="relative shrink-0">
      <select
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-auto appearance-none rounded-full border border-white/10 bg-black/20 px-4 pr-11 text-sm font-medium text-zinc-100 outline-none transition focus:border-sky-400/35 focus:bg-white/[0.03]"
      >
        {options.map((option) => <option key={option} value={option}>{option === 'All' ? 'All tours' : option}</option>)}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-zinc-400">
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
    </div>
  );
}

function SearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative min-w-0 flex-1">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search"
        aria-label="Search dates"
        className="h-11 w-full rounded-full border border-white/10 bg-black/20 px-4 pr-10 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-sky-400/35"
      />
      {value ? <button type="button" onClick={() => onChange('')} className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200" aria-label="Clear search">×</button> : null}
    </div>
  );
}

function FilterSummary({
  tab,
  totalCount,
  filteredCount,
  activeTour,
  searchValue,
  onClear,
}: {
  tab: 'upcoming' | 'past';
  totalCount: number;
  filteredCount: number;
  activeTour: string;
  searchValue: string;
  onClear: () => void;
}) {
  const hasFilters = activeTour !== 'All' || searchValue.trim().length > 0;
  const label = tab === 'past' ? 'past dates' : 'upcoming dates';

  return (
    <div className="flex min-h-[1.5rem] flex-wrap items-center gap-2 text-xs text-zinc-500">
      {hasFilters ? <span>{`${filteredCount} of ${totalCount} ${label}`}</span> : null}
      {activeTour !== 'All' ? <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-zinc-300">{activeTour}</span> : null}
      {searchValue.trim() ? <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-zinc-300">Search active</span> : null}
      {hasFilters ? (
        <button type="button" onClick={onClear} className="text-zinc-400 transition hover:text-zinc-200">
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

function InviteAcceptancePanel({
  initialToken,
  flowState,
  activeWorkspaceId,
  onAcceptStart,
  onAccepted,
}: {
  initialToken: string;
  flowState: InviteFlowState;
  activeWorkspaceId: string | null;
  onAcceptStart?: () => void;
  onAccepted: (invite: WorkspaceInviteSummary) => void | Promise<void>;
}) {
  const [token, setToken] = useState(initialToken);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState(initialToken ? 'Invite token detected. Finishing workspace access…' : 'Paste an invite token to join a workspace.');

  useEffect(() => {
    setToken(initialToken);
  }, [initialToken]);

  useEffect(() => {
    if (flowState.phase === 'joining') {
      setStatus('success');
      setMessage(`Joining ${flowState.invite.role} access… This can take a few seconds while TourBook loads your workspace.`);
      return;
    }

    if (flowState.phase === 'error') {
      setStatus('error');
      setMessage(flowState.message);
    }
  }, [flowState]);

  const handleAccept = useCallback(async () => {
    const trimmed = token.trim();
    if (!trimmed) {
      setStatus('error');
      setMessage('Enter an invite token first.');
      return;
    }

    onAcceptStart?.();
    setStatus('loading');
    setMessage('Accepting invite…');

    try {
      const result = await acceptWorkspaceInvite(trimmed);
      setStatus('success');
      setMessage(`Invite accepted. Workspace access granted as ${result.invite.role}. Loading your access…`);
      await trackInviteEvent({ event: 'invite.accepted', workspaceId: result.invite.workspaceId, inviteId: result.invite.id, role: result.invite.role });
      await onAccepted(result.invite);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unable to accept invite.';
      setStatus('error');
      setMessage(reason);
      await trackInviteEvent({ event: 'invite.failed', workspaceId: activeWorkspaceId ?? undefined, reason });
    }
  }, [activeWorkspaceId, onAcceptStart, onAccepted, token]);

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.045] p-4">
      <div className="space-y-3">
        <h2 className="text-base font-semibold">Workspace Invite</h2>

        <label className="block text-sm text-zinc-300">
          <span className="mb-1 block">Invite token</span>
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Paste token"
            className="h-11 w-full rounded-full border border-white/10 bg-black/20 px-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-sky-400/40"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleAccept()}
            disabled={status === 'loading'}
            className="inline-flex h-11 items-center justify-center rounded-full bg-sky-500 px-4 text-sm font-medium text-zinc-950 transition hover:bg-sky-400 disabled:opacity-60"
          >
            {status === 'loading' ? 'Accepting…' : 'Accept invite'}
          </button>
        </div>
        <p className={`text-sm ${status === 'error' ? 'text-rose-300' : status === 'success' ? 'text-sky-300' : 'text-zinc-400'}`}>{message}</p>
      </div>
    </section>
  );
}

function SelfServeOnboardingPanel({ onCompleted }: { onCompleted: () => Promise<void> }) {
  const [workspaceName, setWorkspaceName] = useState('');
  const [artistName, setArtistName] = useState('');
  const [skipTour, setSkipTour] = useState(true);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [message, setMessage] = useState('Create your workspace and first artist to get started.');
  const [isExpanded, setIsExpanded] = useState(false);

  async function handleSubmit() {
    const cleanWorkspace = workspaceName.trim();
    const cleanArtist = artistName.trim();

    if (!cleanWorkspace) {
      setStatus('error');
      setMessage('Workspace name is required.');
      return;
    }

    if (!cleanArtist) {
      setStatus('error');
      setMessage('First artist name is required.');
      return;
    }

    setStatus('loading');
    setMessage('Creating your workspace…');

    try {
      const workspace = await createWorkspace({ name: cleanWorkspace });
      await createArtist({ workspaceId: workspace.id, name: cleanArtist });
      setMessage(skipTour
        ? 'Setup complete. Tour setup can be done later in Admin.'
        : 'Setup complete. Continue in Admin to create your first tour.');
      await onCompleted();
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Unable to complete setup.');
    }
  }

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.045] p-4">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Welcome to TourBook</h2>
            <p className="mt-1 text-sm text-zinc-400">Most invited collaborators can ignore workspace setup. Create your own only if you need a separate admin space.</p>
          </div>
          <button
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
            className="text-xs font-medium text-zinc-400 transition hover:text-zinc-200"
          >
            {isExpanded ? 'Hide setup' : 'Create workspace'}
          </button>
        </div>

        {isExpanded ? (
          <>
            <label className="block text-sm text-zinc-300">
              <span className="mb-1 block">Workspace name</span>
              <input
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
                placeholder="e.g. Northbound Touring"
                className="h-11 w-full rounded-full border border-white/10 bg-black/20 px-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-sky-400/40"
              />
            </label>
            <label className="block text-sm text-zinc-300">
              <span className="mb-1 block">First artist</span>
              <input
                value={artistName}
                onChange={(event) => setArtistName(event.target.value)}
                placeholder="e.g. The Midnight Echoes"
                className="h-11 w-full rounded-full border border-white/10 bg-black/20 px-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-sky-400/40"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={skipTour}
                onChange={(event) => setSkipTour(event.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-black/30"
              />
              Skip tour setup for now
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={status === 'loading'}
                className="inline-flex h-11 items-center justify-center rounded-full bg-sky-500 px-4 text-sm font-medium text-zinc-950 transition hover:bg-sky-400 disabled:opacity-60"
              >
                {status === 'loading' ? 'Setting up…' : 'Create workspace and artist'}
              </button>
            </div>
          </>
        ) : null}
        <p className={`text-sm ${status === 'error' ? 'text-rose-300' : 'text-zinc-400'}`}>{message}</p>
      </div>
    </section>
  );
}

export function DashboardClient() {
  const {
    activeWorkspaceId,
    activeProjectId,
    activeTourId,
    isLoading: contextLoading,
    workspaces,
    projects,
    memberships,
    refreshContext,
    setActiveWorkspaceId,
  } = useAppContext();
  const [shows, setShows] = useState<Show[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [statusSource, setStatusSource] = useState<'live' | 'cache'>('live');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [upcomingTour, setUpcomingTour] = useState('All');
  const [pastTour, setPastTour] = useState('All');
  const [upcomingSearch, setUpcomingSearch] = useState('');
  const [pastSearch, setPastSearch] = useState('');
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') === 'past' ? 'past' : 'upcoming';
  const urlInviteToken = (searchParams.get('inviteToken') || searchParams.get('token') || '').trim();
  const inviteToken = urlInviteToken || readPendingInviteToken();
  const [inviteFlow, setInviteFlow] = useState<InviteFlowState>({ phase: 'idle' });
  const autoAcceptAttemptedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (urlInviteToken) {
      writePendingInviteToken(urlInviteToken);
    }
  }, [urlInviteToken]);

  const clearInviteArtifacts = useCallback(() => {
    if (typeof window === 'undefined') return;
    clearPendingInviteToken();
    const url = new URL(window.location.href);
    url.searchParams.delete('inviteToken');
    url.searchParams.delete('token');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const beginInviteJoin = useCallback((invite: WorkspaceInviteSummary, lastError?: string | null) => {
    setInviteFlow((current) => ({
      phase: 'joining',
      invite,
      startedAt: current.phase === 'joining' && current.invite.id === invite.id ? current.startedAt : Date.now(),
      attempts: current.phase === 'joining' && current.invite.id === invite.id ? current.attempts + 1 : 1,
      lastError: lastError ?? null,
    }));
  }, []);

  const handleInviteAccepted = useCallback(async (invite: WorkspaceInviteSummary) => {
    writePendingInviteScope({
      workspaceId: invite.workspaceId,
      scopeType: invite.scopeType,
      projectIds: invite.projectIds,
      tourIds: invite.tourIds,
    });
    beginInviteJoin(invite);
  }, [beginInviteJoin]);

  useEffect(() => {
    if (!inviteToken) {
      autoAcceptAttemptedTokenRef.current = null;
      return;
    }

    if (inviteFlow.phase !== 'idle') return;
    if (autoAcceptAttemptedTokenRef.current === inviteToken) return;

    autoAcceptAttemptedTokenRef.current = inviteToken;
    setInviteFlow({ phase: 'accepting' });

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await acceptWorkspaceInvite(inviteToken);
          await trackInviteEvent({ event: 'invite.accepted', workspaceId: result.invite.workspaceId, inviteId: result.invite.id, role: result.invite.role });
          await handleInviteAccepted(result.invite);
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'Unable to accept invite.';
          setInviteFlow({ phase: 'error', token: inviteToken, message: reason });
          await trackInviteEvent({ event: 'invite.failed', workspaceId: activeWorkspaceId ?? undefined, reason });
        }
      })();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [activeWorkspaceId, handleInviteAccepted, inviteFlow.phase, inviteToken]);

  useEffect(() => {
    if (!inviteToken && inviteFlow.phase !== 'joining') {
      if (inviteFlow.phase !== 'idle') setInviteFlow({ phase: 'idle' });
      return;
    }

    if (inviteFlow.phase !== 'joining') return;

    const hasWorkspace = workspaces.some((workspace) => workspace.id === inviteFlow.invite.workspaceId);
    if (!hasWorkspace) return;

    if (activeWorkspaceId !== inviteFlow.invite.workspaceId) {
      setActiveWorkspaceId(inviteFlow.invite.workspaceId);
      return;
    }

    if (!hasResolvedInviteContext(inviteFlow.invite, { activeWorkspaceId, activeProjectId, activeTourId })) {
      return;
    }

    clearInviteArtifacts();
    setInviteFlow({ phase: 'idle' });
  }, [activeProjectId, activeTourId, activeWorkspaceId, clearInviteArtifacts, inviteFlow, inviteToken, setActiveWorkspaceId, workspaces]);

  useEffect(() => {
    if (inviteFlow.phase !== 'joining') return;

    let cancelled = false;

    const run = async () => {
      const delays = [0, 300, 750, 1500, 2500, 4000];
      for (const delay of delays) {
        if (cancelled) return;
        if (delay > 0) await wait(delay);
        if (cancelled) return;
        try {
          await refreshContext();
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'Unable to refresh workspace access.';
          if (!cancelled) beginInviteJoin(inviteFlow.invite, reason);
        }
      }

      if (cancelled) return;
      setInviteFlow({
        phase: 'error',
        token: inviteToken,
        invite: inviteFlow.invite,
        message: 'We accepted your invite, but TourBook is still waiting for that workspace to appear. Retry access below, or ask the workspace owner to confirm the invite scope still points at a live project.',
      });
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [beginInviteJoin, inviteFlow, inviteToken, refreshContext]);

  // Reset all filters, stale shows, and errors when the active project changes
  // Must run before the data loading effect so resets happen first in the batch
  useEffect(() => {
    setUpcomingTour('All');
    setPastTour('All');
    setUpcomingSearch('');
    setPastSearch('');
    setShows([]);
    setHasLoadedOnce(false);
    setLoadError(null);
  }, [activeProjectId]);

  useEffect(() => {
    let active = true;
    async function load() {
      if (contextLoading) return;
      if (!activeWorkspaceId || !activeProjectId) {
        if (active) {
          setShows([]);
          setHasLoadedOnce(false);
          setLoading(false);
        }
        return;
      }

      const cached = peekCachedShows(false, { workspaceId: activeWorkspaceId, projectId: activeProjectId, tourId: activeTourId });
      if (cached && active) {
        setShows(cached.data);
        setLastSavedAt(cached.savedAt);
        setHasLoadedOnce(true);
        setLoadError(null);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const result = await listShows(false, { workspaceId: activeWorkspaceId, projectId: activeProjectId, tourId: activeTourId });
        if (!active) return;
        setShows(result.shows);
        setStatusSource(result.source);
        setLastSavedAt(result.savedAt);
        setLoadError(null);
        setHasLoadedOnce(true);
      } catch (error) {
        if (!active) return;
        if (cached) {
          setStatusSource('cache');
          setLoadError(null);
        } else {
          setLoadError(error instanceof Error ? error.message : 'Unable to load dates.');
          setStatusSource('live');
          setLastSavedAt(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    window.addEventListener('tourbook:shows-updated', load);
    return () => {
      active = false;
      window.removeEventListener('tourbook:shows-updated', load);
    };
  }, [activeProjectId, activeWorkspaceId, activeTourId, contextLoading]);

  const upcomingShows = useMemo(() => shows.filter((show) => !isPastShow(show.date)), [shows]);
  const pastShows = useMemo(() => shows.filter((show) => isPastShow(show.date)).sort((a, b) => b.date.localeCompare(a.date)), [shows]);
  const upcomingTours = useMemo(() => ['All', ...sortTourNamesForUpcoming(upcomingShows).filter((tour) => tour !== 'All')], [upcomingShows]);
  const pastTours = useMemo(() => ['All', ...sortTourNamesForPast(pastShows).filter((tour) => tour !== 'All')], [pastShows]);

  useEffect(() => { if (!upcomingTours.includes(upcomingTour)) setUpcomingTour('All'); }, [upcomingTour, upcomingTours]);
  useEffect(() => { if (!pastTours.includes(pastTour)) setPastTour('All'); }, [pastTour, pastTours]);

  const filteredUpcomingShows = useMemo(() => upcomingShows.filter((show) => (upcomingTour === 'All' || normalizeTourName(show.tour_name) === upcomingTour) && [show.city, show.region, show.country, show.venue_name, show.tour_name, show.label, show.day_type, show.date].join(' ').toLowerCase().includes(upcomingSearch.trim().toLowerCase())), [upcomingShows, upcomingTour, upcomingSearch]);
  const filteredPastShows = useMemo(() => pastShows.filter((show) => (pastTour === 'All' || normalizeTourName(show.tour_name) === pastTour) && [show.city, show.region, show.country, show.venue_name, show.tour_name, show.label, show.day_type, show.date].join(' ').toLowerCase().includes(pastSearch.trim().toLowerCase())), [pastShows, pastTour, pastSearch]);

  const activeWorkspaceRole = useMemo(() => getWorkspaceRole(memberships, activeWorkspaceId), [memberships, activeWorkspaceId]);
  const canCreateDateInWorkspace = canCreateDates(activeWorkspaceRole);
  const hasAdminAnywhere = useMemo(() => hasAnyAdminAccess(memberships), [memberships]);
  const activeCollection = tab === 'past' ? filteredPastShows : filteredUpcomingShows;
  const totalCollection = tab === 'past' ? pastShows : upcomingShows;
  const dayTypeSummary = useMemo(() => summarizeDayTypes(activeCollection), [activeCollection]);

  const pastByYear = useMemo(() => {
    const groups = new Map<string, Show[]>();
    for (const show of filteredPastShows) {
      const year = String(yearFromDate(show.date) ?? 'Unknown');
      groups.set(year, [...(groups.get(year) ?? []), show]);
    }
    return Array.from(groups.entries()).sort((a, b) => {
      if (a[0] === 'Unknown') return 1;
      if (b[0] === 'Unknown') return -1;
      return Number(b[0]) - Number(a[0]);
    });
  }, [filteredPastShows]);

  // When an invite token is present and the flow is in the auto-processing phase (idle →
  // accepting → joining), suppress all content and show a seamless loading skeleton.  This
  // prevents the brief flash of the InviteAcceptancePanel / "Finishing workspace access…"
  // message that was visible for at least one render frame before the auto-accept fired.
  // The skeleton gives way naturally once either (a) the joining phase resolves and the
  // workspace becomes active, or (b) the flow transitions to 'error' and we need to show
  // the recovery UI.
  const isAutoProcessingInvite =
    Boolean(inviteToken) &&
    (inviteFlow.phase === 'idle' || inviteFlow.phase === 'accepting' || inviteFlow.phase === 'joining');

  const showBlockingLoading =
    isAutoProcessingInvite ||
    (contextLoading && !hasLoadedOnce) ||
    (loading && !hasLoadedOnce && shows.length === 0);
  const isRefreshing = loading && hasLoadedOnce;

  if (showBlockingLoading) return (
    <div className="space-y-3">
      {isAutoProcessingInvite ? (
        <div className="flex items-center gap-2 px-1 pb-1 text-xs text-zinc-500">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-sky-400/70" aria-hidden="true" />
          Joining workspace…
        </div>
      ) : null}
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-[28px] border border-white/10 bg-white/[0.03]" />
      ))}
    </div>
  );

  if (!activeWorkspaceId) {
    const hasWorkspaceAccess = workspaces.length > 0;
    const hasPendingInvite = inviteToken.length > 0;
    // isFirstRun gates the self-serve workspace creation panel.  It must be false whenever the
    // user is already a collaborator — i.e. has accepted an invite and has workspace_members
    // rows.  The context API guarantees memberships and workspaces are populated for any
    // confirmed collaborator, so checking BOTH covers the case where the API returned partial
    // data (e.g. project-scoped memberships whose grant rows could not be read).
    const isFirstRun = !hasPendingInvite && memberships.length === 0 && workspaces.length === 0;

    return (
      <div className="space-y-3">
        {inviteToken ? <InviteAcceptancePanel key={`invite:${inviteToken}`} initialToken={inviteFlow.phase === 'error' ? inviteFlow.token : inviteToken} flowState={inviteFlow} activeWorkspaceId={activeWorkspaceId} onAcceptStart={() => setInviteFlow({ phase: 'accepting' })} onAccepted={(invite) => handleInviteAccepted(invite)} /> : null}
        {isFirstRun && inviteFlow.phase === 'idle' ? (
          <SelfServeOnboardingPanel onCompleted={refreshContext} />
        ) : (
          <ActivationEmptyState
            title={inviteFlow.phase === 'joining'
              ? 'Joining your invited workspace…'
              : inviteFlow.phase === 'error'
                ? 'Invite accepted, but access is still loading.'
                : hasPendingInvite
                  ? 'Finishing workspace access…'
                  : hasWorkspaceAccess
                    ? 'No workspace selected.'
                    : 'No workspace access yet.'}
            body={inviteFlow.phase === 'joining'
              ? 'TourBook accepted your invite and is still syncing the invited workspace or project into this session. Stay on this screen while we keep retrying.'
              : inviteFlow.phase === 'error'
                ? inviteFlow.message
                : hasPendingInvite
                  ? 'TourBook detected an invite on this sign-in. We are applying that access now. If it does not resolve automatically, use the invite panel above.'
                  : hasWorkspaceAccess
                    ? 'Your account has workspace access, but no workspace is active in this session. Open Admin to refresh context and continue.'
                    : 'You do not have a workspace yet. Ask a workspace owner to invite you, then refresh this page.'}
            actions={inviteFlow.phase === 'error'
              ? [{ label: 'Retry invite access', href: '/', tone: 'primary', ctaId: 'retry_invite_access' }]
              : hasAdminAnywhere
                ? [
                    { label: 'Open Admin', href: '/admin', tone: 'primary', ctaId: 'open_admin' },
                    { label: 'Past Dates', href: '/?tab=past', ctaId: 'view_past_dates' },
                  ]
                : [{ label: 'Past Dates', href: '/?tab=past', ctaId: 'view_past_dates' }]}
            telemetry={{
              stateType: inviteFlow.phase === 'joining'
                ? 'invite.joining'
                : inviteFlow.phase === 'error'
                  ? 'invite.joining_failed'
                  : hasWorkspaceAccess ? 'crew.no_workspace_selected' : 'crew.no_workspace_access',
            }}
          />
        )}
      </div>
    );
  }

  if (!activeProjectId) {
    const hasAnyProject = projects.length > 0;
    const firstRunState = getCrewNoArtistsState(activeWorkspaceRole, hasAnyProject);
    return (
      <div className="space-y-3">
        {inviteToken ? <InviteAcceptancePanel key={`invite:${inviteToken}`} initialToken={inviteFlow.phase === 'error' ? inviteFlow.token : inviteToken} flowState={inviteFlow} activeWorkspaceId={activeWorkspaceId} onAcceptStart={() => setInviteFlow({ phase: 'accepting' })} onAccepted={(invite) => handleInviteAccepted(invite)} /> : null}
        <ActivationEmptyState
          title={firstRunState.title}
          body={firstRunState.body}
          actions={firstRunState.actions}
          telemetry={{
            stateType: hasAnyProject ? 'crew.no_active_artist' : 'crew.no_artists',
            workspaceId: activeWorkspaceId,
            role: activeWorkspaceRole,
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {inviteToken ? <InviteAcceptancePanel key={`invite:${inviteToken}`} initialToken={inviteFlow.phase === 'error' ? inviteFlow.token : inviteToken} flowState={inviteFlow} activeWorkspaceId={activeWorkspaceId} onAcceptStart={() => setInviteFlow({ phase: 'accepting' })} onAccepted={(invite) => handleInviteAccepted(invite)} /> : null}
      <OfflineStatus
        savedAt={lastSavedAt}
        source={statusSource}
        emptyOfflineMessage={loadError ? 'No recent itinerary is saved on this device yet. Reopen TourBook online once and your latest dates will be available here in weak signal.' : null}
      />
      {isRefreshing ? (
        <div className="flex items-center gap-2 px-1 text-xs text-zinc-500">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-sky-400/70" aria-hidden="true" />
          Refreshing dates…
        </div>
      ) : null}
      {loadError ? <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{loadError}</div> : null}

      <section className="overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.045]">
        <div className="border-b border-white/8 px-4 py-4 sm:px-5 sm:py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                Crew itinerary
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">
                  {tab === 'past' ? 'Past dates' : 'Upcoming dates'}
                </h1>
                <span className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-zinc-300">
                  {activeCollection.length}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 py-4 sm:px-5">
          <div className="flex flex-row items-center gap-2">
            <SearchInput value={tab === 'past' ? pastSearch : upcomingSearch} onChange={tab === 'past' ? setPastSearch : setUpcomingSearch} />
            <FilterSelect value={tab === 'past' ? pastTour : upcomingTour} onChange={tab === 'past' ? setPastTour : setUpcomingTour} options={tab === 'past' ? pastTours : upcomingTours} ariaLabel={`${tab} dates tour filter`} />
          </div>
        </div>
      </section>

      {tab === 'past' ? (
        pastByYear.length === 0 ? (
          pastShows.length === 0 ? (
          <ActivationEmptyState
            title="No past dates yet."
            body="Past dates will appear here after your first show is added and completed."
            actions={canCreateDateInWorkspace
              ? [{ label: 'Open Admin', href: '/admin', tone: 'primary', ctaId: 'open_admin' }, { label: 'Upcoming Dates', href: '/?tab=upcoming', ctaId: 'view_upcoming_dates' }]
              : [{ label: 'Upcoming Dates', href: '/?tab=upcoming', ctaId: 'view_upcoming_dates' }]}
            telemetry={{
              stateType: 'crew.no_past_dates',
              workspaceId: activeWorkspaceId,
              projectId: activeProjectId,
              role: activeWorkspaceRole,
            }}
          />
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-zinc-500">No results</div>
          )
        ) : (
          <div className="space-y-6">
            {pastByYear.map(([year, items]) => (
              <section key={year} className="space-y-3">
                <div className="sticky top-[100px] z-10 flex items-center gap-3 bg-zinc-950/92 py-1.5 backdrop-blur">
                  <div className="h-px flex-1 bg-white/10" aria-hidden="true" />
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">{year}</span>
                  <div className="h-px flex-1 bg-white/10" aria-hidden="true" />
                </div>
                <div className="grid gap-3">{items.map((show) => <ShowCard key={show.id} show={show} tab="past" />)}</div>
              </section>
            ))}
          </div>
        )
      ) : filteredUpcomingShows.length === 0 ? (
        upcomingShows.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-zinc-500">No upcoming dates</div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-zinc-500">No results</div>
        )
      ) : <div className="grid gap-3">{filteredUpcomingShows.map((show) => <ShowCard key={show.id} show={show} tab="upcoming" />)}</div>}
    </div>
  );
}

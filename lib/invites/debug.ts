import type { BootstrapContext, WorkspaceInviteSummary, WorkspaceScopeType } from '@/lib/types/tenant';

export const INVITE_DEBUG_STORAGE_KEY = 'tourbook.inviteDebug';
const INVITE_DEBUG_MAX_AGE_MS = 30 * 60 * 1000;

export type InviteDebugContextSnapshot = {
  at: number;
  membershipCount: number;
  workspaceCount: number;
  projectCount: number;
  tourCount: number;
  activeWorkspaceId: string | null;
  activeProjectId: string | null;
  activeTourId: string | null;
  isEmpty: boolean;
  hasInviteAccess?: boolean;
};

export type InviteDebugRecord = {
  updatedAt?: number;
  source: 'accept-invite' | 'dashboard' | 'login' | 'invite-link';
  tokenDetected?: boolean;
  authUserId?: string | null;
  authEmail?: string | null;
  acceptAttemptedAt?: number;
  acceptSucceeded?: boolean;
  acceptError?: string | null;
  acceptedInvite?: {
    id: string;
    workspaceId: string;
    role: string;
    scopeType: WorkspaceScopeType;
    projectIds: string[];
    tourIds: string[];
  } | null;
  pendingScope?: {
    workspaceId: string;
    scopeType: WorkspaceScopeType;
    projectIds: string[];
    tourIds: string[];
    acceptedAt?: number;
  } | null;
  contextSnapshots?: InviteDebugContextSnapshot[];
  latestContext?: InviteDebugContextSnapshot | null;
  redirectAttempted?: {
    at: number;
    to: string;
    reason: string;
  } | null;
  notes?: string[];
};

function canUseStorage() {
  return typeof window !== 'undefined';
}

export function readInviteDebugRecord(): InviteDebugRecord | null {
  if (!canUseStorage()) return null;
  const raw = window.localStorage.getItem(INVITE_DEBUG_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as InviteDebugRecord | null;
    if (!parsed?.updatedAt || Date.now() - parsed.updatedAt > INVITE_DEBUG_MAX_AGE_MS) {
      window.localStorage.removeItem(INVITE_DEBUG_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    window.localStorage.removeItem(INVITE_DEBUG_STORAGE_KEY);
    return null;
  }
}

export function writeInviteDebugRecord(update: Partial<InviteDebugRecord> | ((current: InviteDebugRecord | null) => InviteDebugRecord | null)) {
  if (!canUseStorage()) return;
  const current = readInviteDebugRecord();
  const next = typeof update === 'function' ? update(current) : { ...(current ?? {}), ...update };
  if (!next) {
    window.localStorage.removeItem(INVITE_DEBUG_STORAGE_KEY);
    return;
  }
  const normalized: InviteDebugRecord = {
    source: next.source ?? current?.source ?? 'accept-invite',
    ...next,
    updatedAt: Date.now(),
  };
  window.localStorage.setItem(INVITE_DEBUG_STORAGE_KEY, JSON.stringify(normalized));
}

export function clearInviteDebugRecord() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(INVITE_DEBUG_STORAGE_KEY);
}

export function appendInviteDebugNote(note: string) {
  writeInviteDebugRecord((current) => ({
    ...(current ?? { source: 'accept-invite' }),
    notes: [...(current?.notes ?? []), note].slice(-12),
  }));
}

export function summarizeBootstrapContext(context: BootstrapContext, extras?: { hasInviteAccess?: boolean }): InviteDebugContextSnapshot {
  return {
    at: Date.now(),
    membershipCount: context.memberships.length,
    workspaceCount: context.workspaces.length,
    projectCount: context.projects.length,
    tourCount: context.tours.length,
    activeWorkspaceId: context.activeWorkspaceId,
    activeProjectId: context.activeProjectId,
    activeTourId: context.activeTourId,
    isEmpty: context.memberships.length === 0 && context.workspaces.length === 0 && context.projects.length === 0 && context.tours.length === 0,
    ...(typeof extras?.hasInviteAccess === 'boolean' ? { hasInviteAccess: extras.hasInviteAccess } : {}),
  };
}

export function summarizeInvite(invite: WorkspaceInviteSummary) {
  return {
    id: invite.id,
    workspaceId: invite.workspaceId,
    role: invite.role,
    scopeType: invite.scopeType,
    projectIds: invite.projectIds,
    tourIds: invite.tourIds,
  };
}

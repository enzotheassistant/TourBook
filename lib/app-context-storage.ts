import type { WorkspaceScopeType } from '@/lib/types/tenant';

export const WORKSPACE_STORAGE_KEY = 'tourbook.activeWorkspaceId';
export const PROJECT_STORAGE_KEY = 'tourbook.activeProjectId';
export const TOUR_STORAGE_KEY = 'tourbook.activeTourId';
export const PENDING_INVITE_TOKEN_STORAGE_KEY = 'tourbook.pendingInviteToken';
export const PENDING_INVITE_SCOPE_STORAGE_KEY = 'tourbook.pendingInviteScope';

export type PendingInviteScope = {
  workspaceId: string;
  scopeType: WorkspaceScopeType;
  projectIds: string[];
  tourIds: string[];
  acceptedAt: number;
};

function readLocalStorage(key: string) {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(key);
}

export function readPendingInviteToken() {
  return readLocalStorage(PENDING_INVITE_TOKEN_STORAGE_KEY)?.trim() ?? '';
}

export function writePendingInviteToken(token: string) {
  if (typeof window === 'undefined') return;
  const trimmed = token.trim();
  if (!trimmed) return;
  window.localStorage.setItem(PENDING_INVITE_TOKEN_STORAGE_KEY, trimmed);
}

export function clearPendingInviteToken() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PENDING_INVITE_TOKEN_STORAGE_KEY);
}

export function readPendingInviteScope(): PendingInviteScope | null {
  const raw = readLocalStorage(PENDING_INVITE_SCOPE_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PendingInviteScope> | null;
    if (!parsed?.workspaceId || !parsed?.scopeType) return null;
    return {
      workspaceId: String(parsed.workspaceId),
      scopeType: parsed.scopeType,
      projectIds: Array.isArray(parsed.projectIds) ? parsed.projectIds.map(String) : [],
      tourIds: Array.isArray(parsed.tourIds) ? parsed.tourIds.map(String) : [],
      acceptedAt: typeof parsed.acceptedAt === 'number' ? parsed.acceptedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function writePendingInviteScope(scope: Omit<PendingInviteScope, 'acceptedAt'>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PENDING_INVITE_SCOPE_STORAGE_KEY, JSON.stringify({
    ...scope,
    projectIds: scope.projectIds ?? [],
    tourIds: scope.tourIds ?? [],
    acceptedAt: Date.now(),
  } satisfies PendingInviteScope));
}

export function clearPendingInviteScope() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PENDING_INVITE_SCOPE_STORAGE_KEY);
}

export function clearAppContextStorage() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  window.localStorage.removeItem(PROJECT_STORAGE_KEY);
  window.localStorage.removeItem(TOUR_STORAGE_KEY);
}

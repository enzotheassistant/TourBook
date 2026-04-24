import type { WorkspaceScopeType } from '@/lib/types/tenant';

const SCOPE_PRECEDENCE: Record<WorkspaceScopeType, number> = {
  tours: 1,
  projects: 2,
  workspace: 3,
};

export function normalizeScopeTypeValue(value: unknown): WorkspaceScopeType | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw || raw === 'workspace') return 'workspace';
  if (raw === 'projects') return 'projects';
  if (raw === 'tours') return 'tours';
  return null;
}

export function normalizeGrantSet(ids: string[]) {
  return [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))].sort();
}

export function hasExactTourInviteSet(existingIds: string[], requestedIds: string[]) {
  return normalizeGrantSet(existingIds).join(',') === normalizeGrantSet(requestedIds).join(',');
}

export function resolveScopePrecedence(currentScope: WorkspaceScopeType, invitedScope: WorkspaceScopeType) {
  return SCOPE_PRECEDENCE[invitedScope] > SCOPE_PRECEDENCE[currentScope] ? invitedScope : currentScope;
}

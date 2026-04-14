import type { WorkspaceRole } from '../../types/tenant';

export const GUEST_LIST_WRITE_ROLES: readonly WorkspaceRole[] = ['owner', 'admin', 'editor'];

export function canMutateGuestList(role: WorkspaceRole | null | undefined): boolean {
  return !!role && GUEST_LIST_WRITE_ROLES.includes(role);
}

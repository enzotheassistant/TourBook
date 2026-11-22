import type { WorkspaceRole } from '../../types/tenant';

/** Who can edit or remove guest list names: Managers and Owners. */
export const GUEST_LIST_WRITE_ROLES: readonly WorkspaceRole[] = ['owner', 'admin', 'editor'];

/** Who can see the guest list and add names: Crew and above (not Viewers). */
export const GUEST_LIST_ADD_ROLES: readonly WorkspaceRole[] = ['owner', 'admin', 'editor', 'crew'];

export function canMutateGuestList(role: WorkspaceRole | null | undefined): boolean {
  return !!role && GUEST_LIST_WRITE_ROLES.includes(role);
}

export function canAddToGuestList(role: WorkspaceRole | null | undefined): boolean {
  return !!role && GUEST_LIST_ADD_ROLES.includes(role);
}

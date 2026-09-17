export type WorkspaceInviteAcceptStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export type InviteAcceptDecision =
  | { kind: 'claimed' }
  | { kind: 'already-accepted-by-self' }
  | { kind: 'revoked' }
  | { kind: 'expired' }
  | { kind: 'accepted-by-other' }
  | { kind: 'not-pending' };

/**
 * Decides what an invite-accept attempt should do, given whether the atomic
 * `UPDATE workspace_invites SET status = 'accepted' WHERE status = 'pending'`
 * claim succeeded, and (if it didn't) the invite's current status.
 *
 * Membership/scope grants must only ever be created when the result is
 * 'claimed' or 'already-accepted-by-self' (see `grantsMembershipOnAccept`).
 * Every other outcome must leave workspace_members untouched — in
 * particular, a concurrent revoke that wins the race must never be
 * followed by a membership grant.
 */
export function resolveInviteAcceptOutcome(params: {
  claimed: boolean;
  currentStatus: WorkspaceInviteAcceptStatus | null;
  currentAcceptedByUserId: string | null;
  userId: string;
}): InviteAcceptDecision {
  if (params.claimed) return { kind: 'claimed' };

  if (params.currentStatus === 'accepted' && params.currentAcceptedByUserId === params.userId) {
    return { kind: 'already-accepted-by-self' };
  }
  if (params.currentStatus === 'revoked') return { kind: 'revoked' };
  if (params.currentStatus === 'expired') return { kind: 'expired' };
  if (params.currentStatus === 'accepted') return { kind: 'accepted-by-other' };
  return { kind: 'not-pending' };
}

export function grantsMembershipOnAccept(decision: InviteAcceptDecision): boolean {
  return decision.kind === 'claimed' || decision.kind === 'already-accepted-by-self';
}

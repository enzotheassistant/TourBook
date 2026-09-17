import test from 'node:test';
import assert from 'node:assert/strict';

import { grantsMembershipOnAccept, resolveInviteAcceptOutcome } from './invite-accept-utils.ts';

const userId = 'user_1';
const otherUserId = 'user_2';

test('a successful atomic claim always grants membership, regardless of the stale snapshot', () => {
  const decision = resolveInviteAcceptOutcome({
    claimed: true,
    currentStatus: 'revoked', // irrelevant once claimed is true
    currentAcceptedByUserId: null,
    userId,
  });

  assert.deepEqual(decision, { kind: 'claimed' });
  assert.equal(grantsMembershipOnAccept(decision), true);
});

test('a concurrent revoke that wins the race must never grant membership', () => {
  // This is the exact bug: an admin revokes at the moment someone else is
  // mid-accept. The atomic claim loses (claimed=false) and the invite's
  // current status is 'revoked'. Membership must not be granted.
  const decision = resolveInviteAcceptOutcome({
    claimed: false,
    currentStatus: 'revoked',
    currentAcceptedByUserId: null,
    userId,
  });

  assert.deepEqual(decision, { kind: 'revoked' });
  assert.equal(grantsMembershipOnAccept(decision), false);
});

test('an invite that expired between read and claim must never grant membership', () => {
  const decision = resolveInviteAcceptOutcome({
    claimed: false,
    currentStatus: 'expired',
    currentAcceptedByUserId: null,
    userId,
  });

  assert.deepEqual(decision, { kind: 'expired' });
  assert.equal(grantsMembershipOnAccept(decision), false);
});

test('a duplicate accept by the same user (double-click, retried tab) is treated as success, not an error', () => {
  const decision = resolveInviteAcceptOutcome({
    claimed: false,
    currentStatus: 'accepted',
    currentAcceptedByUserId: userId,
    userId,
  });

  assert.deepEqual(decision, { kind: 'already-accepted-by-self' });
  assert.equal(grantsMembershipOnAccept(decision), true);
});

test('an invite already accepted by a different account never grants membership to the caller', () => {
  const decision = resolveInviteAcceptOutcome({
    claimed: false,
    currentStatus: 'accepted',
    currentAcceptedByUserId: otherUserId,
    userId,
  });

  assert.deepEqual(decision, { kind: 'accepted-by-other' });
  assert.equal(grantsMembershipOnAccept(decision), false);
});

test('an unexpected non-pending state falls back to a safe denial', () => {
  const decision = resolveInviteAcceptOutcome({
    claimed: false,
    currentStatus: null,
    currentAcceptedByUserId: null,
    userId,
  });

  assert.deepEqual(decision, { kind: 'not-pending' });
  assert.equal(grantsMembershipOnAccept(decision), false);
});

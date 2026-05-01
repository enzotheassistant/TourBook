import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldClearInviteArtifactsOnError } from './client-state.ts';

test('clears stale invite artifacts for mismatched authenticated account', () => {
  assert.equal(shouldClearInviteArtifactsOnError('Invite email does not match your authenticated account.'), true);
});

test('clears stale invite artifacts for non-actionable invite failures', () => {
  assert.equal(shouldClearInviteArtifactsOnError('Invite token is invalid.'), true);
  assert.equal(shouldClearInviteArtifactsOnError('Invite has been revoked.'), true);
  assert.equal(shouldClearInviteArtifactsOnError('Invite has expired.'), true);
  assert.equal(shouldClearInviteArtifactsOnError('Invite scope is invalid: no projects assigned.'), true);
});

test('retains invite artifacts for retryable acceptance failures', () => {
  assert.equal(shouldClearInviteArtifactsOnError('Unable to accept invite.'), false);
  assert.equal(shouldClearInviteArtifactsOnError('Network error. Check your connection and try again.'), false);
  assert.equal(shouldClearInviteArtifactsOnError('Server error. Please try again in a moment.'), false);
});

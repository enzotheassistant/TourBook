import test from 'node:test';
import assert from 'node:assert/strict';

import { buildInviteContinuationHref, buildLoginRedirectHref, readInviteTokenFromSearch } from './login-redirect.ts';

test('reads inviteToken from query search', () => {
  assert.equal(readInviteTokenFromSearch('?inviteToken=abc123'), 'abc123');
  assert.equal(readInviteTokenFromSearch('inviteToken=abc123'), 'abc123');
});

test('falls back to legacy token query key', () => {
  assert.equal(readInviteTokenFromSearch('?token=legacy456'), 'legacy456');
});

test('builds login redirect that preserves invite token', () => {
  assert.equal(buildLoginRedirectHref('?inviteToken=abc123'), '/login?inviteToken=abc123');
  assert.equal(buildLoginRedirectHref('?tab=past&token=legacy456'), '/login?inviteToken=legacy456');
});

test('builds plain login redirect when no invite token exists', () => {
  assert.equal(buildLoginRedirectHref('?tab=past'), '/login');
  assert.equal(buildLoginRedirectHref(''), '/login');
});

test('builds invite continuation href for deterministic post-auth join', () => {
  assert.equal(buildInviteContinuationHref('abc123'), '/accept-invite?token=abc123');
  assert.equal(buildInviteContinuationHref('  legacy456  '), '/accept-invite?token=legacy456');
  assert.equal(buildInviteContinuationHref(''), '/');
});

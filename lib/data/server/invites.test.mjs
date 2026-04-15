import test from 'node:test';
import assert from 'node:assert/strict';

import { buildInviteExpiry, generateInviteToken, hashInviteToken, validateInviteRole } from '../../invites/security.ts';

test('validateInviteRole allows admin/editor/viewer', () => {
  assert.equal(validateInviteRole('admin'), 'admin');
  assert.equal(validateInviteRole('editor'), 'editor');
  assert.equal(validateInviteRole('viewer'), 'viewer');
});

test('validateInviteRole rejects owner role and unknown values', () => {
  assert.throws(() => validateInviteRole('owner'));
  assert.throws(() => validateInviteRole(''));
});

test('generateInviteToken returns non-guessable random token with stable hashing', () => {
  const tokenA = generateInviteToken();
  const tokenB = generateInviteToken();

  assert.notEqual(tokenA, tokenB);
  assert.ok(tokenA.length >= 32);
  assert.equal(hashInviteToken(tokenA), hashInviteToken(tokenA));
  assert.notEqual(hashInviteToken(tokenA), hashInviteToken(tokenB));
});

test('buildInviteExpiry defaults to 14 day window', () => {
  const start = new Date('2026-01-01T00:00:00.000Z');
  const expires = new Date(buildInviteExpiry(start));
  const ms = expires.getTime() - start.getTime();
  const days = ms / (1000 * 60 * 60 * 24);

  assert.equal(days, 14);
});

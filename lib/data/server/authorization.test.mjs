import test from 'node:test';
import assert from 'node:assert/strict';

import { GUEST_LIST_WRITE_ROLES, canMutateGuestList } from './authorization.ts';

test('guest-list write roles include owner/admin/editor only', () => {
  assert.deepEqual([...GUEST_LIST_WRITE_ROLES], ['owner', 'admin', 'editor']);
});

test('viewer is denied guest-list mutation', () => {
  assert.equal(canMutateGuestList('viewer'), false);
});

test('owner/admin/editor are allowed guest-list mutation', () => {
  assert.equal(canMutateGuestList('owner'), true);
  assert.equal(canMutateGuestList('admin'), true);
  assert.equal(canMutateGuestList('editor'), true);
});

test('non-member role is denied guest-list mutation', () => {
  assert.equal(canMutateGuestList(undefined), false);
  assert.equal(canMutateGuestList(null), false);
});

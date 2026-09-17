import test from 'node:test';
import assert from 'node:assert/strict';

import { selectOfflineCacheKeysToRemove } from './offline-cache.ts';

test('selectOfflineCacheKeysToRemove targets only tourbook.offline: keys', () => {
  const allKeys = [
    'tourbook.offline:itinerary:ws1:proj1:all:published',
    'tourbook.offline:day:ws1:show1',
    'tourbook.offline:guest-list:ws1:show1',
    'tourbook.activeWorkspaceId',
    'tourbook.pendingInviteToken',
    'tb-email',
    'some-unrelated-key',
  ];

  assert.deepEqual(selectOfflineCacheKeysToRemove(allKeys), [
    'tourbook.offline:itinerary:ws1:proj1:all:published',
    'tourbook.offline:day:ws1:show1',
    'tourbook.offline:guest-list:ws1:show1',
  ]);
});

test('selectOfflineCacheKeysToRemove does not match a key that merely shares the prefix string without the separator', () => {
  // Guards against a substring match on 'tourbook.offline' without the
  // trailing ':' accidentally sweeping up an unrelated key.
  assert.deepEqual(selectOfflineCacheKeysToRemove(['tourbook.offlineSomethingElse']), []);
});

test('selectOfflineCacheKeysToRemove returns an empty array when nothing matches', () => {
  assert.deepEqual(selectOfflineCacheKeysToRemove(['tourbook.activeProjectId', 'tb-rt']), []);
});

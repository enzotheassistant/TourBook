import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAccountDeleteConfirmed,
  workspaceNameMatches,
  accountDeletionBlocker,
  passwordCheckMessage,
} from './deletion-rules.ts';

test('DELETE confirm ignores capitals and spaces, nothing else', () => {
  assert.equal(isAccountDeleteConfirmed('DELETE'), true);
  assert.equal(isAccountDeleteConfirmed(' delete '), true);
  assert.equal(isAccountDeleteConfirmed('DELET'), false);
  assert.equal(isAccountDeleteConfirmed(''), false);
});

test('workspace name must match (capitals and extra spaces ignored)', () => {
  assert.equal(workspaceNameMatches('texas king  hq', 'Texas King HQ'), true);
  assert.equal(workspaceNameMatches('Texas King', 'Texas King HQ'), false);
  assert.equal(workspaceNameMatches('', ''), false);
});

test('owners are blocked with a clear message', () => {
  assert.equal(accountDeletionBlocker([]), null);
  assert.match(accountDeletionBlocker(['TourBook Workspace']), /You own TourBook Workspace\. Delete that workspace first/);
  assert.match(accountDeletionBlocker(['A', 'B', 'C']), /You own A, B and C\. Delete those workspaces first/);
});

test('password check messages', () => {
  assert.equal(passwordCheckMessage('Invalid login credentials'), "That password isn't right.");
  assert.match(passwordCheckMessage('For security purposes, you can only request this after 30 seconds'), /wait a minute/);
});

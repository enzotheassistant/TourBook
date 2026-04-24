import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hasExactTourInviteSet,
  normalizeGrantSet,
  normalizeScopeTypeValue,
  resolveScopePrecedence,
} from './invite-scope-utils.ts';

test('normalizeScopeTypeValue supports workspace, projects, and tours', () => {
  assert.equal(normalizeScopeTypeValue('workspace'), 'workspace');
  assert.equal(normalizeScopeTypeValue('projects'), 'projects');
  assert.equal(normalizeScopeTypeValue('tours'), 'tours');
  assert.equal(normalizeScopeTypeValue(''), 'workspace');
  assert.equal(normalizeScopeTypeValue('nope'), null);
});

test('normalizeGrantSet trims, dedupes, and sorts ids', () => {
  assert.deepEqual(normalizeGrantSet([' tour_b ', 'tour_a', 'tour_b', '', 'tour_c']), ['tour_a', 'tour_b', 'tour_c']);
});

test('hasExactTourInviteSet matches identical sets regardless of order', () => {
  assert.equal(hasExactTourInviteSet(['tour_b', 'tour_a'], ['tour_a', 'tour_b']), true);
  assert.equal(hasExactTourInviteSet(['tour_a', 'tour_b'], ['tour_a']), false);
  assert.equal(hasExactTourInviteSet(['tour_a'], ['tour_a', 'tour_b']), false);
});

test('resolveScopePrecedence widens only when invited scope is broader', () => {
  assert.equal(resolveScopePrecedence('tours', 'projects'), 'projects');
  assert.equal(resolveScopePrecedence('tours', 'workspace'), 'workspace');
  assert.equal(resolveScopePrecedence('projects', 'tours'), 'projects');
  assert.equal(resolveScopePrecedence('workspace', 'tours'), 'workspace');
  assert.equal(resolveScopePrecedence('projects', 'projects'), 'projects');
});

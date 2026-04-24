import test from 'node:test';
import assert from 'node:assert/strict';

import { canAccessProjectByScope, canAccessTourByScope } from './project-scope-utils.ts';

test('workspace-scoped access can read any project in workspace', () => {
  assert.equal(canAccessProjectByScope('workspace', [], 'project_any'), true);
});

test('project-scoped access only allows explicit grants', () => {
  assert.equal(canAccessProjectByScope('projects', ['project_a', 'project_b'], 'project_a'), true);
  assert.equal(canAccessProjectByScope('projects', ['project_a', 'project_b'], 'project_b'), true);
  assert.equal(canAccessProjectByScope('projects', ['project_a', 'project_b'], 'project_c'), false);
  assert.equal(canAccessProjectByScope('projects', ['project_a', 'project_b'], ''), false);
});

test('tour-scoped access allows project only when a tour exists under it', () => {
  assert.equal(canAccessProjectByScope('tours', ['project_a'], 'project_a'), true);
  assert.equal(canAccessProjectByScope('tours', ['project_a'], 'project_b'), false);
});

test('tour-scoped access only allows explicit granted tours and blocks untoured items', () => {
  assert.equal(canAccessTourByScope('tours', ['project_a'], ['tour_1', 'tour_2'], 'project_a', 'tour_1'), true);
  assert.equal(canAccessTourByScope('tours', ['project_a'], ['tour_1', 'tour_2'], 'project_a', 'tour_3'), false);
  assert.equal(canAccessTourByScope('tours', ['project_a'], ['tour_1', 'tour_2'], 'project_a', null), false);
});

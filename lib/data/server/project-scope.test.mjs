import test from 'node:test';
import assert from 'node:assert/strict';

import { canAccessProjectByScope } from './project-scope-utils.ts';

test('workspace-scoped access can read any project in workspace', () => {
  assert.equal(canAccessProjectByScope('workspace', [], 'project_any'), true);
});

test('project-scoped access only allows explicit grants', () => {
  assert.equal(canAccessProjectByScope('projects', ['project_a', 'project_b'], 'project_a'), true);
  assert.equal(canAccessProjectByScope('projects', ['project_a', 'project_b'], 'project_b'), true);
  assert.equal(canAccessProjectByScope('projects', ['project_a', 'project_b'], 'project_c'), false);
  assert.equal(canAccessProjectByScope('projects', ['project_a', 'project_b'], ''), false);
});

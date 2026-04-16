import test from 'node:test';
import assert from 'node:assert/strict';
import { canSwitchProject, getProjectsForWorkspace, pickNextProjectId } from './project-context.ts';

const projects = [
  { id: 'p1', workspaceId: 'w1', name: 'Artist One', slug: 'artist-one', archivedAt: null },
  { id: 'p2', workspaceId: 'w1', name: 'Artist Two', slug: 'artist-two', archivedAt: null },
  { id: 'p3', workspaceId: 'w2', name: 'Artist Three', slug: 'artist-three', archivedAt: null },
];

test('switch control visibility is hidden for single-project scope', () => {
  assert.equal(canSwitchProject(projects, 'w2'), false);
});

test('switch control visibility is shown for multi-project scope', () => {
  assert.equal(canSwitchProject(projects, 'w1'), true);
});

test('project selection only accepts allowed project ids', () => {
  const allowed = getProjectsForWorkspace(projects, 'w1');
  assert.equal(pickNextProjectId('p1', 'p2', allowed), 'p2');
  assert.equal(pickNextProjectId('p1', 'p3', allowed), 'p1');
});

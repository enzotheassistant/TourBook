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

test('flat project list includes every workspace, sorted by name', async () => {
  const { buildProjectOptions } = await import('./project-context.ts');
  const options = buildProjectOptions(projects, [{ id: 'w1', name: 'One' }, { id: 'w2', name: 'Two' }]);
  assert.deepEqual(options.map((option) => option.label), ['Artist One', 'Artist Three', 'Artist Two']);
  assert.equal(options.find((option) => option.value === 'p3').workspaceId, 'w2');
});

test('flat project list adds the workspace name only for duplicate names', async () => {
  const { buildProjectOptions } = await import('./project-context.ts');
  const dupes = [
    { id: 'a', workspaceId: 'w1', name: 'Texas King', slug: null, archivedAt: null },
    { id: 'b', workspaceId: 'w2', name: 'Texas King', slug: null, archivedAt: null },
    { id: 'c', workspaceId: 'w2', name: 'Other Band', slug: null, archivedAt: null },
  ];
  const labels = buildProjectOptions(dupes, [{ id: 'w1', name: 'Phil' }, { id: 'w2', name: 'Agency' }]).map((option) => option.label);
  assert.deepEqual(labels, ['Other Band', 'Texas King (Agency)', 'Texas King (Phil)']);
});

test('flat project list can be filtered (e.g. projects you manage)', async () => {
  const { buildProjectOptions } = await import('./project-context.ts');
  const options = buildProjectOptions(projects, [], (project) => project.workspaceId === 'w1');
  assert.deepEqual(options.map((option) => option.value), ['p1', 'p2']);
});

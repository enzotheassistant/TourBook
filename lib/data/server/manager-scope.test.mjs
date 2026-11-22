import test from 'node:test';
import assert from 'node:assert/strict';

import { hasFullWorkspaceControl, isManagerAssignableRole, isWithinActorScope, overlapsActorScope } from './manager-scope.ts';

const all = { scopeType: 'workspace', projectIds: [], tourIds: [] };
const bandA = { scopeType: 'projects', projectIds: ['A'], tourIds: [] };
const bandsAB = { scopeType: 'projects', projectIds: ['A', 'B'], tourIds: [] };
const bandB = { scopeType: 'projects', projectIds: ['B'], tourIds: [] };
const tourA1 = { scopeType: 'tours', projectIds: ['A'], tourIds: ['A1'] };
const tourA2 = { scopeType: 'tours', projectIds: ['A'], tourIds: ['A2'] };

test('owners (and retired admins) have full control; managers do not', () => {
  assert.equal(hasFullWorkspaceControl('owner'), true);
  assert.equal(hasFullWorkspaceControl('admin'), true);
  assert.equal(hasFullWorkspaceControl('editor'), false);
  assert.equal(hasFullWorkspaceControl('crew'), false);
});

test('a manager with all projects can manage anyone', () => {
  assert.equal(isWithinActorScope(all, all), true);
  assert.equal(isWithinActorScope(all, bandsAB), true);
});

test('a manager of band A can manage band A people only', () => {
  assert.equal(isWithinActorScope(bandA, bandA), true);
  assert.equal(isWithinActorScope(bandA, tourA1), true);
  assert.equal(isWithinActorScope(bandA, bandB), false);
  assert.equal(isWithinActorScope(bandA, bandsAB), false, 'person also on band B');
  assert.equal(isWithinActorScope(bandA, all), false, 'workspace-wide access is above them');
});

test('a manager limited to one tour can only manage that tour', () => {
  assert.equal(isWithinActorScope(tourA1, tourA1), true);
  assert.equal(isWithinActorScope(tourA1, tourA2), false);
  assert.equal(isWithinActorScope(tourA1, bandA), false);
});

test('empty access lists never count as inside', () => {
  assert.equal(isWithinActorScope(bandA, { scopeType: 'projects', projectIds: [], tourIds: [] }), false);
  assert.equal(isWithinActorScope(tourA1, { scopeType: 'tours', projectIds: ['A'], tourIds: [] }), false);
});

test('team list shows people who share a band with the manager', () => {
  assert.equal(overlapsActorScope(bandA, bandsAB), true);
  assert.equal(overlapsActorScope(bandA, all), true, 'owner shows up');
  assert.equal(overlapsActorScope(bandA, bandB), false);
  assert.equal(overlapsActorScope(tourA1, tourA2), false);
  assert.equal(overlapsActorScope(tourA1, bandA), true);
});

test('managers can hand out Viewer, Crew and Manager only', () => {
  assert.equal(isManagerAssignableRole('viewer'), true);
  assert.equal(isManagerAssignableRole('crew'), true);
  assert.equal(isManagerAssignableRole('editor'), true);
  assert.equal(isManagerAssignableRole('admin'), false);
  assert.equal(isManagerAssignableRole('owner'), false);
});

test('per band: a Manager of band A can only hand out band A (and their own tours)', async () => {
  const { canGrantBandEntry, canManageWholeAccess, managedProjectIdsFor, sharesBandWith } = await import('./manager-scope.ts');
  const managerOfA = { allProjects: false, role: 'editor', entries: [{ projectId: 'A', role: 'editor', tourIds: [] }, { projectId: 'B', role: 'crew', tourIds: [] }] };
  assert.deepEqual(managedProjectIdsFor(managerOfA, ['A', 'B', 'C']), ['A']);
  assert.equal(canGrantBandEntry(managerOfA, { projectId: 'A', role: 'editor', tourIds: [] }), true);
  assert.equal(canGrantBandEntry(managerOfA, { projectId: 'B', role: 'viewer', tourIds: [] }), false, 'only Crew on B');
  assert.equal(canGrantBandEntry(managerOfA, { projectId: 'A', role: 'admin', tourIds: [] }), false);

  const tourManager = { allProjects: false, role: 'editor', entries: [{ projectId: 'A', role: 'editor', tourIds: ['t1'] }] };
  assert.equal(canGrantBandEntry(tourManager, { projectId: 'A', role: 'viewer', tourIds: ['t1'] }), true);
  assert.equal(canGrantBandEntry(tourManager, { projectId: 'A', role: 'viewer', tourIds: ['t2'] }), false);
  assert.equal(canGrantBandEntry(tourManager, { projectId: 'A', role: 'viewer', tourIds: [] }), false, 'not the whole band');

  const crewOnAandC = { allProjects: false, role: 'crew', entries: [{ projectId: 'A', role: 'crew', tourIds: [] }, { projectId: 'C', role: 'viewer', tourIds: [] }] };
  assert.equal(canManageWholeAccess(managerOfA, crewOnAandC), false, 'also on band C');
  assert.equal(canManageWholeAccess(managerOfA, { allProjects: false, role: 'crew', entries: [{ projectId: 'A', role: 'crew', tourIds: [] }] }), true);
  assert.equal(sharesBandWith(managerOfA, crewOnAandC), true);
  assert.equal(sharesBandWith(tourManager, { allProjects: false, role: 'viewer', entries: [{ projectId: 'Z', role: 'viewer', tourIds: [] }] }), false);

  const allManager = { allProjects: true, role: 'editor', entries: [] };
  assert.deepEqual(managedProjectIdsFor(allManager, ['A', 'B']), ['A', 'B']);
  assert.equal(canManageWholeAccess(allManager, { allProjects: true, role: 'viewer', entries: [] }), true);
});

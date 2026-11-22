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

import test from 'node:test';
import assert from 'node:assert/strict';
import { describeTeamScope, getContextLabel, matchesProjectContext, splitInvitesByStatus } from './team-directory.ts';

const projectNameById = new Map([
  ['p1', 'Artist One'],
  ['p2', 'Artist Two'],
]);

const toursById = new Map([
  ['t1', { id: 't1', name: 'Spring Run', projectId: 'p1' }],
  ['t2', { id: 't2', name: 'Summer Run', projectId: 'p1' }],
  ['t3', { id: 't3', name: 'EU Dates', projectId: 'p2' }],
]);

test('describeTeamScope returns readable workspace copy', () => {
  assert.deepEqual(describeTeamScope({ scopeType: 'workspace', projectIds: [], tourIds: [] }, { projectNameById, toursById }), {
    label: 'Full workspace access',
    detail: 'All artists and tours in this workspace.',
  });
});

test('describeTeamScope summarizes project-limited access with artist names', () => {
  assert.deepEqual(describeTeamScope({ scopeType: 'projects', projectIds: ['p2', 'p1'], tourIds: [] }, { projectNameById, toursById }), {
    label: '2 artists',
    detail: 'Artist One, Artist Two',
  });
});

test('describeTeamScope summarizes tour-limited access with artist and tour names', () => {
  assert.deepEqual(describeTeamScope({ scopeType: 'tours', projectIds: ['p1'], tourIds: ['t2', 't1'] }, { projectNameById, toursById }), {
    label: '2 tours · 1 artist',
    detail: 'Artist One • Spring Run, Summer Run',
  });
});

test('matchesProjectContext includes workspace access and matching scoped entries', () => {
  assert.equal(matchesProjectContext({ scopeType: 'workspace', projectIds: [], tourIds: [] }, 'p1', toursById), true);
  assert.equal(matchesProjectContext({ scopeType: 'projects', projectIds: ['p1'], tourIds: [] }, 'p1', toursById), true);
  assert.equal(matchesProjectContext({ scopeType: 'projects', projectIds: ['p2'], tourIds: [] }, 'p1', toursById), false);
  assert.equal(matchesProjectContext({ scopeType: 'tours', projectIds: ['p1'], tourIds: ['t2'] }, 'p1', toursById), true);
  assert.equal(matchesProjectContext({ scopeType: 'tours', projectIds: ['p2'], tourIds: ['t3'] }, 'p1', toursById), false);
});

test('splitInvitesByStatus separates pending invites from invite history', () => {
  const invites = [
    { id: '1', status: 'pending' },
    { id: '2', status: 'revoked' },
    { id: '3', status: 'expired' },
  ];
  const result = splitInvitesByStatus(invites);
  assert.deepEqual(result.pending.map((invite) => invite.id), ['1']);
  assert.deepEqual(result.history.map((invite) => invite.id), ['2', '3']);
});

test('getContextLabel reflects whether scope applies to the current artist', () => {
  assert.equal(getContextLabel('workspace', true, 'Artist One'), 'Includes Artist One');
  assert.equal(getContextLabel('projects', true, 'Artist One'), 'In Artist One');
  assert.equal(getContextLabel('tours', false, 'Artist One'), 'Outside Artist One');
});

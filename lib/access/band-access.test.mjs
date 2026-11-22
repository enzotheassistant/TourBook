import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyManagerEdits, buildBandAccess, canReachDate, highestRole, mergeAccess, newlyAddedProjects,
  normalizeEntries, roleForProject, toStoredAccess,
} from './band-access.ts';

test('all-projects access gives one level everywhere', () => {
  const access = buildBandAccess({ scopeType: 'workspace', memberRole: 'editor', projectGrants: [], tourGrants: [] });
  assert.equal(access.allProjects, true);
  assert.equal(roleForProject(access, 'anything'), 'editor');
  assert.equal(canReachDate(access, 'p', null), true);
});

test('per-band levels: Crew on Texas King, Manager on Test Band', () => {
  const access = buildBandAccess({
    scopeType: 'projects', memberRole: 'crew',
    projectGrants: [{ projectId: 'tk', role: 'crew' }, { projectId: 'tb', role: 'editor' }],
    tourGrants: [],
  });
  assert.equal(roleForProject(access, 'tk'), 'crew');
  assert.equal(roleForProject(access, 'tb'), 'editor');
  assert.equal(roleForProject(access, 'other'), null);
  assert.equal(access.role, 'editor', 'highest level overall');
});

test('old records without a per-band level fall back to the person\'s level', () => {
  const access = buildBandAccess({ scopeType: 'projects', memberRole: 'viewer', projectGrants: [{ projectId: 'tk' }], tourGrants: [] });
  assert.equal(roleForProject(access, 'tk'), 'viewer');
});

test('whole band on one, only some tours on another', () => {
  const access = buildBandAccess({
    scopeType: 'projects', memberRole: 'viewer',
    projectGrants: [{ projectId: 'tk', role: 'crew' }],
    tourGrants: [{ projectId: 'tb', tourId: 't1', role: 'viewer' }, { projectId: 'tb', tourId: 't2', role: 'viewer' }],
  });
  assert.deepEqual(access.entries.find((e) => e.projectId === 'tb').tourIds.sort(), ['t1', 't2']);
  assert.equal(canReachDate(access, 'tk', null), true);
  assert.equal(canReachDate(access, 'tb', 't1'), true);
  assert.equal(canReachDate(access, 'tb', 't3'), false);
  assert.equal(canReachDate(access, 'tb', null), false, 'dates with no tour are not part of a tour-only grant');
});

test('form input is cleaned: no owner, no blanks, one entry per band', () => {
  const entries = normalizeEntries([
    { projectId: 'a', role: 'crew' }, { projectId: '', role: 'crew' }, { projectId: 'b', role: 'owner' },
    { projectId: 'c', role: 'nope' }, { projectId: 'a', role: 'editor', tourIds: ['t1', 't1', ''] },
  ]);
  assert.deepEqual(entries, [{ projectId: 'a', role: 'editor', tourIds: ['t1'] }]);
});

test('accepting a second invite never lowers anything', () => {
  const current = { allProjects: false, role: 'editor', entries: [{ projectId: 'a', role: 'editor', tourIds: [] }, { projectId: 'b', role: 'viewer', tourIds: ['t1'] }] };
  const granted = { allProjects: false, role: 'crew', entries: [{ projectId: 'a', role: 'viewer', tourIds: [] }, { projectId: 'b', role: 'crew', tourIds: ['t2'] }, { projectId: 'c', role: 'crew', tourIds: [] }] };
  const merged = mergeAccess(current, granted);
  assert.equal(roleForProject(merged, 'a'), 'editor');
  assert.equal(roleForProject(merged, 'b'), 'crew');
  assert.deepEqual(merged.entries.find((e) => e.projectId === 'b').tourIds.sort(), ['t1', 't2']);
  assert.equal(roleForProject(merged, 'c'), 'crew');
});

test('whole band beats some tours when merging', () => {
  const merged = mergeAccess(
    { allProjects: false, role: 'viewer', entries: [{ projectId: 'a', role: 'viewer', tourIds: ['t1'] }] },
    { allProjects: false, role: 'viewer', entries: [{ projectId: 'a', role: 'viewer', tourIds: [] }] },
  );
  assert.deepEqual(merged.entries[0].tourIds, []);
});

test('a Manager only changes the bands they manage', () => {
  const current = { allProjects: false, role: 'editor', entries: [{ projectId: 'mine', role: 'viewer', tourIds: [] }, { projectId: 'theirs', role: 'editor', tourIds: [] }] };
  const next = applyManagerEdits({
    current,
    edits: [{ projectId: 'mine', role: 'crew', tourIds: [] }, { projectId: 'theirs', role: 'viewer', tourIds: [] }],
    managedProjectIds: ['mine'],
  });
  assert.equal(roleForProject(next, 'mine'), 'crew');
  assert.equal(roleForProject(next, 'theirs'), 'editor', 'untouched');
});

test('a Manager removing their band leaves other bands alone', () => {
  const current = { allProjects: false, role: 'crew', entries: [{ projectId: 'mine', role: 'crew', tourIds: [] }, { projectId: 'theirs', role: 'viewer', tourIds: [] }] };
  const next = applyManagerEdits({ current, edits: [], managedProjectIds: ['mine'] });
  assert.deepEqual(next.entries.map((e) => e.projectId), ['theirs']);
});

test('newly added bands are detected for the notification email', () => {
  const before = { allProjects: false, role: 'crew', entries: [{ projectId: 'tk', role: 'crew', tourIds: [] }] };
  const after = { allProjects: false, role: 'editor', entries: [{ projectId: 'tk', role: 'editor', tourIds: [] }, { projectId: 'tb', role: 'editor', tourIds: [] }] };
  assert.deepEqual(newlyAddedProjects(before, after), ['tb']);
  assert.deepEqual(newlyAddedProjects(after, before), [], 'removals send nothing');
});

test('stored form: whole bands and tour-only rows', () => {
  const stored = toStoredAccess({ allProjects: false, role: 'editor', entries: [{ projectId: 'a', role: 'editor', tourIds: [] }, { projectId: 'b', role: 'viewer', tourIds: ['t1', 't2'] }] });
  assert.equal(stored.role, 'editor');
  assert.equal(stored.scopeType, 'projects');
  assert.deepEqual(stored.projectRows, [{ projectId: 'a', role: 'editor' }]);
  assert.equal(stored.tourRows.length, 2);
  assert.equal(toStoredAccess({ allProjects: true, role: 'crew', entries: [] }).scopeType, 'workspace');
  assert.equal(highestRole(['viewer', 'crew', null]), 'crew');
});

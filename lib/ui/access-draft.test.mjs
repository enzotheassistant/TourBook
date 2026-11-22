import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accessWithBandRole, accessWithoutBand, draftForProject, draftFromAccess, draftProblem, draftToAccessPayload,
  setBandRole, setBandTours, summarizeBandAccess,
} from './access-draft.ts';

const names = new Map([['tk', 'Texas King'], ['tb', 'Test Band'], ['x', 'Third Band'], ['y', 'Fourth']]);

test('a new invite starts as Viewer on the band you are on', () => {
  assert.deepEqual(draftToAccessPayload(draftForProject('tk')), { allProjects: false, entries: [{ projectId: 'tk', role: 'viewer', tourIds: [] }] });
});

test('Viewer on one, Manager on another, nothing on the third: only two are sent', () => {
  let draft = draftForProject('tk');
  draft = setBandRole(draft, 'tb', 'editor');
  draft = setBandRole(draft, 'x', 'none');
  assert.deepEqual(draftToAccessPayload(draft).entries, [
    { projectId: 'tk', role: 'viewer', tourIds: [] },
    { projectId: 'tb', role: 'editor', tourIds: [] },
  ]);
});

test('only some tours needs at least one tour', () => {
  let draft = setBandTours(draftForProject('tk'), 'tk', []);
  assert.match(draftProblem(draft, names), /Texas King/);
  draft = setBandTours(draft, 'tk', ['t1']);
  assert.equal(draftProblem(draft, names), null);
  assert.deepEqual(draftToAccessPayload(draft).entries[0].tourIds, ['t1']);
});

test('nothing chosen is a problem for invites', () => {
  assert.ok(draftProblem(setBandRole(draftForProject('tk'), 'tk', 'none'), names));
  assert.equal(draftProblem({ allProjects: true, allRole: 'crew', bands: {} }, names), null);
});

test('editing starts from current access; the retired admin level shows as Manager', () => {
  const draft = draftFromAccess({ allProjects: false, role: 'admin', entries: [{ projectId: 'tk', role: 'crew', tourIds: [] }, { projectId: 'tb', role: 'admin', tourIds: ['t1'] }] });
  assert.deepEqual(draft.bands.tk, { role: 'crew', tourIds: null });
  assert.deepEqual(draft.bands.tb, { role: 'editor', tourIds: ['t1'] });
  assert.equal(draftFromAccess({ allProjects: true, role: 'viewer', entries: [] }).allProjects, true);
});

test('Team summaries stay short', () => {
  assert.equal(summarizeBandAccess({ allProjects: true, role: 'editor', entries: [] }, names), 'All projects · Manager');
  assert.equal(
    summarizeBandAccess({ allProjects: false, role: 'editor', entries: [{ projectId: 'tk', role: 'crew', tourIds: [] }, { projectId: 'tb', role: 'editor', tourIds: [] }] }, names),
    'Crew on Texas King · Manager on Test Band',
  );
  assert.equal(
    summarizeBandAccess({ allProjects: false, role: 'editor', entries: [
      { projectId: 'tk', role: 'editor', tourIds: [] }, { projectId: 'tb', role: 'viewer', tourIds: [] },
      { projectId: 'x', role: 'viewer', tourIds: [] }, { projectId: 'y', role: 'viewer', tourIds: [] },
    ] }, names),
    'Manager on 1 project · Viewer on 3',
  );
  assert.equal(summarizeBandAccess({ allProjects: false, role: 'viewer', entries: [{ projectId: 'tk', role: 'viewer', tourIds: ['a', 'b'] }] }, names), 'Viewer on Texas King (2 tours)');
});

test('the Team dropdown changes one band only; removing one band keeps the rest', () => {
  const access = { allProjects: false, role: 'editor', entries: [{ projectId: 'tk', role: 'crew', tourIds: [] }, { projectId: 'tb', role: 'editor', tourIds: ['t1'] }] };
  assert.deepEqual(accessWithBandRole(access, 'tk', 'viewer').entries, [
    { projectId: 'tk', role: 'viewer', tourIds: [] }, { projectId: 'tb', role: 'editor', tourIds: ['t1'] },
  ]);
  assert.deepEqual(accessWithoutBand(access, 'tk').entries, [{ projectId: 'tb', role: 'editor', tourIds: ['t1'] }]);
  assert.deepEqual(accessWithBandRole({ allProjects: true, role: 'viewer', entries: [] }, 'tk', 'crew'), { allProjects: true, role: 'crew' });
});

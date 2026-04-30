import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const sourcePath = path.join(process.cwd(), 'lib', 'activation', 'first-run.ts');
const tempModulePath = path.join(process.cwd(), 'lib', 'activation', '.first-run.testable.ts');
const source = await readFile(sourcePath, 'utf8');

await writeFile(
  tempModulePath,
  source
    .replace("from '../roles';", "from '../roles.ts';")
    .replace("from '../types/tenant';", "from '../types/tenant.ts';"),
  'utf8',
);

const { getCrewNoArtistsState, getCrewNoUpcomingDatesState, getAdminNoArtistsGuardrail } = await import(pathToFileURL(tempModulePath).href);

const CREATOR_ROLES = ['owner', 'admin', 'editor'];

test('crew no-artists state: creator roles get admin CTA, viewer does not', () => {
  for (const role of CREATOR_ROLES) {
    const state = getCrewNoArtistsState(role, false);
    assert.equal(state.actions.some((action) => action.ctaId === 'open_admin'), true, `${role} should receive open_admin CTA`);
    assert.equal(state.actions.some((action) => action.ctaId === 'view_past_dates'), false, `${role} should not get fallback-only CTA in no-artists state`);
  }

  const viewer = getCrewNoArtistsState('viewer', false);
  assert.equal(viewer.actions.some((action) => action.ctaId === 'open_admin'), false);
  assert.equal(viewer.actions.some((action) => action.ctaId === 'view_past_dates'), true);
});

test('crew no-upcoming-dates state: creator roles get create-first-date CTA, viewer does not', () => {
  for (const role of CREATOR_ROLES) {
    const state = getCrewNoUpcomingDatesState(role);
    assert.equal(state.actions.some((action) => action.ctaId === 'create_first_date'), true, `${role} should receive create_first_date CTA`);
  }

  const viewer = getCrewNoUpcomingDatesState('viewer');
  assert.equal(viewer.actions.some((action) => action.ctaId === 'create_first_date'), false);
  assert.deepEqual(viewer.actions.map((action) => action.ctaId), ['view_past_dates']);
});

test('crew no-active-artist state only includes admin path for creator roles', () => {
  for (const role of CREATOR_ROLES) {
    const state = getCrewNoArtistsState(role, true);
    assert.equal(state.actions.some((action) => action.ctaId === 'open_admin'), true);
    assert.equal(state.actions.some((action) => action.ctaId === 'view_past_dates'), true);
  }

  const viewer = getCrewNoArtistsState('viewer', true);
  assert.equal(viewer.actions.some((action) => action.ctaId === 'open_admin'), false);
  assert.deepEqual(viewer.actions.map((action) => action.ctaId), ['view_past_dates']);
});

test('admin no-artists guardrail: creator roles can create artist, viewer sees restriction copy', () => {
  for (const role of CREATOR_ROLES) {
    const guardrail = getAdminNoArtistsGuardrail(role);
    assert.equal(guardrail.showCreateArtist, true);
    assert.equal(guardrail.helperText, null);
  }

  const viewer = getAdminNoArtistsGuardrail('viewer');
  assert.equal(viewer.showCreateArtist, false);
  assert.match(viewer.helperText ?? '', /viewer access/i);
});

test.after(async () => {
  await rm(tempModulePath, { force: true });
});

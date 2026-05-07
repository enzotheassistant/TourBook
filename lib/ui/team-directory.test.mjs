import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const projectNameById = new Map([
  ['p1', 'Artist One'],
  ['p2', 'Artist Two'],
]);

const toursById = new Map([
  ['t1', { id: 't1', name: 'Spring Run', projectId: 'p1' }],
  ['t2', { id: 't2', name: 'Summer Run', projectId: 'p1' }],
  ['t3', { id: 't3', name: 'EU Dates', projectId: 'p2' }],
]);

test('describeTeamScope returns readable workspace copy', async () => {
  const { describeTeamScope } = await import('./team-directory.ts');
  assert.deepEqual(describeTeamScope({ scopeType: 'workspace', projectIds: [], tourIds: [] }, { projectNameById, toursById }), {
    label: 'Full workspace access',
    detail: 'All artists and tours in this workspace.',
  });
});

test('describeTeamScope summarizes project-limited access with artist names', async () => {
  const { describeTeamScope } = await import('./team-directory.ts');
  assert.deepEqual(describeTeamScope({ scopeType: 'projects', projectIds: ['p2', 'p1'], tourIds: [] }, { projectNameById, toursById }), {
    label: '2 artists',
    detail: 'Artist One, Artist Two',
  });
});

test('describeTeamScope summarizes tour-limited access with artist and tour names', async () => {
  const { describeTeamScope } = await import('./team-directory.ts');
  assert.deepEqual(describeTeamScope({ scopeType: 'tours', projectIds: ['p1'], tourIds: ['t2', 't1'] }, { projectNameById, toursById }), {
    label: '2 tours · 1 artist',
    detail: 'Artist One • Spring Run, Summer Run',
  });
});

test('matchesProjectContext includes workspace access and matching scoped entries', async () => {
  const { matchesProjectContext } = await import('./team-directory.ts');
  assert.equal(matchesProjectContext({ scopeType: 'workspace', projectIds: [], tourIds: [] }, 'p1', toursById), true);
  assert.equal(matchesProjectContext({ scopeType: 'projects', projectIds: ['p1'], tourIds: [] }, 'p1', toursById), true);
  assert.equal(matchesProjectContext({ scopeType: 'projects', projectIds: ['p2'], tourIds: [] }, 'p1', toursById), false);
  assert.equal(matchesProjectContext({ scopeType: 'tours', projectIds: ['p1'], tourIds: ['t2'] }, 'p1', toursById), true);
  assert.equal(matchesProjectContext({ scopeType: 'tours', projectIds: ['p2'], tourIds: ['t3'] }, 'p1', toursById), false);
});

test('splitInvitesByStatus separates pending invites from invite history', async () => {
  const { splitInvitesByStatus } = await import('./team-directory.ts');
  const invites = [
    { id: '1', status: 'pending' },
    { id: '2', status: 'revoked' },
    { id: '3', status: 'expired' },
  ];
  const result = splitInvitesByStatus(invites);
  assert.deepEqual(result.pending.map((invite) => invite.id), ['1']);
  assert.deepEqual(result.history.map((invite) => invite.id), ['2', '3']);
});

test('getContextLabel reflects whether scope applies to the current artist', async () => {
  const { getContextLabel } = await import('./team-directory.ts');
  assert.equal(getContextLabel('workspace', true, 'Artist One'), 'Includes Artist One');
  assert.equal(getContextLabel('projects', true, 'Artist One'), 'In Artist One');
  assert.equal(getContextLabel('tours', false, 'Artist One'), 'Outside Artist One');
});

test('buildAcceptedTeamDirectory hydrates scoped members from matching accepted invite scope so real member cards stay renderable', async () => {
  const uiDir = path.join(process.cwd(), 'lib', 'ui');
  const sourcePath = path.join(uiDir, 'team-directory.ts');
  const tempModulePath = path.join(uiDir, '.team-directory.testable.ts');
  const source = await readFile(sourcePath, 'utf8');

  await writeFile(
    tempModulePath,
    source.replace("from '@/lib/types/tenant';", "from '../types/tenant.ts';"),
    'utf8',
  );

  try {
    const { buildAcceptedTeamDirectory, matchesProjectContext } = await import(pathToFileURL(tempModulePath).href);
    const entries = buildAcceptedTeamDirectory(
      [
        {
          id: 'm1',
          workspaceId: 'w1',
          userId: 'u1',
          name: 'Alex',
          email: 'alex@example.com',
          role: 'editor',
          scopeType: 'projects',
          projectIds: [],
          tourIds: [],
          createdAt: '2026-05-08T00:00:00.000Z',
        },
      ],
      [
        {
          id: 'i1',
          workspaceId: 'w1',
          name: 'Alex',
          email: 'alex@example.com',
          role: 'editor',
          scopeType: 'projects',
          projectIds: ['p1'],
          tourIds: [],
          status: 'accepted',
          invitedByUserId: 'owner',
          acceptedByUserId: 'u1',
          expiresAt: '2099-05-09T00:00:00.000Z',
          createdAt: '2099-05-07T00:00:00.000Z',
          updatedAt: new Date(Date.now() - 60_000).toISOString(),
        },
      ],
    );

    assert.equal(entries.length, 1);
    assert.equal(entries[0].source, 'member');
    assert.deepEqual(entries[0].projectIds, ['p1']);
    assert.equal(matchesProjectContext(entries[0], 'p1', toursById), true);
  } finally {
    await rm(tempModulePath, { force: true });
  }
});

test('buildAcceptedTeamDirectory keeps real members and backfills only fresh accepted invites not yet in members list', async () => {
  const uiDir = path.join(process.cwd(), 'lib', 'ui');
  const sourcePath = path.join(uiDir, 'team-directory.ts');
  const tempModulePath = path.join(uiDir, '.team-directory.testable.ts');
  const source = await readFile(sourcePath, 'utf8');

  await writeFile(
    tempModulePath,
    source.replace("from '@/lib/types/tenant';", "from '../types/tenant.ts';"),
    'utf8',
  );

  try {
    const { buildAcceptedTeamDirectory } = await import(pathToFileURL(tempModulePath).href);
    const entries = buildAcceptedTeamDirectory(
      [
        {
          id: 'm1',
          workspaceId: 'w1',
          userId: 'u1',
          name: 'Alex',
          email: 'alex@example.com',
          role: 'editor',
          scopeType: 'projects',
          projectIds: ['p1'],
          tourIds: [],
          createdAt: '2026-05-08T00:00:00.000Z',
        },
      ],
      [
        {
          id: 'i1',
          workspaceId: 'w1',
          name: 'Alex',
          email: 'alex@example.com',
          role: 'editor',
          scopeType: 'projects',
          projectIds: ['p1'],
          tourIds: [],
          status: 'accepted',
          invitedByUserId: 'owner',
          acceptedByUserId: 'u1',
          expiresAt: '2026-05-09T00:00:00.000Z',
          createdAt: '2026-05-07T00:00:00.000Z',
          updatedAt: '2026-05-08T00:00:00.000Z',
        },
        {
          id: 'i2',
          workspaceId: 'w1',
          name: 'Jamie',
          email: 'jamie@example.com',
          role: 'viewer',
          scopeType: 'tours',
          projectIds: ['p2'],
          tourIds: ['t2'],
          status: 'accepted',
          invitedByUserId: 'owner',
          acceptedByUserId: 'u2',
          expiresAt: '2099-05-09T00:00:00.000Z',
          createdAt: '2099-05-07T00:00:00.000Z',
          updatedAt: new Date(Date.now() - 60_000).toISOString(),
        },
        {
          id: 'i3',
          workspaceId: 'w1',
          name: 'Old Ghost',
          email: 'ghost@example.com',
          role: 'viewer',
          scopeType: 'projects',
          projectIds: ['p2'],
          tourIds: [],
          status: 'accepted',
          invitedByUserId: 'owner',
          acceptedByUserId: 'u3',
          expiresAt: '2099-05-09T00:00:00.000Z',
          createdAt: '2099-05-07T00:00:00.000Z',
          updatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        },
      ],
    );

    assert.equal(entries.length, 2);
    assert.deepEqual(entries.map((entry) => ({ id: entry.id, source: entry.source })), [
      { id: 'm1', source: 'member' },
      { id: 'accepted-invite:i2', source: 'accepted-invite' },
    ]);
    assert.equal(entries[1].email, 'jamie@example.com');
    assert.equal(entries[1].memberId, null);
    assert.equal(entries[1].inviteId, 'i2');
  } finally {
    await rm(tempModulePath, { force: true });
  }
});

test('buildAcceptedTeamDirectory does not surface stale accepted fallback when a newer revoked invite exists for the same identity', async () => {
  const uiDir = path.join(process.cwd(), 'lib', 'ui');
  const sourcePath = path.join(uiDir, 'team-directory.ts');
  const tempModulePath = path.join(uiDir, '.team-directory.testable.ts');
  const source = await readFile(sourcePath, 'utf8');

  await writeFile(
    tempModulePath,
    source.replace("from '@/lib/types/tenant';", "from '../types/tenant.ts';"),
    'utf8',
  );

  try {
    const { buildAcceptedTeamDirectory } = await import(pathToFileURL(tempModulePath).href);
    const entries = buildAcceptedTeamDirectory(
      [],
      [
        {
          id: 'accepted-old',
          workspaceId: 'w1',
          name: 'Ghost',
          email: 'ghost@example.com',
          role: 'viewer',
          scopeType: 'projects',
          projectIds: ['p1'],
          tourIds: [],
          status: 'accepted',
          invitedByUserId: 'owner',
          acceptedByUserId: 'u9',
          expiresAt: '2099-05-09T00:00:00.000Z',
          createdAt: '2099-05-07T00:00:00.000Z',
          updatedAt: new Date(Date.now() - 60_000).toISOString(),
        },
        {
          id: 'revoked-new',
          workspaceId: 'w1',
          name: 'Ghost',
          email: 'ghost@example.com',
          role: 'viewer',
          scopeType: 'projects',
          projectIds: ['p1'],
          tourIds: [],
          status: 'revoked',
          invitedByUserId: 'owner',
          acceptedByUserId: 'u9',
          expiresAt: '2099-05-09T00:00:00.000Z',
          createdAt: '2099-05-07T00:00:00.000Z',
          updatedAt: new Date(Date.now() - 30_000).toISOString(),
        },
      ],
    );

    assert.equal(entries.length, 0);
  } finally {
    await rm(tempModulePath, { force: true });
  }
});

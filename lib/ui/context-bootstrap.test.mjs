import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveActiveContextSelection } from './context-bootstrap.ts';

const baseContext = {
  user: { id: 'u1', email: 'test@example.com' },
  memberships: [],
  workspaces: [
    { id: 'w-empty', name: 'Empty', slug: 'empty', ownerUserId: 'u1' },
    { id: 'w-invite', name: 'Invited', slug: 'invited', ownerUserId: 'u2' },
  ],
  projects: [
    { id: 'p-invite', workspaceId: 'w-invite', name: 'Artist', slug: 'artist', archivedAt: null },
  ],
  tours: [
    { id: 't-invite', workspaceId: 'w-invite', projectId: 'p-invite', name: 'Tour', status: 'active', startDate: null, endDate: null },
  ],
  activeWorkspaceId: 'w-empty',
  activeProjectId: null,
  activeTourId: null,
};

test('falls forward to a workspace with accessible projects when stored selection is empty', () => {
  assert.deepEqual(
    resolveActiveContextSelection(baseContext, { workspaceId: 'w-empty', projectId: null, tourId: null }, null),
    { activeWorkspaceId: 'w-invite', activeProjectId: 'p-invite', activeTourId: 't-invite' },
  );
});

test('prefers pending invite scope over stale stored selection', () => {
  assert.deepEqual(
    resolveActiveContextSelection(
      {
        ...baseContext,
        workspaces: [
          ...baseContext.workspaces,
          { id: 'w-other', name: 'Other', slug: 'other', ownerUserId: 'u3' },
        ],
        projects: [
          ...baseContext.projects,
          { id: 'p-other', workspaceId: 'w-other', name: 'Other Artist', slug: 'other-artist', archivedAt: null },
        ],
      },
      { workspaceId: 'w-other', projectId: 'p-other', tourId: null },
      { workspaceId: 'w-invite', scopeType: 'tours', projectIds: ['p-invite'], tourIds: ['t-invite'], acceptedAt: Date.now() },
    ),
    { activeWorkspaceId: 'w-invite', activeProjectId: 'p-invite', activeTourId: 't-invite' },
  );
});

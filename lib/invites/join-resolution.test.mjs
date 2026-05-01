import test from 'node:test';
import assert from 'node:assert/strict';

import { hasResolvedInviteContext } from './join-resolution.ts';

test('workspace-scoped invite resolves as soon as the invited workspace is active', () => {
  assert.equal(
    hasResolvedInviteContext(
      { workspaceId: 'ws_1', scopeType: 'workspace', projectIds: [], tourIds: [] },
      { activeWorkspaceId: 'ws_1', activeProjectId: null, activeTourId: null },
    ),
    true,
  );
});

test('project-scoped invite stays unresolved until an invited project is active', () => {
  assert.equal(
    hasResolvedInviteContext(
      { workspaceId: 'ws_1', scopeType: 'projects', projectIds: ['proj_2'], tourIds: [] },
      { activeWorkspaceId: 'ws_1', activeProjectId: null, activeTourId: null },
    ),
    false,
  );

  assert.equal(
    hasResolvedInviteContext(
      { workspaceId: 'ws_1', scopeType: 'projects', projectIds: ['proj_2'], tourIds: [] },
      { activeWorkspaceId: 'ws_1', activeProjectId: 'proj_1', activeTourId: null },
    ),
    false,
  );

  assert.equal(
    hasResolvedInviteContext(
      { workspaceId: 'ws_1', scopeType: 'projects', projectIds: ['proj_2'], tourIds: [] },
      { activeWorkspaceId: 'ws_1', activeProjectId: 'proj_2', activeTourId: null },
    ),
    true,
  );
});

test('tour-scoped invite stays unresolved until an invited tour is active', () => {
  assert.equal(
    hasResolvedInviteContext(
      { workspaceId: 'ws_1', scopeType: 'tours', projectIds: ['proj_2'], tourIds: ['tour_9'] },
      { activeWorkspaceId: 'ws_1', activeProjectId: 'proj_2', activeTourId: null },
    ),
    false,
  );

  assert.equal(
    hasResolvedInviteContext(
      { workspaceId: 'ws_1', scopeType: 'tours', projectIds: ['proj_2'], tourIds: ['tour_9'] },
      { activeWorkspaceId: 'ws_1', activeProjectId: 'proj_2', activeTourId: 'tour_9' },
    ),
    true,
  );
});

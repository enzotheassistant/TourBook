import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { MemberUpdateValidationError, validateWorkspaceMemberUpdatePayload } from './member-update-utils.ts';

test('validateWorkspaceMemberUpdatePayload normalizes workspace scope payloads', () => {
  assert.deepEqual(validateWorkspaceMemberUpdatePayload({
    role: 'editor',
    scopeType: 'workspace',
    projectIds: ['p1'],
    tourIds: ['t1'],
  }), {
    role: 'editor',
    scopeType: 'workspace',
    projectIds: [],
    tourIds: [],
  });
});

test('validateWorkspaceMemberUpdatePayload requires projects for project scope', () => {
  assert.throws(
    () => validateWorkspaceMemberUpdatePayload({ role: 'viewer', scopeType: 'projects', projectIds: [] }),
    (error) => error instanceof MemberUpdateValidationError && error.status === 400 && error.message.includes('Select at least one artist'),
  );
});

test('validateWorkspaceMemberUpdatePayload requires tours for tour scope', () => {
  assert.throws(
    () => validateWorkspaceMemberUpdatePayload({ role: 'viewer', scopeType: 'tours', tourIds: [] }),
    (error) => error instanceof MemberUpdateValidationError && error.status === 400 && error.message.includes('Select at least one tour'),
  );
});

test('validateWorkspaceMemberUpdatePayload de-duplicates ids and trims whitespace', () => {
  assert.deepEqual(validateWorkspaceMemberUpdatePayload({
    role: 'viewer',
    scopeType: 'tours',
    projectIds: [' p1 ', 'p1'],
    tourIds: [' t1 ', 't1', 't2'],
  }), {
    role: 'viewer',
    scopeType: 'tours',
    projectIds: ['p1'],
    tourIds: ['t1', 't2'],
  });
});

test('validateWorkspaceMemberUpdatePayload requires admins to remain workspace scoped', () => {
  assert.throws(
    () => validateWorkspaceMemberUpdatePayload({ role: 'admin', scopeType: 'tours', tourIds: ['t1'] }),
    (error) => error instanceof MemberUpdateValidationError && error.status === 400 && error.message.includes('full workspace access'),
  );
});

test('validateWorkspaceMemberUpdatePayload rejects unknown roles', () => {
  assert.throws(
    () => validateWorkspaceMemberUpdatePayload({ role: 'member', scopeType: 'workspace' }),
    (error) => error instanceof MemberUpdateValidationError && error.status === 400 && error.message.includes('role must be'),
  );
});

test('listWorkspaceMembersScoped authorizes with the requester-scoped client but reads the full directory with the privileged client', async () => {
  const serverDir = path.join(process.cwd(), 'lib', 'data', 'server');
  const sourcePath = path.join(serverDir, 'members.ts');
  const tempModulePath = path.join(serverDir, '.members.testable.ts');
  const tempSharedPath = path.join(serverDir, '.members.shared.testable.ts');
  const source = await readFile(sourcePath, 'utf8');

  await writeFile(
    tempSharedPath,
    `export class ApiError extends Error {\n  constructor(status, message) {\n    super(message);\n    this.status = status;\n  }\n}\n\nexport function getPrivilegedDataClient() {\n  const factory = globalThis.__TEST_CREATE_SERVICE_ROLE_SUPABASE_CLIENT__;\n  if (typeof factory !== 'function') throw new Error('Missing test privileged client factory.');\n  return factory();\n}\n\nexport function requireScopedDataClient(supabase) {\n  if (!supabase) throw new ApiError(500, 'Scoped Supabase client is required.');\n  return supabase;\n}\n\nexport function isMissingRelationError(error) {\n  if (!error || typeof error !== 'object') return false;\n  const maybeCode = 'code' in error ? String(error.code ?? '') : '';\n  const maybeMessage = 'message' in error ? String(error.message ?? '') : '';\n  return maybeCode === '42P01' || maybeMessage.toLowerCase().includes('does not exist');\n}\n\nexport async function requireWorkspaceAccess(supabase, userId, workspaceId, allowedRoles) {\n  const result = await supabase\n    .from('workspace_members')\n    .select('id, workspace_id, user_id, role, scope_type')\n    .eq('workspace_id', workspaceId)\n    .eq('user_id', userId)\n    .maybeSingle();\n\n  if (result.error) throw new ApiError(500, result.error.message);\n  if (!result.data) throw new ApiError(403, 'You do not have access to this workspace.');\n  if (allowedRoles && !allowedRoles.includes(result.data.role)) throw new ApiError(403, 'You do not have permission to perform this action.');\n\n  return {\n    workspaceId: String(result.data.workspace_id),\n    userId: String(result.data.user_id),\n    role: result.data.role,\n    scopeType: result.data.scope_type,\n    projectIds: [],\n    tourIds: [],\n  };\n}\n\nexport async function ensureProjectInWorkspace() {}\nexport async function ensureTourInScope() {}\n`,
    'utf8',
  );

  await writeFile(
    tempModulePath,
    source
      .replace("from '@/lib/data/server/shared';", "from './.members.shared.testable.ts';")
      .replace("from '@/lib/data/server/member-update-utils';", "from './member-update-utils.ts';")
      .replace("from '@/lib/types/tenant';", "from '../../types/tenant.ts';"),
    'utf8',
  );

  const scopedQueries = [];
  const privilegedQueries = [];

  const makeBuilder = ({ dataset, log, maybeSingleRow = null }) => ({
    select(selection) {
      log.push({ step: 'select', selection });
      return this;
    },
    eq(column, value) {
      log.push({ step: 'eq', column, value });
      return this;
    },
    in(column, values) {
      log.push({ step: 'in', column, values });
      return Promise.resolve({ data: dataset[column] ?? [], error: null });
    },
    order(column, options) {
      log.push({ step: 'order', column, options });
      return Promise.resolve({ data: dataset.order ?? [], error: null });
    },
    maybeSingle() {
      log.push({ step: 'maybeSingle' });
      return Promise.resolve({ data: maybeSingleRow, error: null });
    },
  });

  const scopedSupabase = {
    from(table) {
      if (table === 'workspace_members') {
        return makeBuilder({
          log: scopedQueries,
          maybeSingleRow: {
            id: 'owner-member',
            workspace_id: 'w1',
            user_id: 'owner-user',
            role: 'owner',
            scope_type: 'workspace',
          },
        });
      }
      throw new Error(`Unexpected scoped table: ${table}`);
    },
  };

  globalThis.__TEST_CREATE_SERVICE_ROLE_SUPABASE_CLIENT__ = () => ({
    from(table) {
      if (table === 'workspace_members') {
        return makeBuilder({
          log: privilegedQueries,
          dataset: {
            order: [
              {
                id: 'owner-member',
                workspace_id: 'w1',
                user_id: 'owner-user',
                role: 'owner',
                scope_type: 'workspace',
                created_at: '2026-05-08T00:00:00.000Z',
              },
              {
                id: 'crew-member',
                workspace_id: 'w1',
                user_id: 'crew-user',
                role: 'viewer',
                scope_type: 'projects',
                created_at: '2026-05-08T00:01:00.000Z',
              },
            ],
          },
        });
      }
      if (table === 'workspace_member_projects') {
        return makeBuilder({
          log: privilegedQueries,
          dataset: {
            workspace_member_id: [
              { workspace_member_id: 'crew-member', project_id: 'p1' },
            ],
          },
        });
      }
      if (table === 'workspace_member_tours') {
        return makeBuilder({
          log: privilegedQueries,
          dataset: {
            workspace_member_id: [],
          },
        });
      }
      throw new Error(`Unexpected privileged table: ${table}`);
    },
    auth: {
      admin: {
        async getUserById(userId) {
          if (userId === 'owner-user') {
            return { data: { user: { email: 'owner@example.com', user_metadata: { full_name: 'Phil' } } } };
          }
          if (userId === 'crew-user') {
            return { data: { user: { email: 'crew@example.com', user_metadata: { full_name: 'Alex Crew' } } } };
          }
          return { data: { user: null } };
        },
      },
    },
  });

  try {
    const { listWorkspaceMembersScoped } = await import(pathToFileURL(tempModulePath).href);
    const members = await listWorkspaceMembersScoped(scopedSupabase, 'owner-user', 'w1');

    assert.deepEqual(members.map((member) => ({ id: member.id, email: member.email, role: member.role, projectIds: member.projectIds })), [
      { id: 'owner-member', email: 'owner@example.com', role: 'owner', projectIds: [] },
      { id: 'crew-member', email: 'crew@example.com', role: 'viewer', projectIds: ['p1'] },
    ]);

    assert.ok(scopedQueries.some((entry) => entry.step === 'maybeSingle'), 'scoped client should still authorize requester membership');
    assert.ok(privilegedQueries.some((entry) => entry.step === 'order'), 'privileged client should read full workspace member directory');
  } finally {
    delete globalThis.__TEST_CREATE_SERVICE_ROLE_SUPABASE_CLIENT__;
    await rm(tempModulePath, { force: true });
    await rm(tempSharedPath, { force: true });
  }
});

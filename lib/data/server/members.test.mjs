import test from 'node:test';
import assert from 'node:assert/strict';

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

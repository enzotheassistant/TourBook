import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const sourcePath = path.join(process.cwd(), 'lib', 'roles.ts');
const tempModulePath = path.join(process.cwd(), 'lib', '.roles.testable.ts');
const source = await readFile(sourcePath, 'utf8');

await writeFile(
  tempModulePath,
  source.replace("from '@/lib/types/tenant';", "from './types/tenant.ts';"),
  'utf8',
);

const { canAccessAdminWorkspace, getFirstAdminWorkspaceId, hasAnyAdminAccess } = await import(pathToFileURL(tempModulePath).href);

test('admin workspace helpers distinguish viewer-only vs mixed-role memberships', () => {
  assert.equal(canAccessAdminWorkspace('owner'), true);
  assert.equal(canAccessAdminWorkspace('admin'), true);
  assert.equal(canAccessAdminWorkspace('editor'), true);
  assert.equal(canAccessAdminWorkspace('viewer'), false);
  assert.equal(canAccessAdminWorkspace(null), false);

  const viewerOnly = [
    { workspaceId: 'w1', role: 'viewer' },
    { workspaceId: 'w2', role: 'viewer' },
  ];
  assert.equal(hasAnyAdminAccess(viewerOnly), false);
  assert.equal(getFirstAdminWorkspaceId(viewerOnly), null);

  const mixed = [
    { workspaceId: 'w1', role: 'viewer' },
    { workspaceId: 'w2', role: 'editor' },
  ];
  assert.equal(hasAnyAdminAccess(mixed), true);
  assert.equal(getFirstAdminWorkspaceId(mixed), 'w2');
});

test.after(async () => {
  await rm(tempModulePath, { force: true });
});

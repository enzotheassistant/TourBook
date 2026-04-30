import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const sourcePath = path.join(process.cwd(), 'lib', 'app-context-storage.ts');
const tempModulePath = path.join(process.cwd(), 'lib', '.app-context-storage.testable.ts');
const source = await readFile(sourcePath, 'utf8');

await writeFile(
  tempModulePath,
  source.replace("import type { WorkspaceScopeType } from '@/lib/types/tenant';", "import type { WorkspaceScopeType } from './types/tenant.ts';"),
  'utf8',
);

const {
  PENDING_INVITE_SCOPE_MAX_AGE_MS,
  isPendingInviteScopeFresh,
} = await import(pathToFileURL(tempModulePath).href);

test('pending invite scope stays fresh during short membership propagation delays', () => {
  const acceptedAt = Date.now() - 2_000;
  assert.equal(isPendingInviteScopeFresh({ acceptedAt }), true);
});

test('pending invite scope expires after the max age window', () => {
  const now = Date.now();
  assert.equal(isPendingInviteScopeFresh({ acceptedAt: now - PENDING_INVITE_SCOPE_MAX_AGE_MS - 1 }, now), false);
});

test.after(async () => {
  await rm(tempModulePath, { force: true });
});

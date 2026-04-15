import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function readRoute(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('AI intake routes both enforce workspace-admin auth helper', () => {
  const legacyRoute = readRoute('./route.ts');
  const datesRoute = readRoute('../dates/ai-intake/route.ts');

  for (const route of [legacyRoute, datesRoute]) {
    assert.match(route, /requireApiAuthForWorkspaceAdmin/);
    assert.doesNotMatch(route, /requireApiAuth\(/);
  }
});

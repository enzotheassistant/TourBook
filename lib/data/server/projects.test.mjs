import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, './projects.ts'), 'utf8');

test('project name normalization keeps non-whitespace characters (regression: "Test" must stay "Test")', () => {
  assert.match(source, /replace\(\/\\s\+\/g, ' '\)/);
  assert.doesNotMatch(source, /replace\(\/s\+\/g, ' '\)/);
});

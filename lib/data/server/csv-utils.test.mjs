import test from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeCsvField, toCsvCell } from './csv-utils.ts';

test('sanitizeCsvField leaves ordinary names untouched', () => {
  assert.equal(sanitizeCsvField('Jane Doe'), 'Jane Doe');
  assert.equal(sanitizeCsvField(''), '');
});

test('sanitizeCsvField neutralizes formula-injection payloads', () => {
  assert.equal(sanitizeCsvField(`=HYPERLINK("http://evil","click")`), `'=HYPERLINK("http://evil","click")`);
  assert.equal(sanitizeCsvField('+1 555 000'), `'+1 555 000`);
  assert.equal(sanitizeCsvField('-2+3'), `'-2+3`);
  assert.equal(sanitizeCsvField('@SUM(1,1)'), `'@SUM(1,1)`);
  assert.equal(sanitizeCsvField('\t=cmd'), `'\t=cmd`);
});

test('toCsvCell quotes and escapes internal double quotes after sanitizing', () => {
  assert.equal(toCsvCell('Jane "JD" Doe'), `"Jane ""JD"" Doe"`);
  assert.equal(toCsvCell(`=cmd|' /C calc'!A0`), `"'=cmd|' /C calc'!A0"`);
});

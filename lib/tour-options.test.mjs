import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTourOptions } from './tour-options.ts';

const today = '2026-11-22';

test('upcoming tours and tours with no dates come first; finished tours go to Past', () => {
  const groups = buildTourOptions({
    today,
    dates: [
      { date: '2026-04-16', tourName: 'Spring Run' },
      { date: '2026-12-01', tourName: 'Winter Run' },
      { date: '2026-05-01', tourName: 'Winter Run' },
    ],
    tours: [{ name: 'Spring Run' }, { name: 'Winter Run' }, { name: 'Next Year' }],
  });
  assert.deepEqual(groups, { current: ['Next Year', 'Winter Run'], past: ['Spring Run'] });
});

test('a tour playing today still counts as current', () => {
  const groups = buildTourOptions({ today, dates: [{ date: today, tourName: 'Tonight' }], tours: [] });
  assert.deepEqual(groups, { current: ['Tonight'], past: [] });
});

test('archived tours are hidden, unless this date already uses it', () => {
  const input = {
    today,
    dates: [{ date: '2026-01-10', tourName: 'Old Tour' }, { date: '2027-01-10', tourName: 'Live Tour' }],
    tours: [{ name: 'Old Tour', archivedAt: '2026-11-01' }, { name: 'Live Tour' }],
  };
  assert.deepEqual(buildTourOptions(input), { current: ['Live Tour'], past: [] });
  assert.deepEqual(buildTourOptions({ ...input, currentValue: 'old tour' }), { current: ['Live Tour'], past: ['Old Tour'] });
});

test('names are matched ignoring case and spaces; blanks ignored', () => {
  const groups = buildTourOptions({
    today,
    dates: [{ date: '2027-02-01', tourName: ' Bleeker x TK ' }, { date: '2027-03-01', tourName: 'bleeker x tk' }, { date: '2027-03-01', tourName: '' }],
    tours: [{ name: 'Bleeker x TK' }],
  });
  assert.deepEqual(groups, { current: ['Bleeker x TK'], past: [] });
});

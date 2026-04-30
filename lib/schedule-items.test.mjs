import test from 'node:test';
import assert from 'node:assert/strict';

import { filterVisibleScheduleItems, isVisibleScheduleItem } from './schedule-items.ts';

test('isVisibleScheduleItem keeps label-only rows such as TK S/C 6:00PM', () => {
  assert.equal(isVisibleScheduleItem({ label: 'TK S/C 6:00PM', time: '' }), true);
});

test('isVisibleScheduleItem keeps time-only rows', () => {
  assert.equal(isVisibleScheduleItem({ label: '', time: '6:00 PM' }), true);
});

test('isVisibleScheduleItem drops fully blank rows', () => {
  assert.equal(isVisibleScheduleItem({ label: '   ', time: '   ' }), false);
});

test('filterVisibleScheduleItems preserves anchor and freeform rows while dropping blanks', () => {
  const result = filterVisibleScheduleItems([
    { label: 'Load In', time: '2:00 PM' },
    { label: 'TK S/C 6:00PM', time: '' },
    { label: 'Doors', time: '7:00 PM' },
    { label: '', time: '' },
  ]);

  assert.deepEqual(result, [
    { label: 'Load In', time: '2:00 PM' },
    { label: 'TK S/C 6:00PM', time: '' },
    { label: 'Doors', time: '7:00 PM' },
  ]);
});

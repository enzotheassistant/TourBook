import test from 'node:test';
import assert from 'node:assert/strict';

import { mapShowScheduleItemsToPayload } from './schedule-mapping.ts';

test('mapShowScheduleItemsToPayload preserves arbitrary non-anchor schedule rows', () => {
  const result = mapShowScheduleItemsToPayload([
    { id: 'a', label: 'Load In', time: '2:00 PM' },
    { id: 'b', label: 'Bleeker S/C', time: '' },
    { id: 'c', label: 'Soundcheck', time: '4:00 PM' },
    { id: 'd', label: 'Doors', time: '7:00 PM' },
  ]);

  assert.deepEqual(
    result.map((item) => ({ label: item.label, time_text: item.time_text })),
    [
      { label: 'Load In', time_text: '2:00 PM' },
      { label: 'Bleeker S/C', time_text: '' },
      { label: 'Soundcheck', time_text: '4:00 PM' },
      { label: 'Doors', time_text: '7:00 PM' },
    ],
  );
});

test('mapShowScheduleItemsToPayload preserves rows that have a label but no time', () => {
  const result = mapShowScheduleItemsToPayload([
    { id: 'x', label: 'Band Soundcheck', time: '' },
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].label, 'Band Soundcheck');
  assert.equal(result[0].time_text, '');
});

test('mapShowScheduleItemsToPayload preserves rows that have a time but no label', () => {
  const result = mapShowScheduleItemsToPayload([
    { id: 'x', label: '', time: '5:00 PM' },
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].label, '');
  assert.equal(result[0].time_text, '5:00 PM');
});

test('mapShowScheduleItemsToPayload drops fully blank rows', () => {
  const result = mapShowScheduleItemsToPayload([
    { id: 'a', label: 'Load In', time: '2:00 PM' },
    { id: 'b', label: '', time: '' },
    { id: 'c', label: 'Bleeker S/C', time: '' },
  ]);

  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((item) => item.label),
    ['Load In', 'Bleeker S/C'],
  );
});

test('mapShowScheduleItemsToPayload assigns correct sort_order', () => {
  const result = mapShowScheduleItemsToPayload([
    { id: 'a', label: 'Load In', time: '2:00 PM' },
    { id: 'b', label: '', time: '' },          // blank → dropped
    { id: 'c', label: 'Bleeker S/C', time: '' },
  ]);

  // After blank is dropped, remaining items should have contiguous sort_order
  // starting from their original position index (before filtering).
  assert.equal(result[0].sort_order, 0);
  assert.equal(result[1].sort_order, 2);
});

test('mapShowScheduleItemsToPayload handles undefined items', () => {
  const result = mapShowScheduleItemsToPayload(undefined);
  assert.deepEqual(result, []);
});

test('mapShowScheduleItemsToPayload handles empty array', () => {
  const result = mapShowScheduleItemsToPayload([]);
  assert.deepEqual(result, []);
});

test('mapShowScheduleItemsToPayload trims whitespace from labels and times', () => {
  const result = mapShowScheduleItemsToPayload([
    { id: 'a', label: '  Bleeker S/C  ', time: '  4:30 PM  ' },
  ]);

  assert.equal(result[0].label, 'Bleeker S/C');
  assert.equal(result[0].time_text, '4:30 PM');
});

test('mapShowScheduleItemsToPayload preserves all non-anchor rows mixed with anchor rows', () => {
  const input = [
    { id: '1', label: 'Load In', time: '2:00 PM' },
    { id: '2', label: 'Line Check', time: '3:30 PM' },
    { id: '3', label: 'Bleeker S/C', time: '' },
    { id: '4', label: 'Soundcheck', time: '4:00 PM' },
    { id: '5', label: 'Doors', time: '7:00 PM' },
    { id: '6', label: 'Show', time: '8:00 PM' },
    { id: '7', label: 'Curfew', time: '11:00 PM' },
  ];

  const result = mapShowScheduleItemsToPayload(input);

  assert.equal(result.length, 7, 'All 7 rows including non-anchor rows should be preserved');
  assert.ok(
    result.some((item) => item.label === 'Line Check'),
    'Line Check should be in result',
  );
  assert.ok(
    result.some((item) => item.label === 'Bleeker S/C'),
    'Bleeker S/C should be in result',
  );
});

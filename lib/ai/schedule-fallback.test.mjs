import test from 'node:test';
import assert from 'node:assert/strict';

import { extractScheduleItemsFromText, backfillScheduleItemsFromSourceText } from './schedule-fallback.ts';

test('extractScheduleItemsFromText preserves full multiline schedules', () => {
  const text = [
    'Load In: 3:00 PM',
    'Soundcheck: 4:30 PM',
    'Doors: 7:00 PM',
    'Show: 8:00 PM',
    'Curfew: 11:00 PM',
  ].join('\n');

  assert.deepEqual(extractScheduleItemsFromText(text), [
    { label: 'Load In', time: '3:00 PM' },
    { label: 'Soundcheck', time: '4:30 PM' },
    { label: 'Doors', time: '7:00 PM' },
    { label: 'Show', time: '8:00 PM' },
    { label: 'Curfew', time: '11:00 PM' },
  ]);
});

test('extractScheduleItemsFromText supports time-first lines', () => {
  const text = [
    '3:00 PM - Load In',
    '4:30 PM - Soundcheck',
    '7:00 PM - Doors',
  ].join('\n');

  assert.deepEqual(extractScheduleItemsFromText(text), [
    { label: 'Load In', time: '3:00 PM' },
    { label: 'Soundcheck', time: '4:30 PM' },
    { label: 'Doors', time: '7:00 PM' },
  ]);
});

test('backfillScheduleItemsFromSourceText restores missing schedule lines for single-row imports', () => {
  const rows = [{
    date: '2026-05-01',
    city: 'Toronto',
    region: 'ON',
    venue_name: 'The Danforth',
    schedule_items: [
      { label: 'Load In', time: '3:00 PM' },
      { label: 'Show', time: '8:00 PM' },
    ],
  }];

  const text = [
    'May 1 - Toronto - The Danforth',
    'Load In: 3:00 PM',
    'Soundcheck: 4:30 PM',
    'Doors: 7:00 PM',
    'Show: 8:00 PM',
    'Curfew: 11:00 PM',
  ].join('\n');

  const [next] = backfillScheduleItemsFromSourceText(rows, text);
  assert.deepEqual(next.schedule_items, [
    { label: 'Load In', time: '3:00 PM' },
    { label: 'Show', time: '8:00 PM' },
    { label: 'Soundcheck', time: '4:30 PM' },
    { label: 'Doors', time: '7:00 PM' },
    { label: 'Curfew', time: '11:00 PM' },
  ]);
});

test('backfillScheduleItemsFromSourceText stays out of multi-row imports', () => {
  const rows = [
    { date: '2026-05-01', city: 'Toronto', region: 'ON', venue_name: 'A', schedule_items: [{ label: 'Show', time: '8:00 PM' }] },
    { date: '2026-05-02', city: 'Montreal', region: 'QC', venue_name: 'B', schedule_items: [{ label: 'Show', time: '8:00 PM' }] },
  ];

  const next = backfillScheduleItemsFromSourceText(rows, 'Load In: 3:00 PM\nDoors: 7:00 PM\nShow: 8:00 PM');
  assert.deepEqual(next, rows);
});

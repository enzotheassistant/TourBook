import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAnchorScheduleItems, normalizeScheduleItemsForPersistence } from './schedule-normalization.ts';

test('normalizeScheduleItemsForPersistence preserves arbitrary explicit schedule rows end-to-end', () => {
  const result = normalizeScheduleItemsForPersistence(
    [
      { label: 'Load In', time_text: '3:00 PM', sort_order: 0 },
      { label: 'Line Check', time_text: '4:15 PM', sort_order: 1 },
      { label: 'Soundcheck 1', time_text: '5:00 PM', sort_order: 2 },
      { label: 'Soundcheck 2', time_text: '5:30 PM', sort_order: 3 },
      { label: 'Doors', time_text: '7:00 PM', sort_order: 4 },
    ],
    {},
  );

  assert.deepEqual(
    result.map((item) => ({ label: item.label, time_text: item.time_text })),
    [
      { label: 'Load In', time_text: '3:00 PM' },
      { label: 'Line Check', time_text: '4:15 PM' },
      { label: 'Soundcheck 1', time_text: '5:00 PM' },
      { label: 'Soundcheck 2', time_text: '5:30 PM' },
      { label: 'Doors', time_text: '7:00 PM' },
    ],
  );
});

test('normalizeScheduleItemsForPersistence accepts legacy show-shaped rows that use time instead of time_text', () => {
  const result = normalizeScheduleItemsForPersistence(
    [
      { label: 'Load In', time: '3:00 PM', sort_order: 0 },
      { label: 'Band A Soundcheck', time: '4:00 PM', sort_order: 1 },
      { label: 'Band B Soundcheck', time: '4:30 PM', sort_order: 2 },
      { label: 'Doors', time: '7:00 PM', sort_order: 3 },
    ],
    {},
  );

  assert.deepEqual(
    result.map((item) => ({ label: item.label, time_text: item.time_text })),
    [
      { label: 'Load In', time_text: '3:00 PM' },
      { label: 'Band A Soundcheck', time_text: '4:00 PM' },
      { label: 'Band B Soundcheck', time_text: '4:30 PM' },
      { label: 'Doors', time_text: '7:00 PM' },
    ],
  );
});

test('normalizeScheduleItemsForPersistence falls back to anchor fields when no explicit rows are provided', () => {
  const result = normalizeScheduleItemsForPersistence(undefined, {
    load_in_time: '3:00 PM',
    soundcheck_time: '',
    doors_time: '7:00 PM',
    show_time: '',
    curfew_time: '',
  });

  assert.deepEqual(result, buildAnchorScheduleItems({ load_in_time: '3:00 PM', doors_time: '7:00 PM' }));
});

test('normalizeScheduleItemsForPersistence preserves existing schedule_items from fallbackValues when incoming items are empty', () => {
  // This covers the regression where arbitrary rows like "Band Soundcheck" or
  // "Line Check" were silently replaced by anchor-only rows because the incoming
  // schedule_items array was empty (form had unfilled placeholder rows) and the
  // fallback path only called buildAnchorScheduleItems which doesn't know about
  // custom labels.
  const existingItems = [
    { id: 'uuid-1', label: 'Load In', time_text: '3:00 PM', sort_order: 0 },
    { id: 'uuid-2', label: 'Band Soundcheck', time_text: '4:30 PM', sort_order: 1 },
    { id: 'uuid-3', label: 'Doors', time_text: '7:00 PM', sort_order: 2 },
  ];

  const result = normalizeScheduleItemsForPersistence(
    [],  // incoming payload is empty (all form rows were blank placeholders)
    {
      load_in_time: '3:00 PM',
      soundcheck_time: '',        // pickAnchorTime can't find 'Band Soundcheck'
      doors_time: '7:00 PM',
      schedule_items: existingItems,
    },
  );

  assert.deepEqual(
    result.map((item) => ({ label: item.label, time_text: item.time_text })),
    [
      { label: 'Load In', time_text: '3:00 PM' },
      { label: 'Band Soundcheck', time_text: '4:30 PM' },
      { label: 'Doors', time_text: '7:00 PM' },
    ],
  );
});

test('normalizeScheduleItemsForPersistence uses anchor fallback when both incoming and existing items are absent', () => {
  const result = normalizeScheduleItemsForPersistence([], {
    load_in_time: '3:00 PM',
    soundcheck_time: '5:00 PM',
    doors_time: '7:00 PM',
    schedule_items: [],
  });

  assert.deepEqual(
    result.map((item) => ({ label: item.label, time_text: item.time_text })),
    [
      { label: 'Load In', time_text: '3:00 PM' },
      { label: 'Soundcheck', time_text: '5:00 PM' },
      { label: 'Doors', time_text: '7:00 PM' },
    ],
  );
});

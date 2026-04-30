import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeScheduleItemsForPersistence } from './schedule-normalization.ts';

test('normalizeScheduleItemsForPersistence preserves arbitrary explicit schedule rows end-to-end', () => {
  const result = normalizeScheduleItemsForPersistence(
    [
      { label: 'Load In', time_text: '3:00 PM', sort_order: 0 },
      { label: 'Line Check', time_text: '4:15 PM', sort_order: 1 },
      { label: 'Soundcheck 1', time_text: '5:00 PM', sort_order: 2 },
      { label: 'Soundcheck 2', time_text: '5:30 PM', sort_order: 3 },
      { label: 'Doors', time_text: '7:00 PM', sort_order: 4 },
    ],
    undefined,
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
    undefined,
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

test('normalizeScheduleItemsForPersistence returns empty array when no items provided and no fallback', () => {
  const result = normalizeScheduleItemsForPersistence(undefined, undefined);
  assert.deepEqual(result, []);
});

test('normalizeScheduleItemsForPersistence returns empty array when both incoming and fallback are empty arrays', () => {
  const result = normalizeScheduleItemsForPersistence([], []);
  assert.deepEqual(result, []);
});

test('normalizeScheduleItemsForPersistence preserves existing schedule_items from fallback when incoming items are empty', () => {
  // Covers the regression where arbitrary rows like "Band Soundcheck" or
  // "Line Check" were silently dropped when the incoming schedule_items array
  // was empty (form had unfilled placeholder rows).
  const existingItems = [
    { id: 'uuid-1', label: 'Load In', time_text: '3:00 PM', sort_order: 0 },
    { id: 'uuid-2', label: 'Band Soundcheck', time_text: '4:30 PM', sort_order: 1 },
    { id: 'uuid-3', label: 'Doors', time_text: '7:00 PM', sort_order: 2 },
  ];

  const result = normalizeScheduleItemsForPersistence(
    [],  // incoming payload is empty (all form rows were blank placeholders)
    existingItems,
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

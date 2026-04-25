import test from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeShowFormForDayType, getRelevantSectionsForDayType, isSectionRelevantForDayType } from './tour-day.ts';

const baseForm = {
  id: 'date-1',
  date: '2026-04-25',
  day_type: 'show',
  city: 'Toronto',
  region: 'ON',
  country: 'CA',
  venue_name: 'Venue',
  tour_name: 'Spring Run',
  label: '',
  venue_address: '',
  venue_maps_url: '',
  dos_name: '',
  dos_phone: '',
  parking_load_info: '',
  schedule_items: [],
  hotel_name: '',
  hotel_address: '',
  hotel_maps_url: '',
  hotel_notes: '',
  notes: '',
  guest_list_notes: '2 comps for promoter',
  visibility: {
    show_venue: true,
    show_parking_load_info: true,
    show_schedule: true,
    show_dos_contact: true,
    show_accommodation: true,
    show_notes: false,
    show_guest_list_notes: true,
  },
  status: 'published',
};

test('sanitizeShowFormForDayType clears guest list notes on non-show days', () => {
  const sanitized = sanitizeShowFormForDayType({ ...baseForm, day_type: 'travel' });

  assert.equal(sanitized.guest_list_notes, '');
  assert.equal(sanitized.visibility.show_guest_list_notes, false);
});

test('show days keep guest list notes intact', () => {
  const sanitized = sanitizeShowFormForDayType(baseForm);

  assert.equal(sanitized.guest_list_notes, baseForm.guest_list_notes);
  assert.equal(sanitized.visibility.show_guest_list_notes, true);
});

test('off days expose a lighter relevant section set', () => {
  assert.deepEqual(getRelevantSectionsForDayType('off'), ['basics', 'venue', 'schedule', 'accommodation', 'notes']);
  assert.equal(isSectionRelevantForDayType('guestListNotes', 'off'), false);
  assert.equal(isSectionRelevantForDayType('schedule', 'off'), true);
});

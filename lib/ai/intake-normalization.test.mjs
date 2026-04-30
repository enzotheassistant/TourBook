import test from 'node:test';
import assert from 'node:assert/strict';

import { finalizeIntakeResult, normalizeTimeText, pickAnchorTime } from './intake-normalization.ts';

test('normalizeTimeText handles TBA, noon, midnight, shorthand meridiems, and 24h times', () => {
  assert.equal(normalizeTimeText('tba'), 'TBA');
  assert.equal(normalizeTimeText('12n'), '12:00 PM');
  assert.equal(normalizeTimeText('midnight'), '12:00 AM');
  assert.equal(normalizeTimeText('12a'), '12:00 AM');
  assert.equal(normalizeTimeText('7p'), '7:00 PM');
  assert.equal(normalizeTimeText('19:30'), '19:30');
});

test('pickAnchorTime returns normalized anchor values', () => {
  const items = [
    { label: 'Doors', time: '7p' },
    { label: 'Curfew', time: 'midnight' },
  ];

  assert.equal(pickAnchorTime(items, ['doors']), '7:00 PM');
  assert.equal(pickAnchorTime(items, ['curfew']), '12:00 AM');
});

test('finalizeIntakeResult backfills explicit single-row venue, address, region, and partial contact data from source text', () => {
  const intake = {
    provider: 'test',
    model: 'test',
    rows: [{
      date: '2026-05-01',
      city: 'Toronto',
      region: '',
      venue_name: '',
      venue_address: '',
      dos_name: 'Sam',
      dos_phone: '',
      schedule_items: [{ label: 'Doors', time: '7p' }],
      flags: [],
    }],
  };

  const finalized = finalizeIntakeResult(intake, [
    'Venue: The Danforth Music Hall',
    'Region: ON',
    'Address: 147 Danforth Ave, Toronto, ON',
    'DOS: Sam 416-555-1234',
  ].join('\n'));

  assert.equal(finalized.rows[0].venue_name, 'The Danforth Music Hall');
  assert.equal(finalized.rows[0].region, 'ON');
  assert.equal(finalized.rows[0].venue_address, '147 Danforth Ave, Toronto, ON');
  assert.equal(finalized.rows[0].dos_phone, '416-555-1234');
  assert.equal(finalized.rows[0].schedule_items[0].time, '7:00 PM');
  assert.ok(!finalized.rows[0].flags.includes('partial_contact_details'));
});

test('finalizeIntakeResult backfills multiline DOS block and preserves explicit email in notes', () => {
  const intake = {
    provider: 'test',
    model: 'test',
    rows: [{
      date: '2026-05-01',
      city: 'Toronto',
      region: 'ON',
      venue_name: 'The Danforth Music Hall',
      venue_address: '147 Danforth Ave, Toronto, ON',
      dos_name: '',
      dos_phone: '',
      notes: '',
      flags: [],
    }],
  };

  const finalized = finalizeIntakeResult(intake, [
    'DOS:',
    'Name: Jamie Flores',
    'Cell: 416-555-2000',
    'Email: jamie@example.com',
  ].join('\n'));

  assert.equal(finalized.rows[0].dos_name, 'Jamie Flores');
  assert.equal(finalized.rows[0].dos_phone, '416-555-2000');
  assert.equal(finalized.rows[0].notes, 'Email: jamie@example.com');
  assert.ok(!finalized.rows[0].flags.includes('partial_contact_details'));
});

test('finalizeIntakeResult prefers DOS-like labels such as TM over generic promoter contact for single-row imports', () => {
  const intake = {
    provider: 'test',
    model: 'test',
    rows: [{
      date: '2026-05-01',
      city: 'Toronto',
      region: 'ON',
      venue_name: 'The Danforth Music Hall',
      venue_address: '147 Danforth Ave, Toronto, ON',
      dos_name: '',
      dos_phone: '',
      notes: '',
      flags: [],
    }],
  };

  const finalized = finalizeIntakeResult(intake, [
    'Promoter: Pat 905-555-1000',
    'TM: Robin Vega 647-555-3000 robin@example.com',
  ].join('\n'));

  assert.equal(finalized.rows[0].dos_name, 'Robin Vega');
  assert.equal(finalized.rows[0].dos_phone, '647-555-3000');
  assert.equal(finalized.rows[0].notes, 'Email: robin@example.com');
});

test('finalizeIntakeResult preserves model-picked venue/region and only fills blanks from explicit labels', () => {
  const intake = {
    provider: 'test',
    model: 'test',
    rows: [{
      date: '2026-05-01',
      city: 'Toronto',
      region: 'ON',
      venue_name: 'Model Venue',
      venue_address: '',
      dos_name: '',
      dos_phone: '',
      flags: [],
    }],
  };

  const finalized = finalizeIntakeResult(intake, [
    'Venue: Explicit Venue In Source',
    'Region: QC',
    'Address: 147 Danforth Ave, Toronto, ON',
  ].join('\n'));

  assert.equal(finalized.rows[0].venue_name, 'Model Venue');
  assert.equal(finalized.rows[0].region, 'ON');
  assert.equal(finalized.rows[0].venue_address, '147 Danforth Ave, Toronto, ON');
});

test('finalizeIntakeResult splits compact inline city+region already packed into the city field', () => {
  const intake = {
    provider: 'test',
    model: 'test',
    rows: [{
      date: '2026-05-01',
      city: 'Toronto ON',
      region: '',
      venue_name: 'The Danforth Music Hall',
      venue_address: '',
      dos_name: '',
      dos_phone: '',
      flags: [],
    }],
  };

  const finalized = finalizeIntakeResult(intake, '');

  assert.equal(finalized.rows[0].city, 'Toronto');
  assert.equal(finalized.rows[0].region, 'ON');
});

test('finalizeIntakeResult extracts compact inline city+region from labeled market text when region is blank', () => {
  const intake = {
    provider: 'test',
    model: 'test',
    rows: [{
      date: '2026-05-01',
      city: '',
      region: '',
      venue_name: 'Club Soda',
      venue_address: '',
      dos_name: '',
      dos_phone: '',
      flags: [],
    }],
  };

  const finalized = finalizeIntakeResult(intake, [
    'Market: Montreal QC',
    'Venue: Club Soda',
  ].join('\n'));

  assert.equal(finalized.rows[0].city, 'Montreal');
  assert.equal(finalized.rows[0].region, 'QC');
});

test('finalizeIntakeResult does not invent a region from ordinary city text without a known region code', () => {
  const intake = {
    provider: 'test',
    model: 'test',
    rows: [{
      date: '2026-05-01',
      city: 'St Louis',
      region: '',
      venue_name: 'The Pageant',
      venue_address: '',
      dos_name: '',
      dos_phone: '',
      flags: [],
    }],
  };

  const finalized = finalizeIntakeResult(intake, '');

  assert.equal(finalized.rows[0].city, 'St Louis');
  assert.equal(finalized.rows[0].region, '');
});

test('finalizeIntakeResult flags ambiguous contacts and duplicate dates in multi-row imports without copying shared data blindly', () => {
  const intake = {
    provider: 'test',
    model: 'test',
    rows: [
      {
        date: '2026-05-01',
        city: 'Toronto',
        region: 'ON',
        venue_name: '',
        venue_address: '',
        dos_name: '',
        dos_phone: '',
        flags: [],
      },
      {
        date: '2026-05-01',
        city: 'Montreal',
        region: 'QC',
        venue_name: 'Club Soda',
        venue_address: '',
        dos_name: 'Alex',
        dos_phone: '',
        flags: [],
      },
    ],
  };

  const finalized = finalizeIntakeResult(intake, [
    'DOS: Sam 416-555-1234',
    'Promoter Contact: Alex 514-555-0000',
  ].join('\n'));

  assert.equal(finalized.rows[0].dos_name, '');
  assert.equal(finalized.rows[0].dos_phone, '');
  assert.ok(finalized.rows[0].flags.includes('missing_venue_name'));
  assert.ok(finalized.rows[1].flags.includes('partial_contact_details'));
  assert.ok(finalized.rows[1].flags.includes('duplicate_date_in_import'));
  assert.ok(finalized.warnings.some((warning) => warning.includes('contact details were incomplete or ambiguous')));
  assert.ok(finalized.warnings.some((warning) => warning.includes('dates need manual review')));
});

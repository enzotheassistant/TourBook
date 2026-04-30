import type { IntakeResult, IntakeRow, IntakeScheduleItem } from '@/lib/ai/intake-types';

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function pushFlag(flags: string[] | undefined, flag: string) {
  const next = Array.isArray(flags) ? [...flags] : [];
  if (!next.includes(flag)) next.push(flag);
  return next;
}

export function normalizeScheduleLabel(value: string) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeAmPmToken(value: string) {
  return value.replace(/\./g, '').toUpperCase();
}

export function normalizeTimeText(value: string) {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) return '';

  const lowered = trimmed.toLowerCase();
  if (/^(tba|tbd|to be (announced|determined))$/.test(lowered)) return 'TBA';
  if (/^(noon|12\s*n|12n|12\s*noon)$/.test(lowered)) return '12:00 PM';
  if (/^(midnight|12\s*a|12a|12\s*am|12am)$/.test(lowered)) return '12:00 AM';

  const compactAmPm = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?$/i);
  if (compactAmPm) {
    const hour = Number(compactAmPm[1]);
    const minute = compactAmPm[2] ?? '00';
    const suffix = compactAmPm[3].toUpperCase() === 'A' ? 'AM' : 'PM';
    if (hour >= 1 && hour <= 12) return `${hour}:${minute} ${suffix}`;
  }

  const amPm = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap](?:\.?m\.?)?)$/i);
  if (amPm) {
    const hour = Number(amPm[1]);
    const minute = amPm[2] ?? '00';
    if (hour >= 1 && hour <= 12) return `${hour}:${minute} ${normalizeAmPmToken(amPm[3])}`;
  }

  const twentyFourHour = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (twentyFourHour) {
    return `${twentyFourHour[1].padStart(2, '0')}:${twentyFourHour[2]}`;
  }

  return trimmed;
}

export function pickAnchorTime(items: IntakeScheduleItem[] | undefined, labels: string[]) {
  const normalizedTargets = new Set(labels.map((label) => normalizeScheduleLabel(label)));
  for (const item of items ?? []) {
    const normalized = normalizeScheduleLabel(item.label ?? '');
    if (normalizedTargets.has(normalized) && normalizeText(item.time)) {
      return normalizeTimeText(item.time);
    }
  }
  return '';
}

function normalizeScheduleItems(items: IntakeScheduleItem[] | undefined) {
  return (items ?? [])
    .map((item) => ({
      label: normalizeText(item.label),
      time: normalizeTimeText(normalizeText(item.time)),
    }))
    .filter((item) => item.label || item.time);
}

type ExtractedContact = {
  name: string;
  phone: string;
};

function normalizePhone(value: string) {
  return normalizeWhitespace(value.replace(/[;,]+$/g, ''));
}

function extractContactsFromText(sourceText: string | undefined | null): ExtractedContact[] {
  const text = typeof sourceText === 'string' ? sourceText : '';
  if (!text.trim()) return [];

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const contacts: ExtractedContact[] = [];

  for (const line of lines) {
    if (!/(dos|day of show|day-of-show|promoter|contact)/i.test(line)) continue;

    const phoneMatch = line.match(/(?:\+?\d[\d().\-\s]{6,}\d)/);
    const phone = normalizePhone(phoneMatch?.[0] ?? '');

    let name = line
      .replace(/^(?:dos|day of show|day-of-show|promoter|contact)\s*(?:contact)?\s*[:\-]\s*/i, '')
      .replace(/(?:phone|cell|mobile|tel)\s*[:\-]?\s*(?:\+?\d[\d().\-\s]{6,}\d).*/i, '')
      .replace(/(?:\+?\d[\d().\-\s]{6,}\d).*/i, '')
      .replace(/[\-|,;]\s*$/, '');

    name = normalizeWhitespace(name);
    if (!name && !phone) continue;

    contacts.push({ name, phone });
  }

  const seen = new Set<string>();
  return contacts.filter((contact) => {
    const key = `${contact.name.toLowerCase()}::${contact.phone}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractSingleVenueFromText(sourceText: string | undefined | null) {
  const text = typeof sourceText === 'string' ? sourceText : '';
  if (!text.trim()) return { venueName: '', venueAddress: '' };

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let venueName = '';
  let venueAddress = '';

  for (const line of lines) {
    if (!venueName) {
      const venueMatch = line.match(/^(?:venue|location|club|room)\s*[:\-]\s*(.+)$/i);
      if (venueMatch?.[1]) venueName = normalizeWhitespace(venueMatch[1]);
    }

    if (!venueAddress) {
      const addressMatch = line.match(/^(?:address|venue address|location address)\s*[:\-]\s*(.+)$/i);
      if (addressMatch?.[1]) venueAddress = normalizeWhitespace(addressMatch[1]);
    }
  }

  return { venueName, venueAddress };
}

function maybeEnrichSingleRow(row: IntakeRow, sourceText: string | undefined | null) {
  let next: IntakeRow = {
    ...row,
    schedule_items: normalizeScheduleItems(row.schedule_items),
    dos_name: normalizeText(row.dos_name),
    dos_phone: normalizePhone(normalizeText(row.dos_phone)),
    venue_name: normalizeText(row.venue_name),
    venue_address: normalizeText(row.venue_address),
  };

  const contacts = extractContactsFromText(sourceText);
  if (contacts.length === 1) {
    const [contact] = contacts;
    if (!next.dos_name && contact.name) next = { ...next, dos_name: contact.name };
    if (!next.dos_phone && contact.phone) next = { ...next, dos_phone: contact.phone };
  } else if ((!next.dos_name || !next.dos_phone) && contacts.length > 1) {
    next = { ...next, flags: pushFlag(next.flags, 'ambiguous_contact_details') };
  }

  const venue = extractSingleVenueFromText(sourceText);
  if (!next.venue_name && venue.venueName) next = { ...next, venue_name: venue.venueName };
  if (!next.venue_address && venue.venueAddress) next = { ...next, venue_address: venue.venueAddress };

  return next;
}

export function finalizeIntakeResult(intake: IntakeResult, sourceText: string | undefined | null): IntakeResult {
  const rows = intake.rows.map((row) => ({
    ...row,
    schedule_items: normalizeScheduleItems(row.schedule_items),
    dos_name: normalizeText(row.dos_name),
    dos_phone: normalizePhone(normalizeText(row.dos_phone)),
    venue_name: normalizeText(row.venue_name),
    venue_address: normalizeText(row.venue_address),
    flags: Array.isArray(row.flags) ? [...new Set(row.flags.map((flag) => normalizeText(flag)).filter(Boolean))] : [],
  }));

  const nextRows = rows.length === 1 ? [maybeEnrichSingleRow(rows[0], sourceText)] : rows;
  const seenDates = new Set<string>();

  const finalizedRows = nextRows.map((row) => {
    let next = row;

    if (!normalizeText(next.venue_name)) next = { ...next, flags: pushFlag(next.flags, 'missing_venue_name') };
    if (!normalizeText(next.venue_address)) next = { ...next, flags: pushFlag(next.flags, 'missing_venue_address') };
    if ((normalizeText(next.dos_name) && !normalizeText(next.dos_phone)) || (!normalizeText(next.dos_name) && normalizeText(next.dos_phone))) {
      next = { ...next, flags: pushFlag(next.flags, 'partial_contact_details') };
    }

    if (!normalizeText(next.date)) {
      next = { ...next, flags: pushFlag(next.flags, 'date_requires_review') };
    } else if (seenDates.has(next.date)) {
      next = { ...next, flags: pushFlag(next.flags, 'duplicate_date_in_import') };
    }

    if (normalizeText(next.date)) seenDates.add(next.date);
    return next;
  });

  const warnings = [...(intake.warnings ?? [])];
  if (finalizedRows.some((row) => row.flags?.includes('missing_venue_name'))) {
    warnings.push('Some imported rows are missing a venue name and were kept as drafts for review.');
  }
  if (finalizedRows.some((row) => row.flags?.includes('partial_contact_details') || row.flags?.includes('ambiguous_contact_details'))) {
    warnings.push('Some contact details were incomplete or ambiguous and should be reviewed.');
  }
  if (finalizedRows.some((row) => row.flags?.includes('date_requires_review') || row.flags?.includes('duplicate_date_in_import'))) {
    warnings.push('Some imported dates need manual review before publishing.');
  }

  return {
    ...intake,
    rows: finalizedRows,
    warnings: [...new Set(warnings)],
  };
}

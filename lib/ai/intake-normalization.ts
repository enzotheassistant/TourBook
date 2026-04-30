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
  label: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
};

type ExtractedLocation = {
  city: string;
  region: string;
  venueName: string;
  venueAddress: string;
};

type StructuredRowFields = {
  city: string;
  region: string;
  venueName: string;
  venueAddress: string;
  dosName: string;
  dosPhone: string;
  notes: string;
};

const KNOWN_REGION_CODES = new Set([
  'AB', 'AK', 'AL', 'AR', 'AS', 'AZ', 'BC', 'CA', 'CO', 'CT', 'DC', 'DE', 'FL', 'GA', 'HI', 'IA', 'ID', 'IL', 'IN', 'KS', 'KY',
  'LA', 'MA', 'MB', 'MD', 'ME', 'MI', 'MN', 'MO', 'MS', 'MT', 'NB', 'NC', 'ND', 'NE', 'NF', 'NH', 'NJ', 'NL', 'NM', 'NS', 'NT',
  'NU', 'NV', 'NY', 'OH', 'OK', 'ON', 'OR', 'PA', 'PE', 'PQ', 'PR', 'QC', 'RI', 'SC', 'SD', 'SK', 'TN', 'TX', 'UT', 'VA', 'VI',
  'VT', 'WA', 'WI', 'WV', 'WY', 'YT',
]);

function normalizePhone(value: string) {
  return normalizeWhitespace(value.replace(/[;,]+$/g, ''));
}

function parseCompactCityRegion(value: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized || /\d/.test(normalized)) return null;

  const match = normalized.match(/^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'’\-]*(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'’\-]*)*)\s*,?\s+([A-Za-z]{2})$/);
  if (!match) return null;

  const city = normalizeWhitespace(match[1]);
  const region = match[2].toUpperCase();
  if (!city || city.length < 3 || !KNOWN_REGION_CODES.has(region)) return null;
  if (/^(?:venue|address|hotel|room|hall|theatre|theater)$/i.test(city)) return null;

  return { city, region };
}

function extractLabeledValue(line: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match?.[1]) return normalizeWhitespace(match[1]);
  }
  return '';
}

function sanitizeContactName(value: string) {
  return normalizeWhitespace(
    value
      .replace(/^[\-–—:;,]+\s*/, '')
      .replace(/\b(?:phone|cell|mobile|tel|email|e-mail|mail)\b.*$/i, '')
      .replace(/(?:\+?\d[\d().\-\s]{6,}\d).*/i, '')
      .replace(/[<([]?\S+@\S+[>)]?.*$/i, '')
      .replace(/[\-|,;]\s*$/, ''),
  );
}

function mergeContact(target: ExtractedContact, source: Partial<ExtractedContact>) {
  if (!target.name && source.name) target.name = source.name;
  if (!target.phone && source.phone) target.phone = source.phone;
  if (!target.email && source.email) target.email = source.email;
  if (!target.notes && source.notes) target.notes = source.notes;
  return target;
}

function extractContactsFromText(sourceText: string | undefined | null): ExtractedContact[] {
  const text = typeof sourceText === 'string' ? sourceText : '';
  if (!text.trim()) return [];

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const contacts: ExtractedContact[] = [];
  const contactHeaderPattern = /^(dos|day of show|day-of-show|dos contact|promoter(?: contact)?|contact|tm|tour manager)\s*(?:contact)?\s*[:\-]?\s*(.*)$/i;
  const inlineNamePatterns = [/(?:name|contact|promoter|tm|tour manager)\s*[:\-]\s*(.+)$/i];
  const inlinePhonePatterns = [/(?:phone|cell|mobile|tel)\s*[:\-]\s*(\+?\d[\d().\-\s]{6,}\d)/i];
  const inlineEmailPatterns = [/(?:email|e-mail|mail)\s*[:\-]\s*([^\s,;<>]+@[^\s,;<>]+)/i];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const headerMatch = line.match(contactHeaderPattern);
    if (!headerMatch) continue;

    const label = normalizeWhitespace(headerMatch[1]).toLowerCase();
    const inlineRemainder = normalizeWhitespace(headerMatch[2] ?? '');
    const contact: ExtractedContact = { label, name: '', phone: '', email: '', notes: '' };

    const inlinePhoneMatch = inlineRemainder.match(/(?:\+?\d[\d().\-\s]{6,}\d)/);
    const inlineEmailMatch = inlineRemainder.match(/[^\s,;<>]+@[^\s,;<>]+/);
    mergeContact(contact, {
      name: sanitizeContactName(extractLabeledValue(inlineRemainder, inlineNamePatterns) || inlineRemainder),
      phone: normalizePhone(extractLabeledValue(inlineRemainder, inlinePhonePatterns) || inlinePhoneMatch?.[0] || ''),
      email: normalizeWhitespace(extractLabeledValue(inlineRemainder, inlineEmailPatterns) || inlineEmailMatch?.[0] || ''),
    });

    let lookahead = index + 1;
    while (lookahead < lines.length) {
      const nextLine = lines[lookahead];
      if (contactHeaderPattern.test(nextLine)) break;
      if (/^(?:date|city|market|region|state|province|prov|st|venue|location|address|hotel|notes?)\s*[:\-]/i.test(nextLine)) break;

      const extractedName = sanitizeContactName(extractLabeledValue(nextLine, inlineNamePatterns));
      const extractedPhone = normalizePhone(extractLabeledValue(nextLine, inlinePhonePatterns) || nextLine.match(/(?:\+?\d[\d().\-\s]{6,}\d)/)?.[0] || '');
      const extractedEmail = normalizeWhitespace(extractLabeledValue(nextLine, inlineEmailPatterns) || nextLine.match(/[^\s,;<>]+@[^\s,;<>]+/)?.[0] || '');
      const roleOnly = /^(?:role|title)\s*[:\-]\s*(.+)$/i.exec(nextLine)?.[1];
      const freeformName = !/^(?:phone|cell|mobile|tel|email|e-mail|mail|role|title)\s*[:\-]/i.test(nextLine)
        ? sanitizeContactName(nextLine)
        : '';

      if (!extractedName && !extractedPhone && !extractedEmail && !roleOnly && !freeformName) break;

      mergeContact(contact, {
        name: extractedName || freeformName,
        phone: extractedPhone,
        email: extractedEmail,
        notes: roleOnly ? normalizeWhitespace(roleOnly) : '',
      });
      lookahead += 1;
    }

    if (!contact.name && !contact.phone && !contact.email) continue;
    contacts.push(contact);
  }

  const seen = new Set<string>();
  return contacts.filter((contact) => {
    const key = `${contact.label}::${contact.name.toLowerCase()}::${contact.phone}::${contact.email.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractSingleLocationFromText(sourceText: string | undefined | null): ExtractedLocation {
  const text = typeof sourceText === 'string' ? sourceText : '';
  if (!text.trim()) return { city: '', region: '', venueName: '', venueAddress: '' };

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let city = '';
  let region = '';
  let venueName = '';
  let venueAddress = '';

  for (const line of lines) {
    if (!venueName) {
      const venueMatch = line.match(/^(?:venue|location|club|room|hall|theatre|theater)\s*[:\-]\s*(.+)$/i);
      if (venueMatch?.[1]) venueName = normalizeWhitespace(venueMatch[1]);
    }

    if (!venueAddress) {
      const addressMatch = line.match(/^(?:address|venue address|location address)\s*[:\-]\s*(.+)$/i);
      if (addressMatch?.[1]) venueAddress = normalizeWhitespace(addressMatch[1]);
    }

    if (!city) {
      const cityMatch = line.match(/^(?:city|market)\s*[:\-]\s*(.+)$/i);
      if (cityMatch?.[1]) {
        const rawCity = normalizeWhitespace(cityMatch[1]);
        const compact = parseCompactCityRegion(rawCity);
        city = compact?.city || rawCity;
        if (!region && compact?.region) region = compact.region;
      }
    }

    if (!region) {
      const regionMatch = line.match(/^(?:region|state|province|prov|st)\s*[:\-]\s*(.+)$/i);
      if (regionMatch?.[1]) region = normalizeWhitespace(regionMatch[1]).toUpperCase();
    }
  }

  return { city, region, venueName, venueAddress };
}

function extractStructuredFieldsFromNotes(row: IntakeRow): StructuredRowFields | null {
  const notes = normalizeText(row.notes);
  if (!notes) return null;

  const remainingLines: string[] = [];
  let city = '';
  let region = '';
  let venueName = '';
  let venueAddress = '';
  let dosName = '';
  let dosPhone = '';

  for (const rawLine of notes.split(/\r?\n/)) {
    const line = normalizeWhitespace(rawLine);
    if (!line) continue;

    const cityMatch = line.match(/^(?:city|market)\s*[:\-]\s*(.+)$/i);
    if (cityMatch?.[1]) {
      const rawCity = normalizeWhitespace(cityMatch[1]);
      const compact = parseCompactCityRegion(rawCity);
      if (!city) city = compact?.city || rawCity;
      if (!region && compact?.region) region = compact.region;
      continue;
    }

    const regionMatch = line.match(/^(?:region|state|province|prov|st)\s*[:\-]\s*(.+)$/i);
    if (regionMatch?.[1]) {
      if (!region) region = normalizeWhitespace(regionMatch[1]).toUpperCase();
      continue;
    }

    const venueMatch = line.match(/^(?:venue|location|club|room|hall|theatre|theater)\s*[:\-]\s*(.+)$/i);
    if (venueMatch?.[1]) {
      if (!venueName) venueName = normalizeWhitespace(venueMatch[1]);
      continue;
    }

    const addressMatch = line.match(/^(?:address|venue address|location address)\s*[:\-]\s*(.+)$/i);
    if (addressMatch?.[1]) {
      if (!venueAddress) venueAddress = normalizeWhitespace(addressMatch[1]);
      continue;
    }

    const dosMatch = line.match(/^(?:dos|day of show|day-of-show|dos contact|tm|tour manager)\s*(?:contact)?\s*[:\-]\s*(.*)$/i);
    if (dosMatch) {
      const inline = normalizeWhitespace(dosMatch[1] ?? '');
      const inlinePhone = normalizePhone(inline.match(/(?:\+?\d[\d().\-\s]{6,}\d)/)?.[0] || '');
      const inlineName = sanitizeContactName(inline);
      if (!dosName && inlineName) dosName = inlineName;
      if (!dosPhone && inlinePhone) dosPhone = inlinePhone;
      continue;
    }

    const dosPhoneMatch = line.match(/^(?:dos phone|dos cell|dos mobile|dos tel|phone|cell|mobile|tel)\s*[:\-]\s*(\+?\d[\d().\-\s]{6,}\d)/i);
    if (dosPhoneMatch?.[1]) {
      if (!dosPhone) dosPhone = normalizePhone(dosPhoneMatch[1]);
      continue;
    }

    const dosNameMatch = line.match(/^(?:dos name|contact name|tm name|tour manager name|name)\s*[:\-]\s*(.+)$/i);
    if (dosNameMatch?.[1]) {
      if (!dosName) dosName = sanitizeContactName(dosNameMatch[1]);
      continue;
    }

    remainingLines.push(line);
  }

  if (!city && !region && !venueName && !venueAddress && !dosName && !dosPhone) return null;

  return {
    city,
    region,
    venueName,
    venueAddress,
    dosName,
    dosPhone,
    notes: remainingLines.join('\n'),
  };
}

function maybeEnrichSingleRow(row: IntakeRow, sourceText: string | undefined | null) {
  let next: IntakeRow = {
    ...row,
    schedule_items: normalizeScheduleItems(row.schedule_items),
    dos_name: normalizeText(row.dos_name),
    dos_phone: normalizePhone(normalizeText(row.dos_phone)),
    venue_name: normalizeText(row.venue_name),
    venue_address: normalizeText(row.venue_address),
    notes: normalizeText(row.notes),
  };

  const recoveredFromNotes = extractStructuredFieldsFromNotes(next);
  if (recoveredFromNotes) {
    if (!next.city && recoveredFromNotes.city) next = { ...next, city: recoveredFromNotes.city };
    if (!next.region && recoveredFromNotes.region) next = { ...next, region: recoveredFromNotes.region };
    if (!next.venue_name && recoveredFromNotes.venueName) next = { ...next, venue_name: recoveredFromNotes.venueName };
    if (!next.venue_address && recoveredFromNotes.venueAddress) next = { ...next, venue_address: recoveredFromNotes.venueAddress };
    if (!next.dos_name && recoveredFromNotes.dosName) next = { ...next, dos_name: recoveredFromNotes.dosName };
    if (!next.dos_phone && recoveredFromNotes.dosPhone) next = { ...next, dos_phone: recoveredFromNotes.dosPhone };
    if (recoveredFromNotes.notes !== next.notes) next = { ...next, notes: recoveredFromNotes.notes };
  }

  const contacts = extractContactsFromText(sourceText);
  const dosLikeContacts = contacts.filter((contact) => /^(?:dos|day of show|day-of-show|dos contact|tm|tour manager)$/i.test(contact.label));
  const preferredContacts = dosLikeContacts.length > 0 ? dosLikeContacts : contacts;

  if (preferredContacts.length === 1) {
    const [contact] = preferredContacts;
    if (!next.dos_name && contact.name) next = { ...next, dos_name: contact.name };
    if (!next.dos_phone && contact.phone) next = { ...next, dos_phone: contact.phone };
    if (contact.email) {
      const emailNote = contact.notes ? `${contact.notes} • ${contact.email}` : `Email: ${contact.email}`;
      if (!normalizeText(next.notes)) next = { ...next, notes: emailNote };
    } else if (contact.notes && !normalizeText(next.notes)) {
      next = { ...next, notes: contact.notes };
    }
  } else if ((!next.dos_name || !next.dos_phone) && preferredContacts.length > 1) {
    next = { ...next, flags: pushFlag(next.flags, 'ambiguous_contact_details') };
  }

  const location = extractSingleLocationFromText(sourceText);
  if (!next.city && location.city) next = { ...next, city: location.city };
  if (!next.region && location.region) next = { ...next, region: location.region };
  if (!next.venue_name && location.venueName) next = { ...next, venue_name: location.venueName };
  if (!next.venue_address && location.venueAddress) next = { ...next, venue_address: location.venueAddress };

  return next;
}

export function finalizeIntakeResult(intake: IntakeResult, sourceText: string | undefined | null): IntakeResult {
  const rows = intake.rows.map((row) => {
    const rawCity = normalizeText(row.city);
    const rawRegion = normalizeText(row.region).toUpperCase();
    const compact = parseCompactCityRegion(rawCity);
    const normalizedCity = compact ? compact.city : rawCity;
    const normalizedRegion = rawRegion || compact?.region || '';

    return {
      ...row,
      schedule_items: normalizeScheduleItems(row.schedule_items),
      city: normalizedCity,
      region: normalizedRegion,
      dos_name: normalizeText(row.dos_name),
      dos_phone: normalizePhone(normalizeText(row.dos_phone)),
      venue_name: normalizeText(row.venue_name),
      venue_address: normalizeText(row.venue_address),
      notes: normalizeText(row.notes),
      flags: Array.isArray(row.flags) ? [...new Set(row.flags.map((flag) => normalizeText(flag)).filter(Boolean))] : [],
    };
  });

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
  if (finalizedRows.some((row) => row.flags?.includes('ambiguous_contact_details') || row.flags?.includes('partial_contact_details'))) {
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

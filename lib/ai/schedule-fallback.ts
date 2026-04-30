import type { IntakeRow, IntakeScheduleItem } from '@/lib/ai/intake-types';

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function cleanLabel(value: string) {
  return normalizeWhitespace(value.replace(/^[-–—•*\u2022\s]+/, '').replace(/\s*[-–—:]\s*$/, ''));
}

function cleanTime(value: string) {
  return normalizeWhitespace(value.replace(/^[\[(]+/, '').replace(/[\])]+$/, ''));
}

function makeKey(item: IntakeScheduleItem) {
  return `${cleanLabel(item.label).toLowerCase()}::${cleanTime(item.time).toLowerCase()}`;
}

const TIME_PATTERN = String.raw`(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s?(?:am|pm)?`;
const TIME_RANGE_PATTERN = String.raw`${TIME_PATTERN}(?:\s*(?:-|–|—|to)\s*${TIME_PATTERN})?`;

const TIME_FIRST = new RegExp(`^(?:[-•*\\u2022]\\s*)?(?<time>${TIME_RANGE_PATTERN})\\s*(?:[-–—:|]\\s*)?(?<label>.+)$`, 'i');
const LABEL_FIRST = new RegExp(`^(?:[-•*\\u2022]\\s*)?(?<label>.+?)\\s*(?:[-–—:|]\\s+|\\s{2,})(?<time>${TIME_RANGE_PATTERN})$`, 'i');

export function extractScheduleItemsFromText(text: string | undefined | null): IntakeScheduleItem[] {
  const source = typeof text === 'string' ? text : '';
  if (!source.trim()) return [];

  const seen = new Set<string>();
  const items: IntakeScheduleItem[] = [];

  for (const rawLine of source.split(/\r?\n/)) {
    const line = normalizeWhitespace(rawLine);
    if (!line) continue;

    let match = line.match(TIME_FIRST);
    let label = match?.groups?.label ?? '';
    let time = match?.groups?.time ?? '';

    if (!match) {
      match = line.match(LABEL_FIRST);
      label = match?.groups?.label ?? '';
      time = match?.groups?.time ?? '';
    }

    label = cleanLabel(label);
    time = cleanTime(time);

    if (!label || !time) continue;
    if (/^(date|city|venue|address|hotel|notes?)$/i.test(label)) continue;
    if (/^[A-Z]{2}$/.test(label)) continue;

    const item = { label, time };
    const key = makeKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }

  return items;
}

export function backfillScheduleItemsFromSourceText(rows: IntakeRow[], sourceText: string | undefined | null): IntakeRow[] {
  if (!Array.isArray(rows) || rows.length !== 1) return rows;

  const extracted = extractScheduleItemsFromText(sourceText);
  if (extracted.length < 3) return rows;

  const [row] = rows;
  const existing = Array.isArray(row.schedule_items) ? row.schedule_items.filter((item) => cleanLabel(item.label || '') || cleanTime(item.time || '')) : [];

  const merged: IntakeScheduleItem[] = [];
  const seen = new Set<string>();

  for (const item of [...existing, ...extracted]) {
    const normalized = { label: cleanLabel(item.label || ''), time: cleanTime(item.time || '') };
    if (!normalized.label || !normalized.time) continue;
    const key = makeKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(normalized);
  }

  if (merged.length <= existing.length) return rows;

  return [{ ...row, schedule_items: merged }];
}

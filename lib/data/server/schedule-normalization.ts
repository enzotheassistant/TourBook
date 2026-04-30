/**
 * Pure schedule-item normalization helpers with no framework dependencies.
 * Keeping these free of @/ path aliases allows direct node:test imports.
 */

export type ScheduleItemLike = {
  id?: string | unknown;
  label?: string | unknown;
  time_text?: string | unknown;
  time?: string | unknown;
  sort_order?: number | unknown;
};

export type NormalizedScheduleItem = {
  id: string;
  label: string;
  time_text: string;
  sort_order: number;
};

export type AnchorValues = {
  load_in_time?: string;
  soundcheck_time?: string;
  doors_time?: string;
  show_time?: string;
  curfew_time?: string;
  schedule_items?: ScheduleItemLike[];
};

export function buildAnchorScheduleItems(values: AnchorValues): NormalizedScheduleItem[] {
  return [
    { id: '', label: 'Load In', time_text: String(values.load_in_time ?? '').trim(), sort_order: 0 },
    { id: '', label: 'Soundcheck', time_text: String(values.soundcheck_time ?? '').trim(), sort_order: 1 },
    { id: '', label: 'Doors', time_text: String(values.doors_time ?? '').trim(), sort_order: 2 },
    { id: '', label: 'Show', time_text: String(values.show_time ?? '').trim(), sort_order: 3 },
    { id: '', label: 'Curfew', time_text: String(values.curfew_time ?? '').trim(), sort_order: 4 },
  ].filter((item) => item.time_text);
}

/**
 * Normalise incoming schedule items for DB persistence.
 *
 * Priority order:
 *   1. Explicit items in `scheduleItems` (non-empty after filtering blanks)
 *   2. Existing items in `fallbackValues.schedule_items` (preserves arbitrary
 *      custom rows such as "Band Soundcheck" or "Line Check" when the incoming
 *      array is empty because the editor form only had unfilled placeholder rows)
 *   3. Anchor-field synthesis via `buildAnchorScheduleItems` (last resort, used
 *      mainly for brand-new dates that have no schedule_items at all)
 */
export function normalizeScheduleItemsForPersistence(
  scheduleItems: ScheduleItemLike[] | undefined,
  fallbackValues: AnchorValues,
): NormalizedScheduleItem[] {
  const explicit = (scheduleItems ?? [])
    .map((item, index) => ({
      id: String(item.id ?? ''),
      label: String(item.label ?? '').trim(),
      time_text: String(item.time_text ?? item.time ?? '').trim(),
      sort_order: Number.isFinite(item.sort_order) ? Number(item.sort_order) : index,
    }))
    .filter((item) => item.label || item.time_text);

  if (explicit.length > 0) {
    return explicit;
  }

  // If existing schedule items are available (e.g. from the DB), preserve them
  // before resorting to the anchor-only fallback. This prevents arbitrary custom
  // rows (e.g. "Band Soundcheck", "Line Check") from being silently dropped when
  // the incoming items array is empty or absent.
  const existingItems = (fallbackValues.schedule_items ?? [])
    .map((item, index) => ({
      id: String(item.id ?? ''),
      label: String(item.label ?? '').trim(),
      time_text: String(item.time_text ?? item.time ?? '').trim(),
      sort_order: Number.isFinite(item.sort_order) ? Number(item.sort_order) : index,
    }))
    .filter((item) => item.label || item.time_text);

  if (existingItems.length > 0) {
    return existingItems;
  }

  return buildAnchorScheduleItems(fallbackValues);
}

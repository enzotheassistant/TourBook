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

/**
 * Normalise incoming schedule items for DB persistence.
 *
 * Priority order:
 *   1. Explicit items in `scheduleItems` (non-empty after filtering blanks)
 *   2. Existing items in `fallbackScheduleItems` (preserves arbitrary custom
 *      rows such as "Band Soundcheck" or "Line Check" when the incoming array
 *      is empty because the editor form only had unfilled placeholder rows)
 *   3. Empty array — no anchor synthesis; arbitrary rows are never manufactured.
 */
export function normalizeScheduleItemsForPersistence(
  scheduleItems: ScheduleItemLike[] | undefined,
  fallbackScheduleItems: ScheduleItemLike[] | undefined,
): NormalizedScheduleItem[] {
  const normalize = (items: ScheduleItemLike[] | undefined): NormalizedScheduleItem[] =>
    (items ?? [])
      .map((item, index) => ({
        id: String(item.id ?? ''),
        label: String(item.label ?? '').trim(),
        time_text: String(item.time_text ?? item.time ?? '').trim(),
        sort_order: Number.isFinite(item.sort_order) ? Number(item.sort_order) : index,
      }))
      .filter((item) => item.label || item.time_text);

  const explicit = normalize(scheduleItems);
  if (explicit.length > 0) return explicit;

  const existing = normalize(fallbackScheduleItems);
  if (existing.length > 0) return existing;

  return [];
}

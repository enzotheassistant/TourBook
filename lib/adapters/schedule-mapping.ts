/**
 * Pure schedule-item mapping helpers for the show/date editor.
 * No @/ path aliases — importable directly from node:test suite.
 *
 * Converts ShowFormValues schedule items (shape: {id, label, time}) into
 * DateFormValues schedule items (shape: {id, label, time_text, sort_order})
 * for the outgoing API payload.
 */

export type ShowScheduleItem = {
  id?: string | unknown;
  label?: string | unknown;
  time?: string | unknown;
};

export type DateSchedulePayloadItem = {
  id: string;
  label: string;
  time_text: string;
  sort_order: number;
};

/**
 * Map ShowFormValues schedule items to the DateFormValues payload shape.
 *
 * All rows with a non-empty label OR a non-empty time are included — including
 * arbitrary rows like "Bleeker S/C" or "Band Soundcheck" that do not match any
 * of the five standard anchor labels (Load In, Soundcheck, Doors, Show, Curfew).
 * Only fully-blank rows (empty label AND empty time) are dropped.
 */
export function mapShowScheduleItemsToPayload(
  items: ShowScheduleItem[] | undefined,
): DateSchedulePayloadItem[] {
  return (items ?? [])
    .map((item, index) => ({
      id: String(item.id ?? ''),
      label: String(item.label ?? '').trim(),
      time_text: String(item.time ?? '').trim(),
      sort_order: index,
    }))
    .filter((item) => item.label || item.time_text);
}

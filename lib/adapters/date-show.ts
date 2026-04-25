import { normalizeShow } from '@/lib/normalize';
import { sanitizeShowFormForDayType } from '@/lib/tour-day';
import type { GuestListEntry, Show, ShowFormValues } from '@/lib/types';
import type { DateFormValues, DateRecord, ScopedGuestListEntry } from '@/lib/types/date-record';

function deriveTourName(date: DateRecord) {
  return String(date.legacy_tour_name ?? '').trim();
}

function buildScheduleItems(date: DateRecord): Show['schedule_items'] {
  const explicit = (date.schedule_items ?? [])
    .map((item) => ({
      id: String(item.id ?? ''),
      label: String(item.label ?? ''),
      time: String(item.time_text ?? ''),
    }))
    .filter((item) => item.label.trim() || item.time.trim());

  if (explicit.length > 0) {
    return explicit;
  }

  return [
    { id: `load-in-${date.id}`, label: 'Load In', time: String(date.load_in_time ?? '') },
    { id: `soundcheck-${date.id}`, label: 'Soundcheck', time: String(date.soundcheck_time ?? '') },
    { id: `doors-${date.id}`, label: 'Doors', time: String(date.doors_time ?? '') },
    { id: `show-${date.id}`, label: 'Show', time: String(date.show_time ?? '') },
    { id: `curfew-${date.id}`, label: 'Curfew', time: String(date.curfew_time ?? '') },
  ].filter((item) => item.time.trim());
}

export function mapDateRecordToShow(date: DateRecord): Show {
  return normalizeShow({
    id: date.id,
    date: date.date,
    day_type: date.day_type,
    city: date.city,
    region: date.region,
    country: date.country,
    venue_name: date.venue_name,
    tour_name: deriveTourName(date),
    label: date.label,
    venue_address: date.venue_address,
    venue_maps_url: date.venue_maps_url,
    dos_name: date.dos_name,
    dos_phone: date.dos_phone,
    parking_load_info: date.parking_load_info,
    schedule_items: buildScheduleItems(date),
    hotel_name: date.hotel_name,
    hotel_address: date.hotel_address,
    hotel_maps_url: date.hotel_maps_url,
    hotel_notes: date.hotel_notes,
    notes: date.notes,
    guest_list_notes: date.guest_list_notes,
    created_at: date.created_at,
    status: date.status === 'draft' ? 'draft' : 'published',
    visibility: date.visibility,
  });
}

function pickAnchorTime(show: Partial<ShowFormValues>, labels: string[]) {
  const normalizedLabels = labels.map((label) => label.trim().toLowerCase());
  const explicit = (show.schedule_items ?? []).find((item) => normalizedLabels.includes(String(item.label ?? '').trim().toLowerCase()));
  return String(explicit?.time ?? '').trim();
}

export function mapShowFormToDateForm(show: Partial<ShowFormValues>, scope: { workspaceId: string; projectId: string; tourId?: string | null }): Partial<DateFormValues> {
  const sanitizedShow = sanitizeShowFormForDayType(show as ShowFormValues);
  const scheduleItems = (sanitizedShow.schedule_items ?? [])
    .map((item, index) => ({
      id: String(item.id ?? ''),
      label: String(item.label ?? '').trim(),
      time_text: String(item.time ?? '').trim(),
      sort_order: index,
    }))
    .filter((item) => item.label || item.time_text);

  return {
    id: sanitizedShow.id,
    workspace_id: scope.workspaceId,
    project_id: scope.projectId,
    tour_id: scope.tourId ?? null,
    legacy_tour_name: String(sanitizedShow.tour_name ?? '').trim() || null,
    date: String(sanitizedShow.date ?? '').trim(),
    day_type: sanitizedShow.day_type === 'travel' || sanitizedShow.day_type === 'off' ? sanitizedShow.day_type : 'show',
    status: sanitizedShow.status === 'draft' ? 'draft' : 'published',
    city: String(sanitizedShow.city ?? '').trim(),
    region: String(sanitizedShow.region ?? '').trim(),
    country: String(sanitizedShow.country ?? '').trim(),
    venue_name: String(sanitizedShow.venue_name ?? '').trim(),
    label: String(sanitizedShow.label ?? '').trim(),
    venue_address: String(sanitizedShow.venue_address ?? '').trim(),
    venue_maps_url: String(sanitizedShow.venue_maps_url ?? '').trim(),
    dos_name: String(sanitizedShow.dos_name ?? '').trim(),
    dos_phone: String(sanitizedShow.dos_phone ?? '').trim(),
    parking_load_info: String(sanitizedShow.parking_load_info ?? '').trim(),
    hotel_name: String(sanitizedShow.hotel_name ?? '').trim(),
    hotel_address: String(sanitizedShow.hotel_address ?? '').trim(),
    hotel_maps_url: String(sanitizedShow.hotel_maps_url ?? '').trim(),
    hotel_notes: String(sanitizedShow.hotel_notes ?? '').trim(),
    notes: String(sanitizedShow.notes ?? '').trim(),
    guest_list_notes: String(sanitizedShow.guest_list_notes ?? '').trim(),
    load_in_time: pickAnchorTime(sanitizedShow, ['load in', 'load-in', 'load']),
    soundcheck_time: pickAnchorTime(sanitizedShow, ['soundcheck']),
    doors_time: pickAnchorTime(sanitizedShow, ['doors']),
    show_time: pickAnchorTime(sanitizedShow, ['show']),
    curfew_time: pickAnchorTime(sanitizedShow, ['curfew']),
    visibility: sanitizedShow.visibility,
    schedule_items: scheduleItems,
  };
}

export function mapScopedGuestListEntryToLegacy(entry: ScopedGuestListEntry): GuestListEntry {
  return {
    id: entry.id,
    show_id: entry.date_id,
    name: entry.name,
    created_at: entry.created_at,
  };
}

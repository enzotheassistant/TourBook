import { normalizeShow } from '@/lib/normalize';
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
  const scheduleItems = (show.schedule_items ?? [])
    .map((item, index) => ({
      id: String(item.id ?? ''),
      label: String(item.label ?? '').trim(),
      time_text: String(item.time ?? '').trim(),
      sort_order: index,
    }))
    .filter((item) => item.label || item.time_text);

  return {
    id: show.id,
    workspace_id: scope.workspaceId,
    project_id: scope.projectId,
    tour_id: scope.tourId ?? null,
    legacy_tour_name: String(show.tour_name ?? '').trim() || null,
    date: String(show.date ?? '').trim(),
    day_type: show.day_type === 'travel' || show.day_type === 'off' ? show.day_type : 'show',
    status: show.status === 'draft' ? 'draft' : 'published',
    city: String(show.city ?? '').trim(),
    region: String(show.region ?? '').trim(),
    country: String(show.country ?? '').trim(),
    venue_name: String(show.venue_name ?? '').trim(),
    label: String(show.label ?? '').trim(),
    venue_address: String(show.venue_address ?? '').trim(),
    venue_maps_url: String(show.venue_maps_url ?? '').trim(),
    dos_name: String(show.dos_name ?? '').trim(),
    dos_phone: String(show.dos_phone ?? '').trim(),
    parking_load_info: String(show.parking_load_info ?? '').trim(),
    hotel_name: String(show.hotel_name ?? '').trim(),
    hotel_address: String(show.hotel_address ?? '').trim(),
    hotel_maps_url: String(show.hotel_maps_url ?? '').trim(),
    hotel_notes: String(show.hotel_notes ?? '').trim(),
    notes: String(show.notes ?? '').trim(),
    guest_list_notes: String(show.guest_list_notes ?? '').trim(),
    load_in_time: pickAnchorTime(show, ['load in', 'load-in', 'load']),
    soundcheck_time: pickAnchorTime(show, ['soundcheck']),
    doors_time: pickAnchorTime(show, ['doors']),
    show_time: pickAnchorTime(show, ['show']),
    curfew_time: pickAnchorTime(show, ['curfew']),
    visibility: show.visibility,
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

import { createEmptyScheduleItems } from '@/lib/defaults';
import { deriveShowStatus } from '@/lib/drafts';
import { GuestListEntry, ScheduleItem, Show, ShowFormValues, TourDayType } from '@/lib/types';

function makeScheduleId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `schedule-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeDayType(value: unknown): TourDayType {
  return value === 'travel' || value === 'off' ? value : 'show';
}

export function normalizeScheduleItems(items: ScheduleItem[] | undefined): ScheduleItem[] {
  const source = items && items.length > 0 ? items : createEmptyScheduleItems();
  return source.map((item) => ({
    id: item.id || makeScheduleId(),
    label: item.label ?? '',
    time: item.time ?? '',
  }));
}

export function normalizeShow(show: Partial<ShowFormValues> & { id?: string }): Show {
  return {
    id: show.id ?? '',
    date: show.date ?? '',
    day_type: normalizeDayType(show.day_type),
    city: show.city ?? '',
    region: show.region ?? '',
    country: show.country ?? '',
    venue_name: show.venue_name ?? '',
    tour_name: show.tour_name ?? '',
    label: show.label ?? '',
    venue_address: show.venue_address ?? '',
    venue_maps_url: show.venue_maps_url ?? '',
    dos_name: show.dos_name ?? '',
    dos_phone: show.dos_phone ?? '',
    parking_load_info: show.parking_load_info ?? '',
    schedule_items: normalizeScheduleItems(show.schedule_items),
    hotel_name: show.hotel_name ?? '',
    hotel_address: show.hotel_address ?? '',
    hotel_maps_url: show.hotel_maps_url ?? '',
    hotel_notes: show.hotel_notes ?? '',
    notes: show.notes ?? '',
    guest_list_notes: show.guest_list_notes ?? '',
    created_at: show.created_at ?? new Date().toISOString(),
    updated_at: show.updated_at ?? show.created_at ?? new Date().toISOString(),
    status: deriveShowStatus(show.id, show.status),
    visibility: {
      show_venue: show.visibility?.show_venue ?? true,
      show_parking_load_info: show.visibility?.show_parking_load_info ?? true,
      show_schedule: show.visibility?.show_schedule ?? true,
      show_dos_contact: show.visibility?.show_dos_contact ?? true,
      show_accommodation: show.visibility?.show_accommodation ?? true,
      show_notes: show.visibility?.show_notes ?? false,
      show_guest_list_notes: show.visibility?.show_guest_list_notes ?? false,
    },
  };
}

export function sortShows(shows: Show[], ascending = true) {
  return [...shows].sort((a, b) => ascending ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
}

export function sortGuestListEntries(entries: GuestListEntry[]) {
  return [...entries].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

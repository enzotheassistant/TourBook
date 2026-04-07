import { ScheduleItem, ShowFormValues, ShowVisibility } from '@/lib/types';

export const defaultVisibility: ShowVisibility = {
  show_venue: true,
  show_parking_load_info: true,
  show_schedule: true,
  show_dos_contact: true,
  show_accommodation: true,
  show_notes: false,
  show_guest_list_notes: false,
};

export function createEmptyScheduleItems(count = 5): ScheduleItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `schedule-${index + 1}`,
    label: '',
    time: '',
  }));
}

export const emptyShowForm: ShowFormValues = {
  id: '',
  date: '',
  city: '',
  venue_name: '',
  tour_name: '',
  venue_address: '',
  venue_maps_url: '',
  dos_name: '',
  dos_phone: '',
  parking_load_info: '',
  schedule_items: createEmptyScheduleItems(),
  hotel_name: '',
  hotel_address: '',
  hotel_maps_url: '',
  hotel_notes: '',
  notes: '',
  guest_list_notes: '',
  visibility: defaultVisibility,
};

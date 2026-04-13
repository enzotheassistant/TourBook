import type { WorkspaceRole } from '@/lib/types/tenant';

export type DateStatus = 'draft' | 'published' | 'archived' | 'cancelled';

export type DateVisibility = {
  show_venue: boolean;
  show_parking_load_info: boolean;
  show_schedule: boolean;
  show_dos_contact: boolean;
  show_accommodation: boolean;
  show_notes: boolean;
  show_guest_list_notes: boolean;
};

export type DateScheduleItem = {
  id: string;
  label: string;
  time_text: string;
  sort_order: number;
};

export type DateRecord = {
  id: string;
  workspace_id: string;
  project_id: string;
  tour_id: string | null;
  legacy_tour_name: string | null;
  date: string;
  status: DateStatus;
  city: string;
  region: string;
  country: string;
  venue_name: string;
  label: string;
  venue_address: string;
  venue_maps_url: string;
  dos_name: string;
  dos_phone: string;
  parking_load_info: string;
  hotel_name: string;
  hotel_address: string;
  hotel_maps_url: string;
  hotel_notes: string;
  notes: string;
  guest_list_notes: string;
  load_in_time: string;
  soundcheck_time: string;
  doors_time: string;
  show_time: string;
  curfew_time: string;
  visibility: DateVisibility;
  schedule_items: DateScheduleItem[];
  created_at: string;
  updated_at: string;
};

export type DateFormValues = Omit<DateRecord, 'created_at' | 'updated_at' | 'schedule_items'> & {
  schedule_items: Array<Partial<DateScheduleItem>>;
};

export type ScopedGuestListEntry = {
  id: string;
  workspace_id: string;
  project_id: string;
  date_id: string;
  name: string;
  created_at: string;
};

export type WorkspaceAccess = {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
};

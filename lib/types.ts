export type AddressField = {
  address: string;
  maps_url: string;
};

export type ScheduleItem = {
  id: string;
  label: string;
  time: string;
};

export type ShowVisibility = {
  show_venue: boolean;
  show_parking_load_info: boolean;
  show_schedule: boolean;
  show_dos_contact: boolean;
  show_accommodation: boolean;
  show_notes: boolean;
  show_guest_list_notes: boolean;
};

export type ShowStatus = 'draft' | 'published';

export type Show = {
  id: string;
  date: string;
  city: string;
  region: string;
  venue_name: string;
  tour_name: string;
  venue_address: string;
  venue_maps_url: string;
  dos_name: string;
  dos_phone: string;
  parking_load_info: string;
  schedule_items: ScheduleItem[];
  hotel_name: string;
  hotel_address: string;
  hotel_maps_url: string;
  hotel_notes: string;
  notes: string;
  guest_list_notes: string;
  created_at: string;
  visibility: ShowVisibility;
  status: ShowStatus;
};

export type GuestListEntry = {
  id: string;
  show_id: string;
  name: string;
  created_at: string;
};

export type ShowFormValues = Omit<Show, 'created_at'> & {
  created_at?: string;
};

export type AddressSuggestion = {
  id: string;
  label: string;
  address: string;
  maps_url: string;
  country?: string;
  region?: string;
  city?: string;
};

export type AiIntakeImageInput = {
  name: string;
  mime_type: string;
  data_base64: string;
};

export type AiIntakeScheduleLine = {
  label: string;
  time: string;
};

export type AiIntakeRow = {
  id: string;
  date: string;
  city: string;
  region: string;
  venue_name: string;
  tour_name: string;
  venue_address: string;
  dos_name: string;
  dos_phone: string;
  parking_load_info: string;
  hotel_name: string;
  hotel_address: string;
  hotel_notes: string;
  notes: string;
  schedule_items: AiIntakeScheduleLine[];
  include: boolean;
  confidence: number;
  flags: string[];
  possibleDuplicateId?: string;
};

export type AiIntakeResponse = {
  provider: string;
  model: string;
  rows: AiIntakeRow[];
};

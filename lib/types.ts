export type Show = {
  id: string;
  date: string;
  city: string;
  venue_name: string;
  venue_address: string;
  venue_maps_url: string;
  dos_name: string;
  dos_phone: string;
  parking_load_info: string;
  load_in: string;
  soundcheck: string;
  doors: string;
  show_time: string;
  curfew: string;
  hotel_name: string;
  hotel_address: string;
  hotel_maps_url: string;
  hotel_notes: string;
  created_at: string;
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

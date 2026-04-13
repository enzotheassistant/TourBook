export type IntakeFieldConfidence = "high" | "medium" | "low";

export type IntakeScheduleItem = {
  label: string;
  time: string;
};

export type IntakeRow = {
  date: string;
  city: string;
  region: string;
  venue_name: string;
  tour_name?: string;
  venue_address?: string;
  dos_name?: string;
  dos_phone?: string;
  parking_load_info?: string;
  schedule_items?: IntakeScheduleItem[];
  hotel_name?: string;
  hotel_address?: string;
  hotel_notes?: string;
  notes?: string;
  confidence?: number;
  flags?: string[];
};

export type IntakeResult = {
  rows: IntakeRow[];
  provider: string;
  model: string;
  attempts?: number;
  warnings?: string[];
};

export type IntakeImageInput = {
  mimeType: string;
  dataBase64: string;
  name?: string;
};

export type IntakeRequest = {
  text?: string;
  images?: IntakeImageInput[];
  existingShows?: Array<{ id: string; date: string; city: string; venue_name: string; status?: string }>;
};

-- TourBook: align public.dates schema with app expectations
-- Safe/idempotent migration for existing deployments.

begin;

alter table if exists public.dates
  add column if not exists legacy_tour_name text,
  add column if not exists label text,
  add column if not exists venue_address text,
  add column if not exists venue_maps_url text,
  add column if not exists dos_name text,
  add column if not exists dos_phone text,
  add column if not exists parking_load_info text,
  add column if not exists hotel_name text,
  add column if not exists hotel_address text,
  add column if not exists hotel_maps_url text,
  add column if not exists hotel_notes text,
  add column if not exists notes text,
  add column if not exists guest_list_notes text,
  add column if not exists load_in_time text,
  add column if not exists soundcheck_time text,
  add column if not exists doors_time text,
  add column if not exists show_time text,
  add column if not exists curfew_time text,
  add column if not exists show_venue boolean default true,
  add column if not exists show_parking_load_info boolean default true,
  add column if not exists show_schedule boolean default true,
  add column if not exists show_dos_contact boolean default true,
  add column if not exists show_accommodation boolean default true,
  add column if not exists show_notes boolean default false,
  add column if not exists show_guest_list_notes boolean default false,
  add column if not exists updated_at timestamptz default now();

-- Normalize null booleans for visibility flags.
update public.dates
set
  show_venue = coalesce(show_venue, true),
  show_parking_load_info = coalesce(show_parking_load_info, true),
  show_schedule = coalesce(show_schedule, true),
  show_dos_contact = coalesce(show_dos_contact, true),
  show_accommodation = coalesce(show_accommodation, true),
  show_notes = coalesce(show_notes, false),
  show_guest_list_notes = coalesce(show_guest_list_notes, false)
where
  show_venue is null
  or show_parking_load_info is null
  or show_schedule is null
  or show_dos_contact is null
  or show_accommodation is null
  or show_notes is null
  or show_guest_list_notes is null;

commit;

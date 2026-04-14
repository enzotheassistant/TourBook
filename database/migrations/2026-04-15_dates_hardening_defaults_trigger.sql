-- TourBook production hardening: defaults + updated_at automation

begin;

alter table if exists public.dates
  alter column status set default 'published',
  alter column show_venue set default true,
  alter column show_parking_load_info set default true,
  alter column show_schedule set default true,
  alter column show_dos_contact set default true,
  alter column show_accommodation set default true,
  alter column show_notes set default false,
  alter column show_guest_list_notes set default false,
  alter column created_at set default now(),
  alter column updated_at set default now();

update public.dates
set
  status = coalesce(status, 'published'),
  show_venue = coalesce(show_venue, true),
  show_parking_load_info = coalesce(show_parking_load_info, true),
  show_schedule = coalesce(show_schedule, true),
  show_dos_contact = coalesce(show_dos_contact, true),
  show_accommodation = coalesce(show_accommodation, true),
  show_notes = coalesce(show_notes, false),
  show_guest_list_notes = coalesce(show_guest_list_notes, false),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

-- constrain status values to known app states
alter table if exists public.dates
  drop constraint if exists dates_status_check;

alter table if exists public.dates
  add constraint dates_status_check
  check (status in ('draft','published','archived','cancelled'));

create or replace function public.tourbook_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_dates_updated_at on public.dates;
create trigger trg_dates_updated_at
before update on public.dates
for each row
execute function public.tourbook_set_updated_at();

commit;

-- Align guest_list_entries with date-scoped model (non-breaking for legacy rows)

begin;

alter table if exists public.guest_list_entries
  alter column show_id drop not null;

alter table if exists public.guest_list_entries
  drop constraint if exists guest_list_entries_show_id_fkey;

-- Best-effort backfill for legacy rows where show_id already matches a dates.id
update public.guest_list_entries gle
set date_id = gle.show_id::uuid
where gle.date_id is null
  and gle.show_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and exists (
    select 1 from public.dates d where d.id = gle.show_id::uuid
  );

-- Keep date_id nullable for now to avoid breaking existing legacy rows.
-- Enforce referential integrity for populated date_id values.
alter table if exists public.guest_list_entries
  drop constraint if exists guest_list_entries_date_id_fkey;

alter table if exists public.guest_list_entries
  add constraint guest_list_entries_date_id_fkey
  foreign key (date_id) references public.dates(id)
  on delete cascade
  not valid;

commit;

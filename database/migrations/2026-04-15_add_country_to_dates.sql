-- TourBook: add missing country column to dates
-- Safe to run multiple times.

begin;

alter table if exists public.dates
  add column if not exists country text;

-- Backfill existing rows so UI/filtering has a consistent value.
update public.dates
set country = ''
where country is null;

commit;

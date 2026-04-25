-- TourBook: first-pass tour day foundation (show / travel / off)
-- Safe/idempotent migration that preserves all existing date records.

begin;

alter table if exists public.dates
  add column if not exists day_type text;

update public.dates
set day_type = 'show'
where coalesce(nullif(trim(day_type), ''), 'show') not in ('show', 'travel', 'off');

alter table if exists public.dates
  alter column day_type set default 'show';

alter table if exists public.dates
  drop constraint if exists dates_day_type_check;

alter table if exists public.dates
  add constraint dates_day_type_check
  check (day_type in ('show', 'travel', 'off'));

commit;

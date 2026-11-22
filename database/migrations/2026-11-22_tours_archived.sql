-- Step 9: tidy up tours
--
-- 1. An "archived" marker on tours. Archived tours are hidden from the Tour
--    dropdown on the date form; their dates keep their tour name. Every
--    existing tour starts NOT archived, so nothing changes for anyone.
-- 2. Make sure every tour name already used on dates has a matching tour
--    record, so Settings can list it. (Saving a date was meant to do this,
--    but that code was asking for columns that don't exist, so it silently
--    did nothing; the app fix ships alongside this.)

begin;

alter table public.tours add column if not exists archived_at timestamptz;

insert into public.tours (workspace_id, project_id, name)
select distinct d.workspace_id, d.project_id, btrim(d.legacy_tour_name)
from public.dates d
where coalesce(btrim(d.legacy_tour_name), '') <> ''
  and d.project_id is not null
  and not exists (
    select 1 from public.tours t
    where t.project_id = d.project_id
      and lower(btrim(t.name)) = lower(btrim(d.legacy_tour_name))
  );

commit;

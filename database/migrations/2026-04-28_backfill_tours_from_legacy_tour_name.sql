-- TourBook: Backfill tours table from legacy_tour_name on dates
--
-- Context: The invite-scope tour dropdown reads from the `tours` table (entities
-- with UUIDs). However, dates historically stored tour names as free-text in
-- legacy_tour_name, so the tours table was empty and the dropdown showed nothing.
--
-- This migration:
--   1. Adds a unique constraint on (workspace_id, project_id, name) so upserts work cleanly.
--   2. Creates tour entities for every distinct (workspace_id, project_id, legacy_tour_name)
--      found on existing dates rows.
--   3. Back-fills tour_id on those dates rows so they link to the new entities.

begin;

-- 1. Unique constraint (idempotent guard)
alter table public.tours
  drop constraint if exists tours_workspace_project_name_key;

alter table public.tours
  add constraint tours_workspace_project_name_key
  unique (workspace_id, project_id, name);

-- 2. Create tour entities from distinct legacy names on dates
insert into public.tours (workspace_id, project_id, name, created_at)
select distinct on (workspace_id, project_id, trim(legacy_tour_name))
  workspace_id,
  project_id,
  trim(legacy_tour_name) as name,
  min(created_at) over (partition by workspace_id, project_id, trim(legacy_tour_name)) as created_at
from public.dates
where legacy_tour_name is not null
  and trim(legacy_tour_name) <> ''
on conflict (workspace_id, project_id, name) do nothing;

-- 3. Back-fill tour_id on dates that have a legacy_tour_name but no tour_id
update public.dates d
set tour_id = t.id
from public.tours t
where d.workspace_id = t.workspace_id
  and d.project_id   = t.project_id
  and trim(d.legacy_tour_name) = t.name
  and d.legacy_tour_name is not null
  and trim(d.legacy_tour_name) <> ''
  and d.tour_id is null;

commit;

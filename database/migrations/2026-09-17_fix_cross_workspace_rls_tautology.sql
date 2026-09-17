-- CRITICAL: dates_admin_delete, dates_editor_update, dates_editor_insert,
-- projects_admin_delete, projects_editor_update, projects_editor_insert,
-- tours_admin_delete, tours_editor_update, tours_editor_insert all had
-- `wm.workspace_id = wm.workspace_id` -- a self-comparison that is always
-- true -- instead of correlating to the target row's actual workspace_id.
-- This made these 9 policies check "is the user owner/admin/editor of ANY
-- workspace" rather than "of THIS row's workspace", allowing any owner/
-- admin/editor of one workspace to delete/update/insert dates, projects,
-- or tours rows belonging to ANY other workspace via a direct PostgREST
-- call with their own valid session -- bypassing the app's own
-- requireWorkspaceAccess/ensureProjectAccess checks entirely.
--
-- Found while investigating a lower-severity finding (tour-scoped members
-- reading their whole parent project via tourbook_has_project_access) --
-- pulling every policy's exact live definition surfaced this instead.
--
-- Verified safe before applying: every current app mutation path
-- (lib/data/server/dates.ts, projects.ts, tours.ts) uses the request-scoped
-- client and already validates the correct workspace at the app layer
-- before ever reaching the database, so no legitimate flow depends on this
-- bug. Verified live against real data (two distinct real workspace
-- owners) after applying: same-workspace reads/writes are unaffected,
-- cross-workspace update/delete/insert attempts are now denied in both
-- directions (confirmed via rolled-back transactions, zero data changed).
begin;

drop policy if exists "dates_admin_delete" on public.dates;
create policy "dates_admin_delete"
on public.dates
for delete
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = dates.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  )
);

drop policy if exists "dates_editor_update" on public.dates;
create policy "dates_editor_update"
on public.dates
for update
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = dates.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'editor')
  )
);

drop policy if exists "dates_editor_insert" on public.dates;
create policy "dates_editor_insert"
on public.dates
for insert
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = dates.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'editor')
  )
);

drop policy if exists "projects_admin_delete" on public.projects;
create policy "projects_admin_delete"
on public.projects
for delete
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = projects.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  )
);

drop policy if exists "projects_editor_update" on public.projects;
create policy "projects_editor_update"
on public.projects
for update
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = projects.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'editor')
  )
);

drop policy if exists "projects_editor_insert" on public.projects;
create policy "projects_editor_insert"
on public.projects
for insert
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = projects.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'editor')
  )
);

drop policy if exists "tours_admin_delete" on public.tours;
create policy "tours_admin_delete"
on public.tours
for delete
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = tours.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  )
);

drop policy if exists "tours_editor_update" on public.tours;
create policy "tours_editor_update"
on public.tours
for update
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = tours.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'editor')
  )
);

drop policy if exists "tours_editor_insert" on public.tours;
create policy "tours_editor_insert"
on public.tours
for insert
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = tours.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'editor')
  )
);

commit;

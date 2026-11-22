-- Roles redesign, part 3 (apply only after the app update is live)
--
--   1. Viewers can no longer read the guest list (Crew and above only).
--   2. Creating and renaming projects is for the Owner only. ('admin' is kept
--      for the retired level until nobody holds it.) Managers ('editor') could
--      previously do this at the database level even though the app never
--      offered it.

begin;

drop policy if exists guest_list_entries_read on public.guest_list_entries;
create policy guest_list_entries_read on public.guest_list_entries
for select using (
  exists (
    select 1 from public.dates d
    where d.id = guest_list_entries.date_id
      and (
        (d.tour_id is null and tourbook_has_broad_project_access(d.workspace_id, d.project_id))
        or (d.tour_id is not null and tourbook_has_tour_access(d.workspace_id, d.project_id, d.tour_id))
      )
      and (
        (
          (select wm.role from public.workspace_members wm
            where wm.workspace_id = d.workspace_id and wm.user_id = auth.uid() limit 1) = 'crew'
          and d.status = 'published'
        )
        or (select wm.role from public.workspace_members wm
            where wm.workspace_id = d.workspace_id and wm.user_id = auth.uid() limit 1) in ('owner', 'admin', 'editor')
      )
  )
);

drop policy if exists projects_editor_insert on public.projects;
create policy projects_editor_insert on public.projects
for insert with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = projects.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  )
);

drop policy if exists projects_editor_update on public.projects;
create policy projects_editor_update on public.projects
for update using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = projects.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  )
);

commit;

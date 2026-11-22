-- Roles redesign, part 1 (additive — nobody's access changes today)
--
-- New levels (on-screen name -> stored value):
--   Viewer  -> 'viewer'  day sheets only
--   Crew    -> 'crew'    (new) day sheets + add guest list names
--   Manager -> 'editor'  admin side for their projects + invite people
--   Owner   -> 'owner'   everything, incl. create/rename/delete projects
-- 'admin' is being retired (only one test account uses it).
--
-- This migration:
--   1. allows the new 'crew' value for members and invites
--   2. lets Crew read published dates, schedules, attachments and the guest
--      list (same as Viewers today), and add guest list names
--   3. lets Managers delete dates and tours (previously owner/admin only),
--      since admin is folding into Manager
-- Nothing is removed here. Hiding the guest list from Viewers happens in a
-- later migration, after the app update ships.

begin;

alter table public.workspace_members drop constraint if exists workspace_members_role_check;
alter table public.workspace_members
  add constraint workspace_members_role_check
  check (role in ('owner', 'admin', 'editor', 'crew', 'viewer'));

alter table public.workspace_invites drop constraint if exists workspace_invites_role_check;
alter table public.workspace_invites
  add constraint workspace_invites_role_check
  check (role in ('admin', 'editor', 'crew', 'viewer'));

-- Dates: Crew see published dates, like Viewers.
drop policy if exists dates_read on public.dates;
create policy dates_read on public.dates
for select using (
  (
    (tour_id is null and tourbook_has_broad_project_access(workspace_id, project_id))
    or (tour_id is not null and tourbook_has_tour_access(workspace_id, project_id, tour_id))
  )
  and (
    (
      (select wm.role from public.workspace_members wm
        where wm.workspace_id = dates.workspace_id and wm.user_id = auth.uid() limit 1) in ('viewer', 'crew')
      and status = 'published'
    )
    or (select wm.role from public.workspace_members wm
        where wm.workspace_id = dates.workspace_id and wm.user_id = auth.uid() limit 1) in ('owner', 'admin', 'editor')
  )
);

drop policy if exists date_attachments_read on public.date_attachments;
create policy date_attachments_read on public.date_attachments
for select using (
  exists (
    select 1 from public.dates d
    where d.id = date_attachments.date_id
      and (
        (d.tour_id is null and tourbook_has_broad_project_access(d.workspace_id, d.project_id))
        or (d.tour_id is not null and tourbook_has_tour_access(d.workspace_id, d.project_id, d.tour_id))
      )
      and (
        (
          (select wm.role from public.workspace_members wm
            where wm.workspace_id = d.workspace_id and wm.user_id = auth.uid() limit 1) in ('viewer', 'crew')
          and d.status = 'published'
        )
        or (select wm.role from public.workspace_members wm
            where wm.workspace_id = d.workspace_id and wm.user_id = auth.uid() limit 1) in ('owner', 'admin', 'editor')
      )
  )
);

drop policy if exists date_schedule_items_read on public.date_schedule_items;
create policy date_schedule_items_read on public.date_schedule_items
for select using (
  exists (
    select 1
    from public.dates d
    join public.workspace_members wm on wm.workspace_id = d.workspace_id
    where d.id = date_schedule_items.date_id
      and wm.user_id = auth.uid()
      and (
        wm.role in ('owner', 'admin', 'editor')
        or (wm.role in ('viewer', 'crew') and d.status = 'published')
      )
  )
);

-- Guest list: Crew can read (Viewers still can until the later migration).
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
            where wm.workspace_id = d.workspace_id and wm.user_id = auth.uid() limit 1) in ('viewer', 'crew')
          and d.status = 'published'
        )
        or (select wm.role from public.workspace_members wm
            where wm.workspace_id = d.workspace_id and wm.user_id = auth.uid() limit 1) in ('owner', 'admin', 'editor')
      )
  )
);

-- Guest list: Crew can add names, only on dates they can see.
drop policy if exists guest_list_entries_editor_insert on public.guest_list_entries;
create policy guest_list_entries_editor_insert on public.guest_list_entries
for insert with check (
  exists (
    select 1 from public.dates d
    where d.id = guest_list_entries.date_id
      and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = d.workspace_id
          and wm.user_id = auth.uid()
          and (
            wm.role in ('owner', 'admin', 'editor')
            or (
              wm.role = 'crew'
              and d.status = 'published'
              and (
                (d.tour_id is null and tourbook_has_broad_project_access(d.workspace_id, d.project_id))
                or (d.tour_id is not null and tourbook_has_tour_access(d.workspace_id, d.project_id, d.tour_id))
              )
            )
          )
      )
  )
);

-- Managers can delete dates and tours.
drop policy if exists dates_admin_delete on public.dates;
create policy dates_admin_delete on public.dates
for delete using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = dates.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'editor')
  )
);

drop policy if exists tours_admin_delete on public.tours;
create policy tours_admin_delete on public.tours
for delete using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = tours.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'editor')
  )
);

commit;

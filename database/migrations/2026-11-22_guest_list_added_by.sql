-- Guest list: remember (behind the scenes) who added each name, so Crew can
-- fix and remove the names they added themselves. This is never shown on
-- screen — Phil doesn't want people to see who added a name.
--
--   Crew:    add names; edit/remove only names they added
--   Manager: add, edit, remove any name (unchanged)
-- Names added before this change have no "added by", so only Managers can
-- change those.

begin;

alter table public.guest_list_entries
  add column if not exists added_by_user_id uuid default auth.uid() references auth.users(id) on delete set null;

-- Crew must add names as themselves (can't pretend someone else added them).
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
              and guest_list_entries.added_by_user_id = auth.uid()
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

drop policy if exists guest_list_entries_editor_update on public.guest_list_entries;
create policy guest_list_entries_editor_update on public.guest_list_entries
for update
using (
  exists (
    select 1 from public.dates d
    join public.workspace_members wm on wm.workspace_id = d.workspace_id and wm.user_id = auth.uid()
    where d.id = guest_list_entries.date_id
      and (
        wm.role in ('owner', 'admin', 'editor')
        or (wm.role = 'crew' and guest_list_entries.added_by_user_id = auth.uid() and d.status = 'published')
      )
  )
)
with check (
  exists (
    select 1 from public.dates d
    join public.workspace_members wm on wm.workspace_id = d.workspace_id and wm.user_id = auth.uid()
    where d.id = guest_list_entries.date_id
      and (
        wm.role in ('owner', 'admin', 'editor')
        or (wm.role = 'crew' and guest_list_entries.added_by_user_id = auth.uid() and d.status = 'published')
      )
  )
);

drop policy if exists guest_list_entries_editor_delete on public.guest_list_entries;
create policy guest_list_entries_editor_delete on public.guest_list_entries
for delete using (
  exists (
    select 1 from public.dates d
    join public.workspace_members wm on wm.workspace_id = d.workspace_id and wm.user_id = auth.uid()
    where d.id = guest_list_entries.date_id
      and (
        wm.role in ('owner', 'admin', 'editor')
        or (wm.role = 'crew' and guest_list_entries.added_by_user_id = auth.uid() and d.status = 'published')
      )
  )
);

commit;

-- Per-band levels (approved by Phil 2026-11-22)
--
-- Until now a person had ONE level (Viewer/Crew/Manager) for everything they
-- could reach in an owner's workspace. Now each band they have access to has
-- its own level, e.g. Crew on Texas King and Manager on Test Band.
--
-- 1. A level is stored on each band access record (and each tour-only access
--    record), for members and for invites. Filled from the person's current
--    level, so NOBODY's access changes today.
-- 2. A person can have whole-band access on one band and only-some-tours on
--    another. The access checks now look at both kinds of record for anyone
--    who isn't "all projects".
-- 3. Every rule that checks a level now uses the level for that band:
--    dates, schedules, attachments (records and files), guest lists, tours.
--    This also closes an old gap: a Manager of one band could previously
--    change another band's dates in the same workspace at the database level
--    (the app never offered it).
-- workspace_members.role stays as the person's highest level across their
-- bands; the app keeps it in step.

begin;

-- 1. Levels per band ---------------------------------------------------------

alter table public.workspace_member_projects add column if not exists role text;
alter table public.workspace_member_tours add column if not exists role text;
alter table public.workspace_invite_projects add column if not exists role text;
alter table public.workspace_invite_tours add column if not exists role text;

update public.workspace_member_projects g set role = wm.role
from public.workspace_members wm where wm.id = g.workspace_member_id and g.role is null;
update public.workspace_member_tours g set role = wm.role
from public.workspace_members wm where wm.id = g.workspace_member_id and g.role is null;
update public.workspace_invite_projects g set role = wi.role
from public.workspace_invites wi where wi.id = g.invite_id and g.role is null;
update public.workspace_invite_tours g set role = wi.role
from public.workspace_invites wi where wi.id = g.invite_id and g.role is null;

alter table public.workspace_member_projects drop constraint if exists workspace_member_projects_role_check;
alter table public.workspace_member_projects add constraint workspace_member_projects_role_check
  check (role is null or role in ('admin', 'editor', 'crew', 'viewer'));
alter table public.workspace_member_tours drop constraint if exists workspace_member_tours_role_check;
alter table public.workspace_member_tours add constraint workspace_member_tours_role_check
  check (role is null or role in ('admin', 'editor', 'crew', 'viewer'));
alter table public.workspace_invite_projects drop constraint if exists workspace_invite_projects_role_check;
alter table public.workspace_invite_projects add constraint workspace_invite_projects_role_check
  check (role is null or role in ('admin', 'editor', 'crew', 'viewer'));
alter table public.workspace_invite_tours drop constraint if exists workspace_invite_tours_role_check;
alter table public.workspace_invite_tours add constraint workspace_invite_tours_role_check
  check (role is null or role in ('admin', 'editor', 'crew', 'viewer'));

-- 2. Access checks: whole band OR only some tours, per band ------------------

create or replace function public.tourbook_has_project_access(target_workspace_id uuid, target_project_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and (
        coalesce(wm.scope_type, 'workspace') = 'workspace'
        or exists (select 1 from public.workspace_member_projects wmp
                   where wmp.workspace_member_id = wm.id and wmp.project_id = target_project_id)
        or exists (select 1 from public.workspace_member_tours wmt
                   where wmt.workspace_member_id = wm.id and wmt.project_id = target_project_id)
      )
  );
$$;

create or replace function public.tourbook_has_broad_project_access(target_workspace_id uuid, target_project_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and (
        coalesce(wm.scope_type, 'workspace') = 'workspace'
        or exists (select 1 from public.workspace_member_projects wmp
                   where wmp.workspace_member_id = wm.id and wmp.project_id = target_project_id)
      )
  );
$$;

create or replace function public.tourbook_has_tour_access(target_workspace_id uuid, target_project_id uuid, target_tour_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and (
        coalesce(wm.scope_type, 'workspace') = 'workspace'
        or exists (select 1 from public.workspace_member_projects wmp
                   where wmp.workspace_member_id = wm.id and wmp.project_id = target_project_id)
        or exists (select 1 from public.workspace_member_tours wmt
                   where wmt.workspace_member_id = wm.id and wmt.project_id = target_project_id
                     and wmt.tour_id = target_tour_id)
      )
  );
$$;

create or replace function public.tourbook_role_rank(role text)
returns integer language sql immutable as $$
  select case role when 'owner' then 5 when 'admin' then 4 when 'editor' then 3 when 'crew' then 2 when 'viewer' then 1 else 0 end;
$$;

-- The signed-in person's level for one band (null = no access).
create or replace function public.tourbook_project_role(target_workspace_id uuid, target_project_id uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select case
    when coalesce(wm.scope_type, 'workspace') = 'workspace' then wm.role
    else (
      select g.role from (
        select coalesce(wmp.role, wm.role) as role from public.workspace_member_projects wmp
          where wmp.workspace_member_id = wm.id and wmp.project_id = target_project_id
        union all
        select coalesce(wmt.role, wm.role) from public.workspace_member_tours wmt
          where wmt.workspace_member_id = wm.id and wmt.project_id = target_project_id
      ) g
      order by public.tourbook_role_rank(g.role) desc
      limit 1
    )
  end
  from public.workspace_members wm
  where wm.workspace_id = target_workspace_id and wm.user_id = auth.uid()
  limit 1;
$$;

-- Can the signed-in person see this date? (Viewers/Crew: published only.)
create or replace function public.tourbook_can_read_date(target_workspace_id uuid, target_project_id uuid, target_tour_id uuid, target_status text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select
    (
      (target_tour_id is null and public.tourbook_has_broad_project_access(target_workspace_id, target_project_id))
      or (target_tour_id is not null and public.tourbook_has_tour_access(target_workspace_id, target_project_id, target_tour_id))
    )
    and (
      public.tourbook_project_role(target_workspace_id, target_project_id) in ('owner', 'admin', 'editor')
      or (public.tourbook_project_role(target_workspace_id, target_project_id) in ('viewer', 'crew') and target_status = 'published')
    );
$$;

-- Can the signed-in person manage (create/change/delete) this date?
create or replace function public.tourbook_can_manage_date(target_workspace_id uuid, target_project_id uuid, target_tour_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select
    public.tourbook_project_role(target_workspace_id, target_project_id) in ('owner', 'admin', 'editor')
    and (
      (target_tour_id is null and public.tourbook_has_broad_project_access(target_workspace_id, target_project_id))
      or (target_tour_id is not null and public.tourbook_has_tour_access(target_workspace_id, target_project_id, target_tour_id))
    );
$$;

-- 3. Rules, now per band --------------------------------------------------------

-- dates
drop policy if exists dates_read on public.dates;
create policy dates_read on public.dates for select
  using (public.tourbook_can_read_date(workspace_id, project_id, tour_id, status));
drop policy if exists dates_editor_insert on public.dates;
create policy dates_editor_insert on public.dates for insert
  with check (public.tourbook_can_manage_date(workspace_id, project_id, tour_id));
drop policy if exists dates_editor_update on public.dates;
create policy dates_editor_update on public.dates for update
  using (public.tourbook_can_manage_date(workspace_id, project_id, tour_id))
  with check (public.tourbook_can_manage_date(workspace_id, project_id, tour_id));
drop policy if exists dates_admin_delete on public.dates;
create policy dates_admin_delete on public.dates for delete
  using (public.tourbook_can_manage_date(workspace_id, project_id, tour_id));

-- schedule items
drop policy if exists date_schedule_items_read on public.date_schedule_items;
create policy date_schedule_items_read on public.date_schedule_items for select
  using (exists (select 1 from public.dates d where d.id = date_schedule_items.date_id
                 and public.tourbook_can_read_date(d.workspace_id, d.project_id, d.tour_id, d.status)));
drop policy if exists date_schedule_items_editor_insert on public.date_schedule_items;
create policy date_schedule_items_editor_insert on public.date_schedule_items for insert
  with check (exists (select 1 from public.dates d where d.id = date_schedule_items.date_id
                      and public.tourbook_can_manage_date(d.workspace_id, d.project_id, d.tour_id)));
drop policy if exists date_schedule_items_editor_update on public.date_schedule_items;
create policy date_schedule_items_editor_update on public.date_schedule_items for update
  using (exists (select 1 from public.dates d where d.id = date_schedule_items.date_id
                 and public.tourbook_can_manage_date(d.workspace_id, d.project_id, d.tour_id)));
drop policy if exists date_schedule_items_editor_delete on public.date_schedule_items;
create policy date_schedule_items_editor_delete on public.date_schedule_items for delete
  using (exists (select 1 from public.dates d where d.id = date_schedule_items.date_id
                 and public.tourbook_can_manage_date(d.workspace_id, d.project_id, d.tour_id)));

-- attachment records
drop policy if exists date_attachments_read on public.date_attachments;
create policy date_attachments_read on public.date_attachments for select
  using (exists (select 1 from public.dates d where d.id = date_attachments.date_id
                 and public.tourbook_can_read_date(d.workspace_id, d.project_id, d.tour_id, d.status)));
drop policy if exists date_attachments_editor_insert on public.date_attachments;
create policy date_attachments_editor_insert on public.date_attachments for insert
  with check (exists (select 1 from public.dates d where d.id = date_attachments.date_id
                      and public.tourbook_can_manage_date(d.workspace_id, d.project_id, d.tour_id)));
drop policy if exists date_attachments_editor_update on public.date_attachments;
create policy date_attachments_editor_update on public.date_attachments for update
  using (exists (select 1 from public.dates d where d.id = date_attachments.date_id
                 and public.tourbook_can_manage_date(d.workspace_id, d.project_id, d.tour_id)))
  with check (exists (select 1 from public.dates d where d.id = date_attachments.date_id
                      and public.tourbook_can_manage_date(d.workspace_id, d.project_id, d.tour_id)));
drop policy if exists date_attachments_editor_delete on public.date_attachments;
create policy date_attachments_editor_delete on public.date_attachments for delete
  using (exists (select 1 from public.dates d where d.id = date_attachments.date_id
                 and public.tourbook_can_manage_date(d.workspace_id, d.project_id, d.tour_id)));

-- guest list
drop policy if exists guest_list_entries_read on public.guest_list_entries;
create policy guest_list_entries_read on public.guest_list_entries for select
  using (exists (select 1 from public.dates d where d.id = guest_list_entries.date_id
                 and public.tourbook_can_read_date(d.workspace_id, d.project_id, d.tour_id, d.status)
                 and public.tourbook_project_role(d.workspace_id, d.project_id) in ('owner', 'admin', 'editor', 'crew')));
drop policy if exists guest_list_entries_editor_insert on public.guest_list_entries;
create policy guest_list_entries_editor_insert on public.guest_list_entries for insert
  with check (exists (select 1 from public.dates d where d.id = guest_list_entries.date_id
                      and (
                        public.tourbook_can_manage_date(d.workspace_id, d.project_id, d.tour_id)
                        or (
                          public.tourbook_project_role(d.workspace_id, d.project_id) = 'crew'
                          and guest_list_entries.added_by_user_id = auth.uid()
                          and public.tourbook_can_read_date(d.workspace_id, d.project_id, d.tour_id, d.status)
                        )
                      )));
drop policy if exists guest_list_entries_editor_update on public.guest_list_entries;
create policy guest_list_entries_editor_update on public.guest_list_entries for update
  using (exists (select 1 from public.dates d where d.id = guest_list_entries.date_id
                 and (
                   public.tourbook_can_manage_date(d.workspace_id, d.project_id, d.tour_id)
                   or (
                     public.tourbook_project_role(d.workspace_id, d.project_id) = 'crew'
                     and guest_list_entries.added_by_user_id = auth.uid()
                     and public.tourbook_can_read_date(d.workspace_id, d.project_id, d.tour_id, d.status)
                   )
                 )))
  with check (exists (select 1 from public.dates d where d.id = guest_list_entries.date_id
                      and (
                        public.tourbook_can_manage_date(d.workspace_id, d.project_id, d.tour_id)
                        or (
                          public.tourbook_project_role(d.workspace_id, d.project_id) = 'crew'
                          and guest_list_entries.added_by_user_id = auth.uid()
                          and public.tourbook_can_read_date(d.workspace_id, d.project_id, d.tour_id, d.status)
                        )
                      )));
drop policy if exists guest_list_entries_editor_delete on public.guest_list_entries;
create policy guest_list_entries_editor_delete on public.guest_list_entries for delete
  using (exists (select 1 from public.dates d where d.id = guest_list_entries.date_id
                 and (
                   public.tourbook_can_manage_date(d.workspace_id, d.project_id, d.tour_id)
                   or (
                     public.tourbook_project_role(d.workspace_id, d.project_id) = 'crew'
                     and guest_list_entries.added_by_user_id = auth.uid()
                     and public.tourbook_can_read_date(d.workspace_id, d.project_id, d.tour_id, d.status)
                   )
                 )));

-- tours (create / rename / archive / delete): Managers of that band
drop policy if exists tours_editor_insert on public.tours;
create policy tours_editor_insert on public.tours for insert
  with check (public.tourbook_project_role(workspace_id, project_id) in ('owner', 'admin', 'editor'));
drop policy if exists tours_editor_update on public.tours;
create policy tours_editor_update on public.tours for update
  using (public.tourbook_project_role(workspace_id, project_id) in ('owner', 'admin', 'editor'))
  with check (public.tourbook_project_role(workspace_id, project_id) in ('owner', 'admin', 'editor'));
drop policy if exists tours_admin_delete on public.tours;
create policy tours_admin_delete on public.tours for delete
  using (public.tourbook_project_role(workspace_id, project_id) in ('owner', 'admin', 'editor'));

-- attachment files (path = <workspace>/<date>/...)
create or replace function public.tourbook_can_manage_attachment_path(object_name text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.dates d
    where (storage.foldername(object_name))[2] ~* '^[0-9a-f-]{36}$'
      and d.id = ((storage.foldername(object_name))[2])::uuid
      and d.workspace_id::text = (storage.foldername(object_name))[1]
      and public.tourbook_can_manage_date(d.workspace_id, d.project_id, d.tour_id)
  );
$$;

drop policy if exists "date_attachments_storage_insert" on storage.objects;
create policy "date_attachments_storage_insert" on storage.objects for insert
  with check (bucket_id = 'date-attachments' and public.tourbook_can_manage_attachment_path(name));
drop policy if exists "date_attachments_storage_delete" on storage.objects;
create policy "date_attachments_storage_delete" on storage.objects for delete
  using (bucket_id = 'date-attachments' and public.tourbook_can_manage_attachment_path(name));
drop policy if exists "date_attachments_storage_read" on storage.objects;
create policy "date_attachments_storage_read" on storage.objects for select
  using (
    bucket_id = 'date-attachments'
    and (
      public.tourbook_can_manage_attachment_path(name)
      or exists (select 1 from public.date_attachments a
                 where a.storage_path = objects.name or a.thumbnail_path = objects.name)
    )
  );

commit;

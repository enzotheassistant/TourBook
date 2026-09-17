-- dates_read and guest_list_entries_read treat a date with tour_id IS NULL
-- (not assigned to any tour) as visible to anyone with "project access" via
-- tourbook_has_project_access -- but that function returns true for a
-- tours-scoped member as soon as ANY of their granted tours belongs to the
-- project, even though they were only granted specific tours, not the
-- project's unassigned dates. The tour_id-IS-NOT-NULL branch already
-- correctly uses the stricter tourbook_has_tour_access.
--
-- projects_read intentionally keeps using tourbook_has_project_access as-is
-- (unchanged by this migration): the projects table only holds
-- id/workspace_id/name/slug/created_at, and a tour-scoped member
-- legitimately needs their project's name for the UI, so no tightening is
-- needed or wanted there.
--
-- No live impact: verified zero workspace_members rows had
-- scope_type = 'tours' at the time this was applied, so this changed
-- nothing about current behavior for any current member. Verified live
-- (via a temporary, rolled-back simulated tour-scoped member, since none
-- existed to test against) that a tours-scoped member now sees only their
-- granted tour's dates (0 unassigned dates visible, down from 17 in the
-- test project) while a real, existing projects-scoped viewer's visibility
-- was unchanged (still exactly their project's published dates, tour-
-- assigned and unassigned alike) and the workspace owner's visibility was
-- unchanged (still all dates in the project).
create or replace function public.tourbook_has_broad_project_access(target_workspace_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and (
        coalesce(wm.scope_type, 'workspace') = 'workspace'
        or (
          wm.scope_type = 'projects'
          and exists (
            select 1
            from public.workspace_member_projects wmp
            where wmp.workspace_member_id = wm.id
              and wmp.project_id = target_project_id
          )
        )
      )
  );
$$;

comment on function public.tourbook_has_broad_project_access(uuid, uuid) is
  'Like tourbook_has_project_access but deliberately excludes tours-scoped members. Used for dates/guest_list_entries rows with tour_id IS NULL, where a tours-scoped grant should not imply access to unassigned rows in the same project.';

revoke execute on function public.tourbook_has_broad_project_access(uuid, uuid) from public;
revoke execute on function public.tourbook_has_broad_project_access(uuid, uuid) from anon;
grant execute on function public.tourbook_has_broad_project_access(uuid, uuid) to authenticated;

drop policy if exists "dates_read" on public.dates;
create policy "dates_read"
on public.dates
for select
using (
  (
    (tour_id is null and public.tourbook_has_broad_project_access(workspace_id, project_id))
    or (tour_id is not null and public.tourbook_has_tour_access(workspace_id, project_id, tour_id))
  )
  and (
    (
      (select wm.role from public.workspace_members wm where wm.workspace_id = dates.workspace_id and wm.user_id = auth.uid() limit 1) = 'viewer'
      and status = 'published'
    )
    or (select wm.role from public.workspace_members wm where wm.workspace_id = dates.workspace_id and wm.user_id = auth.uid() limit 1) in ('owner', 'admin', 'editor')
  )
);

drop policy if exists "guest_list_entries_read" on public.guest_list_entries;
create policy "guest_list_entries_read"
on public.guest_list_entries
for select
using (
  exists (
    select 1 from public.dates d
    where d.id = guest_list_entries.date_id
      and (
        (d.tour_id is null and public.tourbook_has_broad_project_access(d.workspace_id, d.project_id))
        or (d.tour_id is not null and public.tourbook_has_tour_access(d.workspace_id, d.project_id, d.tour_id))
      )
      and (
        (
          (select wm.role from public.workspace_members wm where wm.workspace_id = d.workspace_id and wm.user_id = auth.uid() limit 1) = 'viewer'
          and d.status = 'published'
        )
        or (select wm.role from public.workspace_members wm where wm.workspace_id = d.workspace_id and wm.user_id = auth.uid() limit 1) in ('owner', 'admin', 'editor')
      )
  )
);

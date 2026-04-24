-- Phase 8 Batch 2A: tour-scoped permissions
-- Extends workspace/project scope model with tour-level grants.

begin;

alter table public.workspace_members
  drop constraint if exists workspace_members_scope_type_check;

alter table public.workspace_members
  add constraint workspace_members_scope_type_check
  check (scope_type in ('workspace', 'projects', 'tours'));

alter table public.workspace_invites
  drop constraint if exists workspace_invites_scope_type_check;

alter table public.workspace_invites
  add constraint workspace_invites_scope_type_check
  check (scope_type in ('workspace', 'projects', 'tours'));

create table if not exists public.workspace_member_tours (
  workspace_member_id uuid not null references public.workspace_members(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  tour_id uuid not null references public.tours(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (workspace_member_id, tour_id)
);

create index if not exists workspace_member_tours_workspace_member_idx
  on public.workspace_member_tours (workspace_member_id);

create index if not exists workspace_member_tours_workspace_project_tour_idx
  on public.workspace_member_tours (workspace_id, project_id, tour_id);

create table if not exists public.workspace_invite_tours (
  invite_id uuid not null references public.workspace_invites(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  tour_id uuid not null references public.tours(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (invite_id, tour_id)
);

create index if not exists workspace_invite_tours_invite_idx
  on public.workspace_invite_tours (invite_id);

create index if not exists workspace_invite_tours_workspace_project_tour_idx
  on public.workspace_invite_tours (workspace_id, project_id, tour_id);

-- Replace the old scope-aware dedupe index so tour-scoped invites can coexist
-- for the same email/role with different tour grant sets. Exact dedupe for tours
-- is handled in the app layer by comparing the normalized granted tour set.
drop index if exists workspace_invites_pending_dedupe_scope_idx;
create unique index if not exists workspace_invites_pending_dedupe_scope_idx
  on public.workspace_invites (workspace_id, lower(email), role, scope_type)
  where status = 'pending' and scope_type in ('workspace', 'projects');

create or replace function public.tourbook_has_project_access(target_workspace_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
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
        or (
          wm.scope_type = 'tours'
          and exists (
            select 1
            from public.workspace_member_tours wmt
            where wmt.workspace_member_id = wm.id
              and wmt.project_id = target_project_id
          )
        )
      )
  );
$$;

create or replace function public.tourbook_has_tour_access(target_workspace_id uuid, target_project_id uuid, target_tour_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
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
        or (
          wm.scope_type = 'tours'
          and exists (
            select 1
            from public.workspace_member_tours wmt
            where wmt.workspace_member_id = wm.id
              and wmt.project_id = target_project_id
              and wmt.tour_id = target_tour_id
          )
        )
      )
  );
$$;

alter table public.workspace_member_tours enable row level security;

create policy workspace_member_tours_self_read
on public.workspace_member_tours
for select
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.id = workspace_member_tours.workspace_member_id
      and wm.user_id = auth.uid()
  )
  or exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_member_tours.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  )
);

create policy workspace_member_tours_admin_write
on public.workspace_member_tours
for all
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_member_tours.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_member_tours.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  )
);

alter table public.workspace_invite_tours enable row level security;

create policy workspace_invite_tours_admin_read
on public.workspace_invite_tours
for select
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_invite_tours.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  )
);

create policy workspace_invite_tours_admin_write
on public.workspace_invite_tours
for all
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_invite_tours.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_invite_tours.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  )
);

drop policy if exists tours_read on public.tours;
create policy tours_read
on public.tours
for select
using (public.tourbook_has_tour_access(tours.workspace_id, tours.project_id, tours.id));

drop policy if exists dates_read on public.dates;
create policy dates_read
on public.dates
for select
using (
  (
    (dates.tour_id is null and public.tourbook_has_project_access(dates.workspace_id, dates.project_id))
    or (dates.tour_id is not null and public.tourbook_has_tour_access(dates.workspace_id, dates.project_id, dates.tour_id))
  )
  and (
    (
      (
        select wm.role from public.workspace_members wm
        where wm.workspace_id = dates.workspace_id
          and wm.user_id = auth.uid()
        limit 1
      ) = 'viewer'
      and status = 'published'
    )
    or (
      (
        select wm.role from public.workspace_members wm
        where wm.workspace_id = dates.workspace_id
          and wm.user_id = auth.uid()
        limit 1
      ) in ('owner', 'admin', 'editor')
    )
  )
);

drop policy if exists guest_list_entries_read on public.guest_list_entries;
create policy guest_list_entries_read
on public.guest_list_entries
for select
using (
  exists (
    select 1
    from public.dates d
    where d.id = guest_list_entries.date_id
      and (
        (d.tour_id is null and public.tourbook_has_project_access(d.workspace_id, d.project_id))
        or (d.tour_id is not null and public.tourbook_has_tour_access(d.workspace_id, d.project_id, d.tour_id))
      )
      and (
        (
          (
            select wm.role from public.workspace_members wm
            where wm.workspace_id = d.workspace_id
              and wm.user_id = auth.uid()
            limit 1
          ) = 'viewer'
          and d.status = 'published'
        )
        or (
          (
            select wm.role from public.workspace_members wm
            where wm.workspace_id = d.workspace_id
              and wm.user_id = auth.uid()
            limit 1
          ) in ('owner', 'admin', 'editor')
        )
      )
  )
);

drop policy if exists date_schedule_items_read on public.date_schedule_items;
create policy date_schedule_items_read
on public.date_schedule_items
for select
using (
  exists (
    select 1
    from public.dates d
    where d.id = date_schedule_items.date_id
      and (
        (d.tour_id is null and public.tourbook_has_project_access(d.workspace_id, d.project_id))
        or (d.tour_id is not null and public.tourbook_has_tour_access(d.workspace_id, d.project_id, d.tour_id))
      )
      and (
        (
          (
            select wm.role from public.workspace_members wm
            where wm.workspace_id = d.workspace_id
              and wm.user_id = auth.uid()
            limit 1
          ) = 'viewer'
          and d.status = 'published'
        )
        or (
          (
            select wm.role from public.workspace_members wm
            where wm.workspace_id = d.workspace_id
              and wm.user_id = auth.uid()
            limit 1
          ) in ('owner', 'admin', 'editor')
        )
      )
  )
);

commit;

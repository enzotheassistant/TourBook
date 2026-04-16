-- Phase 7 Batch 4: project-scoped membership + invite scope clarity
-- Adds workspace/project dual-scope access model with backwards-compatible defaults.

begin;

alter table public.workspace_members
  add column if not exists scope_type text not null default 'workspace',
  add constraint workspace_members_scope_type_check check (scope_type in ('workspace', 'projects'));

alter table public.workspace_invites
  add column if not exists scope_type text not null default 'workspace',
  add constraint workspace_invites_scope_type_check check (scope_type in ('workspace', 'projects'));

create table if not exists public.workspace_member_projects (
  workspace_member_id uuid not null references public.workspace_members(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (workspace_member_id, project_id)
);

create index if not exists workspace_member_projects_workspace_member_idx
  on public.workspace_member_projects (workspace_member_id);

create index if not exists workspace_member_projects_workspace_project_idx
  on public.workspace_member_projects (workspace_id, project_id);

create table if not exists public.workspace_invite_projects (
  invite_id uuid not null references public.workspace_invites(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (invite_id, project_id)
);

create index if not exists workspace_invite_projects_invite_idx
  on public.workspace_invite_projects (invite_id);

create index if not exists workspace_invite_projects_workspace_project_idx
  on public.workspace_invite_projects (workspace_id, project_id);

-- Replace pending dedupe with scope-aware dedupe.
drop index if exists workspace_invites_pending_dedupe_idx;
create unique index if not exists workspace_invites_pending_dedupe_scope_idx
  on public.workspace_invites (workspace_id, lower(email), role, scope_type)
  where status = 'pending';

-- Helper function to gate project access in RLS.
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
      )
  );
$$;

-- workspace_member_projects RLS
alter table public.workspace_member_projects enable row level security;

drop policy if exists workspace_member_projects_self_read on public.workspace_member_projects;
create policy workspace_member_projects_self_read
on public.workspace_member_projects
for select
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.id = workspace_member_projects.workspace_member_id
      and wm.user_id = auth.uid()
  )
  or exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_member_projects.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  )
);

drop policy if exists workspace_member_projects_admin_write on public.workspace_member_projects;
create policy workspace_member_projects_admin_write
on public.workspace_member_projects
for all
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_member_projects.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_member_projects.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  )
);

-- workspace_invite_projects RLS
alter table public.workspace_invite_projects enable row level security;

drop policy if exists workspace_invite_projects_admin_read on public.workspace_invite_projects;
create policy workspace_invite_projects_admin_read
on public.workspace_invite_projects
for select
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_invite_projects.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  )
);

drop policy if exists workspace_invite_projects_admin_write on public.workspace_invite_projects;
create policy workspace_invite_projects_admin_write
on public.workspace_invite_projects
for all
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_invite_projects.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_invite_projects.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  )
);

-- Harden existing table policies with project-scope checks.
drop policy if exists projects_read on public.projects;
create policy projects_read
on public.projects
for select
using (public.tourbook_has_project_access(projects.workspace_id, projects.id));

drop policy if exists tours_read on public.tours;
create policy tours_read
on public.tours
for select
using (public.tourbook_has_project_access(tours.workspace_id, tours.project_id));

drop policy if exists dates_read on public.dates;
create policy dates_read
on public.dates
for select
using (
  public.tourbook_has_project_access(dates.workspace_id, dates.project_id)
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
      and public.tourbook_has_project_access(d.workspace_id, d.project_id)
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
      and public.tourbook_has_project_access(d.workspace_id, d.project_id)
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

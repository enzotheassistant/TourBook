-- TourBook Phase 4: RLS Activation & Enforcement
-- Enables Row-Level Security on all tenant-owned tables
-- Enforces: workspace isolation, role-based access, draft visibility
-- Safe to run: existing deployment will require SUPABASE_SERVICE_ROLE_KEY for app layer migration period

begin;

-- ============================================================================
-- 1. ENABLE RLS ON ALL TENANT-OWNED TABLES
-- ============================================================================

alter table if exists public.workspace_members enable row level security;
alter table if exists public.workspaces enable row level security;
alter table if exists public.projects enable row level security;
alter table if exists public.tours enable row level security;
alter table if exists public.dates enable row level security;
alter table if exists public.guest_list_entries enable row level security;
alter table if exists public.date_schedule_items enable row level security;

-- ============================================================================
-- 2. WORKSPACE_MEMBERS POLICIES
-- Workspace membership is sensitive; only own membership + admin/owner visibility
-- ============================================================================

-- Allow users to see their own workspace membership
create policy "workspace_members_self_read"
on public.workspace_members
for select
using (auth.uid()::text = user_id);

-- Allow workspace owners/admins to see all members in their workspace
create policy "workspace_members_admin_read"
on public.workspace_members
for select
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_members.workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin')
  )
);

-- Admins/owners can update members (role changes, removals)
create policy "workspace_members_admin_write"
on public.workspace_members
for update
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_members.workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin')
  )
);

-- Only workspace owner can delete members
create policy "workspace_members_owner_delete"
on public.workspace_members
for delete
using (
  exists (
    select 1 from public.workspaces w
    where w.id = workspace_members.workspace_id
      and w.owner_user_id = auth.uid()::text
  )
);

-- ============================================================================
-- 3. WORKSPACES POLICIES
-- Users see workspaces where they're members
-- ============================================================================

create policy "workspaces_read"
on public.workspaces
for select
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = id
      and wm.user_id = auth.uid()::text
  )
);

-- Only workspace owner can update workspace details
create policy "workspaces_owner_update"
on public.workspaces
for update
using (owner_user_id = auth.uid()::text);

-- Only workspace owner can delete
create policy "workspaces_owner_delete"
on public.workspaces
for delete
using (owner_user_id = auth.uid()::text);

-- ============================================================================
-- 4. PROJECTS POLICIES
-- Users see projects in workspaces where they're members
-- ============================================================================

create policy "projects_read"
on public.projects
for select
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = projects.workspace_id
      and wm.user_id = auth.uid()::text
  )
);

-- Only editors/admins/owners can create projects
create policy "projects_editor_insert"
on public.projects
for insert
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin', 'editor')
  )
);

-- Only editors/admins/owners can update projects
create policy "projects_editor_update"
on public.projects
for update
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin', 'editor')
  )
);

-- Only admins/owners can delete projects
create policy "projects_admin_delete"
on public.projects
for delete
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin')
  )
);

-- ============================================================================
-- 5. TOURS POLICIES
-- Similar to projects: workspace membership + role-based writes
-- ============================================================================

create policy "tours_read"
on public.tours
for select
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = tours.workspace_id
      and wm.user_id = auth.uid()::text
  )
);

create policy "tours_editor_insert"
on public.tours
for insert
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin', 'editor')
  )
);

create policy "tours_editor_update"
on public.tours
for update
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin', 'editor')
  )
);

create policy "tours_admin_delete"
on public.tours
for delete
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin')
  )
);

-- ============================================================================
-- 6. DATES POLICIES
-- Workspace isolation + role-based draft visibility
-- Viewers: published only
-- Editors/Admins/Owners: all statuses (draft, published, archived, cancelled)
-- ============================================================================

-- All workspace members can read dates (with draft visibility filter by role)
create policy "dates_read"
on public.dates
for select
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = dates.workspace_id
      and wm.user_id = auth.uid()::text
  )
  and (
    -- Viewers can only see published dates
    (
      select wm.role from public.workspace_members wm
      where wm.workspace_id = dates.workspace_id
        and wm.user_id = auth.uid()::text
      limit 1
    ) = 'viewer'
    and status = 'published'
  )
  or (
    -- Editors/admins/owners see all statuses
    (
      select wm.role from public.workspace_members wm
      where wm.workspace_id = dates.workspace_id
        and wm.user_id = auth.uid()::text
      limit 1
    ) in ('owner', 'admin', 'editor')
  )
);

-- Only editors/admins/owners can create dates
create policy "dates_editor_insert"
on public.dates
for insert
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin', 'editor')
  )
);

-- Only editors/admins/owners can update dates
create policy "dates_editor_update"
on public.dates
for update
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin', 'editor')
  )
);

-- Only admins/owners can delete dates
create policy "dates_admin_delete"
on public.dates
for delete
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_id
      and wm.user_id = auth.uid()::text
      and wm.role in ('owner', 'admin')
  )
);

-- ============================================================================
-- 7. GUEST_LIST_ENTRIES POLICIES
-- Access scoped by workspace via related date_id
-- Editors/admins/owners can manage entries for any status date
-- Viewers can only see entries for published dates
-- ============================================================================

-- Workspace members can read guest list entries for dates they can see
create policy "guest_list_entries_read"
on public.guest_list_entries
for select
using (
  exists (
    select 1 
    from public.dates d
    where d.id = guest_list_entries.date_id
      and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = d.workspace_id
          and wm.user_id = auth.uid()::text
      )
      and (
        -- Viewers can only see entries for published dates
        (
          select wm.role from public.workspace_members wm
          where wm.workspace_id = d.workspace_id
            and wm.user_id = auth.uid()::text
          limit 1
        ) = 'viewer'
        and d.status = 'published'
      )
      or (
        -- Editors/admins/owners see all entries
        (
          select wm.role from public.workspace_members wm
          where wm.workspace_id = d.workspace_id
            and wm.user_id = auth.uid()::text
          limit 1
        ) in ('owner', 'admin', 'editor')
      )
  )
);

-- Only editors/admins/owners can add guest list entries
create policy "guest_list_entries_editor_insert"
on public.guest_list_entries
for insert
with check (
  exists (
    select 1 
    from public.dates d
    where d.id = date_id
      and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = d.workspace_id
          and wm.user_id = auth.uid()::text
          and wm.role in ('owner', 'admin', 'editor')
      )
  )
);

-- Only editors/admins/owners can update guest list entries
create policy "guest_list_entries_editor_update"
on public.guest_list_entries
for update
using (
  exists (
    select 1 
    from public.dates d
    where d.id = date_id
      and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = d.workspace_id
          and wm.user_id = auth.uid()::text
          and wm.role in ('owner', 'admin', 'editor')
      )
  )
);

-- Only editors/admins/owners can delete guest list entries
create policy "guest_list_entries_editor_delete"
on public.guest_list_entries
for delete
using (
  exists (
    select 1 
    from public.dates d
    where d.id = date_id
      and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = d.workspace_id
          and wm.user_id = auth.uid()::text
          and wm.role in ('owner', 'admin', 'editor')
      )
  )
);

-- ============================================================================
-- 8. DATE_SCHEDULE_ITEMS POLICIES
-- Access scoped by workspace via related date_id
-- Only editors/admins/owners can manage
-- ============================================================================

-- Workspace members can read schedule items for dates they can see
create policy "date_schedule_items_read"
on public.date_schedule_items
for select
using (
  exists (
    select 1 
    from public.dates d
    where d.id = date_schedule_items.date_id
      and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = d.workspace_id
          and wm.user_id = auth.uid()::text
      )
      and (
        -- Viewers can only see items for published dates
        (
          select wm.role from public.workspace_members wm
          where wm.workspace_id = d.workspace_id
            and wm.user_id = auth.uid()::text
          limit 1
        ) = 'viewer'
        and d.status = 'published'
      )
      or (
        -- Editors/admins/owners see all items
        (
          select wm.role from public.workspace_members wm
          where wm.workspace_id = d.workspace_id
            and wm.user_id = auth.uid()::text
          limit 1
        ) in ('owner', 'admin', 'editor')
      )
  )
);

-- Only editors/admins/owners can add schedule items
create policy "date_schedule_items_editor_insert"
on public.date_schedule_items
for insert
with check (
  exists (
    select 1 
    from public.dates d
    where d.id = date_id
      and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = d.workspace_id
          and wm.user_id = auth.uid()::text
          and wm.role in ('owner', 'admin', 'editor')
      )
  )
);

-- Only editors/admins/owners can update schedule items
create policy "date_schedule_items_editor_update"
on public.date_schedule_items
for update
using (
  exists (
    select 1 
    from public.dates d
    where d.id = date_id
      and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = d.workspace_id
          and wm.user_id = auth.uid()::text
          and wm.role in ('owner', 'admin', 'editor')
      )
  )
);

-- Only editors/admins/owners can delete schedule items
create policy "date_schedule_items_editor_delete"
on public.date_schedule_items
for delete
using (
  exists (
    select 1 
    from public.dates d
    where d.id = date_id
      and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = d.workspace_id
          and wm.user_id = auth.uid()::text
          and wm.role in ('owner', 'admin', 'editor')
      )
  )
);

commit;

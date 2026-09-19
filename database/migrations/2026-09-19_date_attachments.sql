-- Migration: Attachments feature
-- Adds a `date_attachments` table (files uploaded against a tour date, e.g.
-- stage plots, riders, parking maps) plus a private Supabase Storage bucket
-- and RLS to back it.
--
-- Mirrors the existing guest_list_entries / date_schedule_items pattern:
-- child rows scoped by workspace_id/project_id/date_id, RLS enforced via the
-- `dates` row a given attachment belongs to.

begin;

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. TABLE
-- ============================================================================

create table if not exists public.date_attachments (
  id            uuid        not null default gen_random_uuid() primary key,
  workspace_id  uuid        not null references public.workspaces(id) on delete cascade,
  project_id    uuid        not null references public.projects(id) on delete cascade,
  date_id       uuid        not null references public.dates(id) on delete cascade,
  storage_path  text        not null unique,
  file_name     text        not null,
  content_type  text        not null default 'application/octet-stream',
  file_size     bigint      not null default 0,
  uploaded_by   uuid        references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_date_attachments_date_created
  on public.date_attachments (date_id, created_at);

create index if not exists idx_date_attachments_workspace
  on public.date_attachments (workspace_id);

alter table public.date_attachments enable row level security;

-- ============================================================================
-- 2. TABLE RLS
-- Read: same visibility rules as guest_list_entries (project/tour scope +
-- viewers limited to published dates). Write: editors/admins/owners only.
-- ============================================================================

drop policy if exists "date_attachments_read" on public.date_attachments;
create policy "date_attachments_read"
on public.date_attachments
for select
using (
  exists (
    select 1
    from public.dates d
    where d.id = date_attachments.date_id
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

drop policy if exists "date_attachments_editor_insert" on public.date_attachments;
create policy "date_attachments_editor_insert"
on public.date_attachments
for insert
with check (
  exists (
    select 1
    from public.dates d
    where d.id = date_id
      and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = d.workspace_id
          and wm.user_id = auth.uid()
          and wm.role in ('owner', 'admin', 'editor')
      )
  )
);

drop policy if exists "date_attachments_editor_delete" on public.date_attachments;
create policy "date_attachments_editor_delete"
on public.date_attachments
for delete
using (
  exists (
    select 1
    from public.dates d
    where d.id = date_id
      and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = d.workspace_id
          and wm.user_id = auth.uid()
          and wm.role in ('owner', 'admin', 'editor')
      )
  )
);

-- ============================================================================
-- 3. STORAGE BUCKET
-- Private bucket. Object path convention: {workspace_id}/{date_id}/{uuid}-{filename}
-- so storage RLS can key off the leading path segment without a join back to
-- the app schema.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'date-attachments',
  'date-attachments',
  false,
  26214400, -- 25 MB
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ============================================================================
-- 4. STORAGE RLS
-- Workspace-membership floor: any member of the workspace named by the first
-- path segment can read; only editors/admins/owners can write/delete. Finer
-- project/tour scoping is enforced by the application layer (which checks
-- date_attachments + dates access) before it ever calls Storage.
-- ============================================================================

drop policy if exists "date_attachments_storage_read" on storage.objects;
create policy "date_attachments_storage_read"
on storage.objects
for select
using (
  bucket_id = 'date-attachments'
  and exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = (storage.foldername(name))[1]::uuid
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "date_attachments_storage_insert" on storage.objects;
create policy "date_attachments_storage_insert"
on storage.objects
for insert
with check (
  bucket_id = 'date-attachments'
  and exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = (storage.foldername(name))[1]::uuid
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'editor')
  )
);

drop policy if exists "date_attachments_storage_delete" on storage.objects;
create policy "date_attachments_storage_delete"
on storage.objects
for delete
using (
  bucket_id = 'date-attachments'
  and exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = (storage.foldername(name))[1]::uuid
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'editor')
  )
);

commit;

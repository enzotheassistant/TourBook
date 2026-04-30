-- Migration: Create date_schedule_items table
-- This table stores ordered schedule items (e.g. Load In, Soundcheck, Doors, Show)
-- for a given date record. It is a child of the `dates` table.
--
-- NOTE: This migration must be applied BEFORE any RLS or index migrations that
-- reference date_schedule_items (phase4_rls_activation, p0_hardening_indexes, etc.)

create table if not exists public.date_schedule_items (
  id           uuid        not null default gen_random_uuid() primary key,
  workspace_id uuid        not null references public.workspaces(id) on delete cascade,
  project_id   uuid        not null references public.projects(id) on delete cascade,
  date_id      uuid        not null references public.dates(id) on delete cascade,
  label        text        not null default '',
  time_text    text        not null default '',
  sort_order   integer     not null default 0,
  created_at   timestamptz not null default now()
);

-- Index for the hot path: look up all schedule items for a date, ordered
create index if not exists idx_date_schedule_items_date_sort_created
  on public.date_schedule_items (date_id, sort_order, created_at);

-- Workspace-scoped index for RLS policy evaluation
create index if not exists idx_date_schedule_items_workspace
  on public.date_schedule_items (workspace_id);

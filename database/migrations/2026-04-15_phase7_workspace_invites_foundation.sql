-- Phase 7 Batch 1: workspace invite foundation
-- Adds invite lifecycle table + RLS admin controls.

begin;

create extension if not exists pgcrypto;

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null,
  token_hash text not null,
  status text not null default 'pending',
  invited_by_user_id uuid not null,
  accepted_by_user_id uuid,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_invites_role_check check (role in ('admin', 'editor', 'viewer')),
  constraint workspace_invites_status_check check (status in ('pending', 'accepted', 'revoked', 'expired')),
  constraint workspace_invites_email_nonempty check (length(trim(email)) > 3)
);

create unique index if not exists workspace_invites_token_hash_key
  on public.workspace_invites (token_hash);

create index if not exists workspace_invites_workspace_id_idx
  on public.workspace_invites (workspace_id, status, created_at desc);

create index if not exists workspace_invites_workspace_email_idx
  on public.workspace_invites (workspace_id, lower(email));

create index if not exists workspace_invites_expires_at_idx
  on public.workspace_invites (expires_at);

create unique index if not exists workspace_invites_pending_dedupe_idx
  on public.workspace_invites (workspace_id, lower(email), role)
  where status = 'pending';

alter table if exists public.workspace_invites enable row level security;

-- Admin/owner can list invites for their workspace.
drop policy if exists workspace_invites_admin_read on public.workspace_invites;
create policy workspace_invites_admin_read
on public.workspace_invites
for select
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_invites.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  )
);

-- Admin/owner can create invites; invited_by must match authenticated user.
drop policy if exists workspace_invites_admin_insert on public.workspace_invites;
create policy workspace_invites_admin_insert
on public.workspace_invites
for insert
with check (
  invited_by_user_id = auth.uid()
  and exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_invites.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  )
);

-- Admin/owner can revoke/update invites.
drop policy if exists workspace_invites_admin_update on public.workspace_invites;
create policy workspace_invites_admin_update
on public.workspace_invites
for update
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_invites.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_invites.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  )
);

create or replace function public.tourbook_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_workspace_invites_updated_at on public.workspace_invites;
create trigger trg_workspace_invites_updated_at
before update on public.workspace_invites
for each row
execute function public.tourbook_set_updated_at();

commit;

-- Phase 8 Batch 1 follow-up
-- Enable self-serve first-workspace bootstrap under RLS (authenticated user client)

begin;

-- Allow authenticated users to create their own workspace rows.
drop policy if exists "workspaces_owner_insert" on public.workspaces;
create policy "workspaces_owner_insert"
on public.workspaces
for insert
with check (
  owner_user_id = auth.uid()
);

-- Allow workspace owners to create their own owner membership row for newly created workspace.
drop policy if exists "workspace_members_owner_bootstrap_insert" on public.workspace_members;
create policy "workspace_members_owner_bootstrap_insert"
on public.workspace_members
for insert
with check (
  user_id = auth.uid()
  and role = 'owner'
  and coalesce(scope_type, 'workspace') = 'workspace'
  and exists (
    select 1
    from public.workspaces w
    where w.id = workspace_members.workspace_id
      and w.owner_user_id = auth.uid()
  )
);

commit;

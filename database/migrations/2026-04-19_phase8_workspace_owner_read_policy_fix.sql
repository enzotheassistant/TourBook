-- Phase 8 onboarding follow-up
-- Allow workspace owners to read their own workspace rows directly.
-- This unblocks first-run bootstrap checks that occur before membership graph is fully established.

begin;

drop policy if exists "workspaces_read" on public.workspaces;

create policy "workspaces_read"
on public.workspaces
for select
using (
  owner_user_id = auth.uid()
  or exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspaces.id
      and wm.user_id = auth.uid()
  )
);

commit;

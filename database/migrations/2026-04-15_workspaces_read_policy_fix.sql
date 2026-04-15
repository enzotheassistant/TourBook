-- Fix incorrect workspaces_read RLS predicate introduced during hardening.
-- Bugged predicate compared wm.workspace_id = wm.id (always false for real data),
-- which hid all workspaces from authenticated members.

begin;

drop policy if exists workspaces_read on public.workspaces;

create policy workspaces_read on public.workspaces
  for select
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspaces.id
        and wm.user_id = auth.uid()
    )
  );

commit;

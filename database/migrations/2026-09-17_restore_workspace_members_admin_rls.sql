-- Restores real RLS enforcement on workspace_members.
--
-- History: 2026-04-15_phase4_rls_activation.sql created
-- workspace_members_admin_read/admin_write policies that queried
-- workspace_members from within a policy ON workspace_members, which
-- recurses under RLS. 2026-04-15_workspace_members_policy_recursion_fix.sql
-- fixed the outage by deleting both policies outright, leaving this table
-- with only self-read, owner-bootstrap-insert, and owner-delete ever since.
-- There has been no RLS path for an owner/admin to read the full member
-- roster or update a member's role/scope since that fix landed.
--
-- This is purely additive defense-in-depth: every admin operation on this
-- table today (list/update/remove members, in lib/data/server/members.ts)
-- runs through the service-role client, which bypasses RLS entirely, so
-- none of the app's current behavior for any existing invited/accepted
-- member changes. Verified live against production data (11-member and
-- 2-member real workspaces): owners/admins gained exactly the visibility
-- and management the app already grants them at the app layer; viewers and
-- editors gained nothing; cross-workspace isolation held; the owner row and
-- the 'owner' role stayed unassignable through this path.
--
-- Recursion-safe pattern: same technique already used by
-- tourbook_has_project_access/tourbook_has_tour_access. A SECURITY DEFINER
-- function owned by the table owner runs with RLS bypassed on its own
-- internal query, so it can safely check "does auth.uid() have an
-- owner/admin row in this workspace" without re-triggering workspace_members
-- policies on itself.
create or replace function public.tourbook_is_workspace_admin(target_workspace_id uuid)
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
      and wm.role in ('owner', 'admin')
  );
$$;

comment on function public.tourbook_is_workspace_admin(uuid) is
  'RLS helper: true if the current authenticated user is an owner or admin member of the given workspace. Security-definer to avoid recursive RLS evaluation on workspace_members.';

-- anon has no legitimate reason to call this (no anonymous access model in
-- this app); authenticated needs it for the policies below. Note: this
-- project's default privileges grant anon/authenticated EXECUTE on every
-- new public function at creation time in addition to the classic PUBLIC
-- grant, so anon must be revoked explicitly, not just PUBLIC.
revoke execute on function public.tourbook_is_workspace_admin(uuid) from public;
revoke execute on function public.tourbook_is_workspace_admin(uuid) from anon;
grant execute on function public.tourbook_is_workspace_admin(uuid) to authenticated;

-- Owners/admins can see every member row in their own workspace (in
-- addition to workspace_members_self_read, which every member keeps for
-- their own row).
drop policy if exists "workspace_members_admin_read" on public.workspace_members;
create policy "workspace_members_admin_read"
on public.workspace_members
for select
to authenticated
using (
  public.tourbook_is_workspace_admin(workspace_id)
);

-- Owners/admins can update a member's role/scope, matching
-- lib/data/server/members.ts's own rule that the owner row is never
-- editable and role can never be set to 'owner' from this path (ownership
-- transfer, if ever built, must be its own explicit flow).
drop policy if exists "workspace_members_admin_write" on public.workspace_members;
create policy "workspace_members_admin_write"
on public.workspace_members
for update
to authenticated
using (
  public.tourbook_is_workspace_admin(workspace_id)
  and role <> 'owner'
)
with check (
  public.tourbook_is_workspace_admin(workspace_id)
  and role <> 'owner'
);

-- Owners/admins can add a new member row directly (editor/viewer/admin
-- only -- owner assignment stays exclusive to workspace_members_owner_bootstrap_insert).
drop policy if exists "workspace_members_admin_insert" on public.workspace_members;
create policy "workspace_members_admin_insert"
on public.workspace_members
for insert
to authenticated
with check (
  public.tourbook_is_workspace_admin(workspace_id)
  and role <> 'owner'
);

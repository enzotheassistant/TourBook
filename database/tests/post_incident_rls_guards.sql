-- Post-incident RLS regression guards (focused)
-- Purpose: lock in two fixes with low-risk, deterministic checks
--
-- Guards:
-- 1) workspace_members select should not recurse/error under authenticated role
-- 2) workspaces_read must allow a real member to read their workspace row
--
-- Replace placeholders before running:
--   __MEMBER_ID__    -> UUID for an authenticated user who is a member of __WORKSPACE_ID__
--   __WORKSPACE_ID__ -> UUID of the workspace that __MEMBER_ID__ belongs to

begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '__MEMBER_ID__';

-- Guard 1: selecting from workspace_members must execute successfully (no recursion error)
do $$
declare
  _self_memberships integer;
begin
  select count(*)
    into _self_memberships
  from public.workspace_members
  where user_id = '__MEMBER_ID__';

  -- Deterministic sanity check: member fixture should expose at least one membership row.
  if _self_memberships < 1 then
    raise exception
      'GUARD FAIL [workspace_members_recursion]: expected >=1 self membership row for %, got %',
      '__MEMBER_ID__', _self_memberships;
  end if;

  raise notice 'GUARD PASS [workspace_members_recursion]: self membership rows=%', _self_memberships;
exception
  when others then
    raise exception
      'GUARD FAIL [workspace_members_recursion]: select failed (%: %)', SQLSTATE, SQLERRM;
end
$$;

-- Guard 2: member should be able to read their workspace row via workspaces_read policy
-- (critical predicate mapping: workspace_members.workspace_id -> workspaces.id)
do $$
declare
  _workspace_rows integer;
begin
  select count(*)
    into _workspace_rows
  from public.workspaces
  where id = '__WORKSPACE_ID__';

  if _workspace_rows != 1 then
    raise exception
      'GUARD FAIL [workspaces_read_member_visibility]: expected 1 visible workspace row for workspace %, got %',
      '__WORKSPACE_ID__', _workspace_rows;
  end if;

  raise notice 'GUARD PASS [workspaces_read_member_visibility]: visible workspace rows=%', _workspace_rows;
exception
  when others then
    raise exception
      'GUARD FAIL [workspaces_read_member_visibility]: select failed (%: %)', SQLSTATE, SQLERRM;
end
$$;

rollback;

-- Success criteria:
-- - Both DO blocks complete with GUARD PASS notices
-- - No exceptions are raised

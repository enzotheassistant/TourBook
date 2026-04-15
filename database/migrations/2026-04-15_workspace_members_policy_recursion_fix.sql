-- Fix: avoid recursive RLS evaluation on workspace_members
-- Symptom: "infinite recursion detected in policy for relation workspace_members"
-- Impact: /api/me/context fails, causing empty admin/crew views.

begin;

-- These policies queried workspace_members from within workspace_members policies,
-- which can recurse under RLS evaluation for authenticated role.
drop policy if exists workspace_members_admin_read on public.workspace_members;
drop policy if exists workspace_members_admin_write on public.workspace_members;

commit;

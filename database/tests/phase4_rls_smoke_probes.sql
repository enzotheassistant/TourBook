-- Phase 4 RLS smoke probes (staging)
-- Replace all __PLACEHOLDER__ values before running.
-- Run each role block independently in SQL editor.

-- Required placeholders:
-- __OWNER_ID__, __ADMIN_ID__, __EDITOR_ID__, __VIEWER_ID__, __NON_MEMBER_ID__
-- __WORKSPACE_ID__, __OTHER_WORKSPACE_ID__, __PROJECT_ID__
-- __PUBLISHED_DATE_ID__, __DRAFT_DATE_ID__

-- ============================================================
-- 1) Viewer: cannot see drafts, can see published
-- ============================================================
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '__VIEWER_ID__';

select 'viewer_published_dates' as test, count(*) as row_count
from public.dates
where workspace_id = '__WORKSPACE_ID__' and status = 'published';

select 'viewer_draft_dates' as test, count(*) as row_count
from public.dates
where workspace_id = '__WORKSPACE_ID__' and status = 'draft';

select 'viewer_guest_list_published_date' as test, count(*) as row_count
from public.guest_list_entries
where date_id = '__PUBLISHED_DATE_ID__';

select 'viewer_guest_list_draft_date' as test, count(*) as row_count
from public.guest_list_entries
where date_id = '__DRAFT_DATE_ID__';

select 'viewer_schedule_published_date' as test, count(*) as row_count
from public.date_schedule_items
where date_id = '__PUBLISHED_DATE_ID__';

select 'viewer_schedule_draft_date' as test, count(*) as row_count
from public.date_schedule_items
where date_id = '__DRAFT_DATE_ID__';
rollback;

-- Expected:
-- - viewer_draft_dates = 0
-- - viewer_guest_list_draft_date = 0
-- - viewer_schedule_draft_date = 0

-- ============================================================
-- 2) Editor/Admin/Owner: can see drafts
-- ============================================================
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '__EDITOR_ID__';

select 'editor_draft_dates' as test, count(*) as row_count
from public.dates
where workspace_id = '__WORKSPACE_ID__' and status = 'draft';

select 'editor_guest_list_draft_date' as test, count(*) as row_count
from public.guest_list_entries
where date_id = '__DRAFT_DATE_ID__';

select 'editor_schedule_draft_date' as test, count(*) as row_count
from public.date_schedule_items
where date_id = '__DRAFT_DATE_ID__';
rollback;

-- Expected: counts may be > 0 if fixtures exist; should not be forcibly zero by policy.

-- ============================================================
-- 3) Cross-workspace reads blocked
-- ============================================================
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '__EDITOR_ID__';

select 'editor_other_workspace_dates' as test, count(*) as row_count
from public.dates
where workspace_id = '__OTHER_WORKSPACE_ID__';

select 'editor_other_workspace_projects' as test, count(*) as row_count
from public.projects
where workspace_id = '__OTHER_WORKSPACE_ID__';
rollback;

-- Expected: both row_count = 0

-- ============================================================
-- 4) Cross-workspace writes blocked
-- ============================================================
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '__EDITOR_ID__';

-- Should fail with RLS violation or insert 0 (depending on client handling)
insert into public.dates (workspace_id, project_id, date, city, venue_name, status)
values ('__OTHER_WORKSPACE_ID__', '__PROJECT_ID__', current_date, 'Blocked City', 'Blocked Venue', 'published');

rollback;

-- ============================================================
-- 5) Workspace members visibility model
-- ============================================================
-- owner/admin can list members; editor/viewer are self-only

begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '__EDITOR_ID__';

select 'editor_other_members' as test, count(*) as row_count
from public.workspace_members
where workspace_id = '__WORKSPACE_ID__'
  and user_id != '__EDITOR_ID__';
rollback;

-- Expected: 0

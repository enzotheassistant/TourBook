-- TourBook Phase 4 RLS Policy Verification Tests
-- Run these queries in Supabase SQL Editor to verify RLS is working correctly
-- Each test should confirm that the policy allows/denies access as expected

-- ============================================================================
-- TEST SETUP: Create test users and workspace context
-- ============================================================================
-- Note: This assumes you'll manually set up test users via Auth UI or directly
-- Replace test-user-1-id, test-user-2-id, etc with actual UUIDs from auth.users

-- Reference UUIDs (replace with actual):
-- test_owner_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
-- test_editor_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
-- test_viewer_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
-- test_workspace_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
-- test_project_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
-- test_date_published_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
-- test_date_draft_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'

-- ============================================================================
-- WORKSPACE ISOLATION TESTS
-- ============================================================================

-- TEST 1: Owner can read their own workspace
select 'TEST 1: Owner reads own workspace' as test_name;
-- Expected: 1 row (workspace record)
-- set role authenticated;
-- set request.jwt.claim.sub to 'test_owner_id';
-- select * from workspaces where id = 'test_workspace_id';

-- TEST 2: Non-member cannot read workspace
select 'TEST 2: Non-member denied workspace read' as test_name;
-- Expected: 0 rows
-- set role authenticated;
-- set request.jwt.claim.sub = 'non_member_id';
-- select * from workspaces where id = 'test_workspace_id';

-- TEST 3: Editor cannot read non-member workspace
select 'TEST 3: Editor denied cross-workspace read' as test_name;
-- Expected: 0 rows
-- set role authenticated;
-- set request.jwt.claim.sub = 'test_editor_id';
-- select * from workspaces where id = 'other_workspace_id';

-- ============================================================================
-- ROLE-BASED ACCESS TESTS (DATES TABLE)
-- ============================================================================

-- TEST 4: Owner can read draft dates
select 'TEST 4: Owner can read draft dates' as test_name;
-- Expected: 1+ rows
-- set role authenticated;
-- set request.jwt.claim.sub = 'test_owner_id';
-- select * from dates where workspace_id = 'test_workspace_id' and status = 'draft';

-- TEST 5: Editor can read draft dates
select 'TEST 5: Editor can read draft dates' as test_name;
-- Expected: 1+ rows
-- set role authenticated;
-- set request.jwt.claim.sub = 'test_editor_id';
-- select * from dates where workspace_id = 'test_workspace_id' and status = 'draft';

-- TEST 6: Viewer cannot read draft dates
select 'TEST 6: Viewer denied draft date read' as test_name;
-- Expected: 0 rows
-- set role authenticated;
-- set request.jwt.claim.sub = 'test_viewer_id';
-- select * from dates where workspace_id = 'test_workspace_id' and status = 'draft';

-- TEST 7: Viewer can read published dates
select 'TEST 7: Viewer can read published dates' as test_name;
-- Expected: 1+ rows
-- set role authenticated;
-- set request.jwt.claim.sub = 'test_viewer_id';
-- select * from dates where workspace_id = 'test_workspace_id' and status = 'published';

-- ============================================================================
-- WRITE PERMISSION TESTS (DATES TABLE)
-- ============================================================================

-- TEST 8: Owner can create dates
select 'TEST 8: Owner can create dates' as test_name;
-- Expected: 1 row inserted
-- set role authenticated;
-- set request.jwt.claim.sub = 'test_owner_id';
-- insert into dates (workspace_id, project_id, date, city, venue_name)
-- values ('test_workspace_id', 'test_project_id', '2026-05-01', 'Test City', 'Test Venue');

-- TEST 9: Editor can create dates
select 'TEST 9: Editor can create dates' as test_name;
-- Expected: 1 row inserted
-- set role authenticated;
-- set request.jwt.claim.sub = 'test_editor_id';
-- insert into dates (workspace_id, project_id, date, city, venue_name)
-- values ('test_workspace_id', 'test_project_id', '2026-05-02', 'Test City', 'Test Venue');

-- TEST 10: Viewer cannot create dates
select 'TEST 10: Viewer denied date create' as test_name;
-- Expected: 0 rows inserted (permission denied error)
-- set role authenticated;
-- set request.jwt.claim.sub = 'test_viewer_id';
-- insert into dates (workspace_id, project_id, date, city, venue_name)
-- values ('test_workspace_id', 'test_project_id', '2026-05-03', 'Test City', 'Test Venue');

-- TEST 11: Non-member cannot create dates
select 'TEST 11: Non-member denied date create' as test_name;
-- Expected: 0 rows inserted (permission denied error)
-- set role authenticated;
-- set request.jwt.claim.sub = 'non_member_id';
-- insert into dates (workspace_id, project_id, date, city, venue_name)
-- values ('test_workspace_id', 'test_project_id', '2026-05-04', 'Test City', 'Test Venue');

-- ============================================================================
-- GUEST LIST ISOLATION TESTS
-- ============================================================================

-- TEST 12: Editor can see guest list for published date
select 'TEST 12: Editor sees guest list for published date' as test_name;
-- Expected: guest list entries
-- set role authenticated;
-- set request.jwt.claim.sub = 'test_editor_id';
-- select * from guest_list_entries where date_id = 'test_date_published_id';

-- TEST 13: Viewer can see guest list for published date
select 'TEST 13: Viewer sees guest list for published date' as test_name;
-- Expected: guest list entries
-- set role authenticated;
-- set request.jwt.claim.sub = 'test_viewer_id';
-- select * from guest_list_entries where date_id = 'test_date_published_id';

-- TEST 14: Viewer cannot see guest list for draft date
select 'TEST 14: Viewer denied guest list for draft date' as test_name;
-- Expected: 0 rows
-- set role authenticated;
-- set request.jwt.claim.sub = 'test_viewer_id';
-- select * from guest_list_entries where date_id = 'test_date_draft_id';

-- TEST 15: Viewer cannot add entries to any date
select 'TEST 15: Viewer denied guest list insert' as test_name;
-- Expected: permission denied error
-- set role authenticated;
-- set request.jwt.claim.sub = 'test_viewer_id';
-- insert into guest_list_entries (date_id, name)
-- values ('test_date_published_id', 'Test Guest');

-- ============================================================================
-- WORKSPACE MEMBER READ TESTS
-- ============================================================================

-- TEST 16: User can read own membership
select 'TEST 16: User reads own membership' as test_name;
-- Expected: 1 row (own membership)
-- set role authenticated;
-- set request.jwt.claim.sub = 'test_editor_id';
-- select * from workspace_members where user_id = 'test_editor_id';

-- TEST 17: Owner can read all members in workspace
select 'TEST 17: Owner reads all workspace members' as test_name;
-- Expected: 3+ rows (all members in workspace)
-- set role authenticated;
-- set request.jwt.claim.sub = 'test_owner_id';
-- select * from workspace_members where workspace_id = 'test_workspace_id';

-- TEST 18: Editor can read all members in workspace
select 'TEST 18: Editor reads all workspace members' as test_name;
-- Expected: 3+ rows (all members in workspace)
-- set role authenticated;
-- set request.jwt.claim.sub = 'test_editor_id';
-- select * from workspace_members where workspace_id = 'test_workspace_id';

-- TEST 19: Viewer can only read own membership
select 'TEST 19: Viewer restricted to own membership' as test_name;
-- Expected: 0 rows (can't see other members)
-- set role authenticated;
-- set request.jwt.claim.sub = 'test_viewer_id';
-- select * from workspace_members where workspace_id = 'test_workspace_id' and user_id != 'test_viewer_id';

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- Once RLS is enabled, use these patterns to test:
--
-- 1. In Supabase SQL Editor, paste each test block
-- 2. Uncomment the SQL lines (remove --)
-- 3. Execute and verify expected result count/error
--
-- For automated testing, use Postgres client with:
--   BEGIN;
--   SET ROLE authenticated;
--   SET request.jwt.claim.sub = 'user-uuid-here';
--   SELECT COUNT(*) FROM table_name WHERE condition;
--   ROLLBACK;

select 'All tests defined. Enable RLS and run with authenticated roles.' as note;

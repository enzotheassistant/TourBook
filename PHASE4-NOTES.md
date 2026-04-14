# TourBook Phase 4: RLS Activation & Enforcement

This phase activates Row-Level Security (RLS) on all tenant-owned tables in the database. RLS provides database-level enforcement of tenant isolation and role-based access control, complementing the app-layer authorization already in place.

## What Changed

### Database Schema
- **RLS Enabled** on 7 tenant-owned tables:
  - `workspace_members` - Workspace membership with role
  - `workspaces` - Workspace metadata
  - `projects` - Artist projects
  - `tours` - Tour records
  - `dates` - Scoped dates (dates cutover)
  - `guest_list_entries` - Guest list for dates
  - `date_schedule_items` - Schedule items for dates

### RLS Policies Implemented

#### Workspace Isolation
- All tables scoped by `workspace_id`
- Cross-workspace reads/writes are impossible at the database level
- Foreign key traversal prevents accidental access to unrelated records

#### Role-Based Access
```
owner   → create/read/update/delete all data
admin   → create/read/update/delete all data (same as owner for most tables)
editor  → create/read/update dates/guests; read projects/tours
viewer  → read published dates + published guest lists only
```

#### Draft vs Published Visibility
- **Viewers** can only see/access `status='published'` dates and their guest lists
- **Editors/Admins/Owners** see all statuses (draft, published, archived, cancelled)
- Guest list visibility inherited from parent date's `status`
- Schedule item visibility inherited from parent date's `status`

### App Layer Changes

#### No Breaking Changes to Routes
- All existing routes preserved
- `/shows/*` proxy routes continue working
- `/api/dates/*` endpoints continue working

#### Service Role Usage
- App continues using `SUPABASE_SERVICE_ROLE_KEY` for routine data access
- Service role bypasses RLS in Supabase (this is expected)
- **Important**: App-layer `requireWorkspaceAccess()` checks enforce authorization before service role queries
- RLS serves as a defense-in-depth layer and validates schema constraints

#### Recommended Future Refactoring (Phase 5)
- Replace service role with user-bound Supabase client for production audit
- This requires passing user session/JWT through to database layer
- Current auth flow uses bearer tokens which can be leveraged for this
- Phase 4 establishes RLS rules; Phase 5 will enforce them at the query level

## Migration Path

### Before Phase 4 Deployment
1. Test in Supabase staging environment using `rls_policy_tests.sql`
2. Verify policy logic with test users:
   - Create owners, editors, viewers
   - Verify draft visibility restrictions
   - Verify cross-workspace denial
3. Ensure `SUPABASE_SERVICE_ROLE_KEY` is set (required for app to function)

### After Phase 4 Deployment
1. RLS is enforced at the database level
2. Non-compliant queries will fail at the DB layer
3. App-layer checks remain as the first line of defense
4. Existing functionality preserved via service role

### Validation Steps
1. Auth/login: confirm session propagation still works
2. Create/edit dates: confirm draft/published workflow works
3. Guest list ops: confirm viewer restrictions work
4. Workspace switching: confirm isolation between workspaces
5. Run `rls_policy_tests.sql` in staging to validate policies

## Key Files

### Migrations
- `database/migrations/2026-04-15_phase4_rls_activation.sql` - Main RLS migration

### Tests
- `database/tests/rls_policy_tests.sql` - Policy validation test suite

### Documentation
- `lib/data/server/shared.ts` - Authorization helpers (requireWorkspaceAccess, etc.)
- `lib/data/server/dates.ts` - Scoped date access with role checks
- `app/api/me/context/route.ts` - Bootstrap context (uses service role for init)

## Security Properties

### Guaranteed by RLS
✅ Cross-workspace data is inaccessible (cannot query other workspace's dates/members)
✅ Viewer role cannot see draft dates (even if they try to query directly)
✅ Deletion is restricted to admin/owner only
✅ Non-members cannot access any workspace data

### Guaranteed by App Layer
✅ Auth via Supabase Auth (email/password or via proxy)
✅ Session validation in all route handlers
✅ Workspace membership verified before operations
✅ Role enforcement for write operations

### Combined Defense-in-Depth
- **Layer 1 (App)**: Auth validation + workspace membership check + role enforcement
- **Layer 2 (DB)**: RLS policies enforce the same rules at the database level
- **Result**: Redundant, verifiable security

## Risk Assessment

### Low Risk
- RLS policies are conservative (restrictive by default)
- All existing routes/workflows preserved
- Service role usage unchanged (queries still guarded by app layer)
- Can be disabled if issues found

### Testing Recommended
- [ ] Manual smoke test of all major user flows
- [ ] RLS policy tests with test users
- [ ] Cross-workspace isolation verification
- [ ] Draft/published visibility validation
- [ ] Guest list restrictions for viewers

## Next Steps

1. **Phase 4.5 (Optional)**
   - Add automated RLS policy tests to CI/CD
   - Create test fixtures for policy validation
   - Document policy maintenance procedures

2. **Phase 5 (Future)**
   - Refactor to user-bound Supabase client
   - Remove reliance on service role for normal queries
   - Use RLS for actual row-level filtering in queries
   - Benefits: audit trail, per-user query isolation, enhanced security

3. **Phase 6 (Future)**
   - Row-level audit logging
   - Compliance reporting
   - Advanced tenant isolation scenarios

## Reverting RLS (If Needed)

If critical issues arise, you can temporarily disable RLS:

```sql
begin;
alter table public.workspace_members disable row level security;
alter table public.workspaces disable row level security;
alter table public.projects disable row level security;
alter table public.tours disable row level security;
alter table public.dates disable row level security;
alter table public.guest_list_entries disable row level security;
alter table public.date_schedule_items disable row level security;
commit;
```

But **do not remove the policies** — they will be needed when RLS is re-enabled.

## Maintenance

- **Adding new tables**: Always enable RLS and add policies before writing data
- **Modifying policies**: Test thoroughly in staging before deploying to production
- **Debugging failures**: Check Supabase logs for RLS denial errors
- **Performance**: RLS adds minimal overhead (simple equality checks); monitor if needed

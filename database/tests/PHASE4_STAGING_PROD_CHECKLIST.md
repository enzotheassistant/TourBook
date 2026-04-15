# Phase 4 RLS Activation — Staging/Prod Executable Checklist

> Scope: `database/migrations/2026-04-15_phase4_rls_activation.sql`

## 0) Preconditions

- [ ] Backup/snapshot taken for staging DB
- [ ] Confirm migration baseline includes workspace/project/tour/date tables and `workspace_members.role`
- [ ] Confirm app env vars set:
  - [ ] `SUPABASE_URL`
  - [ ] `SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
  - [ ] `SUPABASE_SERVICE_ROLE_KEY` (still required by current server data layer)
- [ ] Confirm roles used in app/data are exactly: `owner`, `admin`, `editor`, `viewer`
- [ ] Confirm date statuses include at least `published` and `draft`

## 1) Migration readiness/risk review

- [ ] **One-shot migration**: this SQL uses `create policy` (not `if not exists`) and is **not idempotent**
- [ ] **Service-role dependency acknowledged**: current app paths still use service-role server client
- [ ] **Policy precedence fix included**: `guest_list_entries_read` and `date_schedule_items_read` use explicit grouped `AND (viewer OR editor/admin/owner)` logic
- [ ] **Workspace/member insert behavior accepted**: no user-role insert policies for `workspaces` / `workspace_members` in this migration

## 2) Apply in staging

### Option A — Supabase SQL editor

- [ ] Open SQL editor, paste full migration file:
  - `database/migrations/2026-04-15_phase4_rls_activation.sql`
- [ ] Run and verify success (no errors)

### Option B — psql (if available)

```sql
\i database/migrations/2026-04-15_phase4_rls_activation.sql
```

- [ ] Applied successfully

### Post-apply sanity SQL

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'workspace_members','workspaces','projects','tours','dates','guest_list_entries','date_schedule_items'
  )
order by tablename;
```

- [ ] All listed tables have `rowsecurity = true`

## 3) Local app verification

Run from repo root:

```bash
npm install
npm run lint
npx tsc --noEmit
npm run build
```

Expected for current branch:

- [ ] `npm run build` passes
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` currently has pre-existing React hook lint errors (non-RLS)

## 4) DB policy smoke tests (manual/executable)

- [ ] Run `database/tests/rls_policy_tests.sql` (updated for workspace member policy consistency)
- [ ] Run `database/tests/phase4_rls_smoke_probes.sql` with real UUID substitutions
- [ ] Run `database/tests/post_incident_rls_guards.sql` (post-incident guards added for recursion + workspace visibility regressions)
  - Practical execution: create a temporary copy, replace `__MEMBER_ID__` + `__WORKSPACE_ID__`, then run with `psql -v ON_ERROR_STOP=1 -f <file>` against target DB

Key pass criteria:

- [ ] Viewer cannot read draft dates
- [ ] Editor/Admin/Owner can read draft dates
- [ ] Cross-workspace reads are blocked
- [ ] Cross-workspace writes are blocked
- [ ] Guest list and schedule items follow date visibility (viewer sees only published-date records)

## 5) API smoke plan (staging)

Use a logged-in session cookie/token for each role and call:

- [ ] `GET /api/dates?workspaceId=<ws>&projectId=<project>&includeDrafts=true`
  - viewer: no drafts
  - editor/admin/owner: drafts visible
- [ ] `GET /api/dates/<dateId>?workspaceId=<ws>`
  - viewer + draft id: 404/denied
  - editor/admin/owner + draft id: success
- [ ] `GET /api/dates/<dateId>/guest-list?workspaceId=<ws>`
  - viewer + draft date: empty/denied
  - editor/admin/owner + draft date: success
- [ ] `GET /api/projects?workspaceId=<other-ws>` as non-member
  - denied/empty

### API smoke execution record (2026-04-15)

- Runtime execution from this workspace session: **BLOCKED** (no staging base URL/tokens present in runner env).
- Closest high-confidence verification completed:
  - Static route + data-layer trace confirms expected behavior for the 4 required GET endpoints.
  - Reproducible executable runner added: `scripts/phase4-api-smoke.mjs`.

Run command once staging tokens are available:

```bash
BASE_URL=... \
WORKSPACE_ID=... \
OTHER_WORKSPACE_ID=... \
PROJECT_ID=... \
DRAFT_DATE_ID=... \
VIEWER_TOKEN=... \
EDITOR_TOKEN=... \
ADMIN_TOKEN=... \
OWNER_TOKEN=... \
node scripts/phase4-api-smoke.mjs
```

Expected statuses:
- viewer: dates list `200` (no drafts), draft date `404`, draft guest-list `404`, cross-workspace projects `403`
- editor/admin/owner: dates list `200` (drafts visible), draft date `200`, draft guest-list `200`, cross-workspace projects `403`

## 6) Go/No-Go

- [ ] No failing RLS smoke probes
- [ ] No cross-workspace data exposure observed
- [ ] No unauthorized draft visibility observed
- [ ] Team accepts temporary service-role dependency in server data layer

**Decision:**

- [ ] GO (staging)
- [ ] NO-GO

Notes:

- Phase 4 currently enforces policy at DB + app checks, but app data layer still uses service-role for many normal paths. Full "true RLS-only" enforcement requires refactor to user-scoped Supabase clients in server data modules.

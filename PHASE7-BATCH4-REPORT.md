# Phase 7 — Batch 4 Report

## Summary
Implemented project-scoped permissions with backward-compatible workspace-wide defaults, plus invite UX/email scope clarity.

## Model changes
- Added migration: `database/migrations/2026-04-17_phase7_batch4_project_scoped_permissions.sql`
- New columns:
  - `workspace_members.scope_type` (`workspace|projects`, default `workspace`)
  - `workspace_invites.scope_type` (`workspace|projects`, default `workspace`)
- New tables:
  - `workspace_member_projects` (member→project grants)
  - `workspace_invite_projects` (invite intent for project scopes)
- Updated invite pending dedupe index to include scope type.

## Enforcement coverage
### App/data layer
- `requireWorkspaceAccess` now resolves membership scope + project grants; invalid/empty scope is denied.
- Added `canAccessProject` / `ensureProjectAccess` helpers.
- Updated scope enforcement in:
  - `lib/data/server/projects.ts`
  - `lib/data/server/tours.ts`
  - `lib/data/server/dates.ts`
  - `app/api/me/context/route.ts` (bootstrap filters projects/tours by authorized scope)
- Project-limited members cannot create new artists/projects.

### Invite flow
- Invite create now accepts:
  - `scopeType: workspace|projects`
  - `projectIds[]` (required+validated for project-limited invites)
- Scope is persisted on invite rows + invite project join table.
- Accept flow applies scope to membership and project grants; broadest scope wins (workspace invite can widen existing project-limited member).

### RLS
- Added `tourbook_has_project_access(workspace_id, project_id)` helper.
- Hardened read policies for:
  - `projects`
  - `tours`
  - `dates`
  - `guest_list_entries`
  - `date_schedule_items`
- Added RLS policies for new join tables (`workspace_member_projects`, `workspace_invite_projects`).

## UI updates (no redesign)
- Invite management section now supports:
  - role selection (existing)
  - scope type selection (workspace-wide vs project-limited)
  - project multi-select when project-limited (Artist labels)
- Invite list now shows scope type summary.

## Invite email clarity
- Email template now explicitly states invite scope:
  - workspace-wide: names workspace target
  - project-limited: names selected project(s) when available
- Reduced generic fallback usage (`your workspace`) when known names exist.

## Known limitations
- Existing roles are preserved during acceptance; invite acceptance primarily controls membership creation and scope grants (not role downgrade/upgrade behavior for existing members).
- Invite list currently shows project count for scope summary; detailed project names are resolved for email send path.

## Migration notes
- Safe/backward-compatible defaults (`scope_type='workspace'`).
- New tables are additive with FK constraints and indexes.
- Rollback order:
  1. Revert app code to pre-scope behavior.
  2. Drop scope-aware policies/functions.
  3. Drop new join tables.
  4. Drop `scope_type` columns and restore previous invite dedupe index.

## Validation
- Added targeted scope test: `lib/data/server/project-scope.test.mjs`.
- Validation commands requested:
  - `npm run test:unit`
  - `npx tsc --noEmit`
  - `npm run build`
  - `npm run lint`

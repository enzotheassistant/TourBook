# Phase 4 API Smoke Signoff (Subagent) — 2026-04-15

## Scope
Requested API endpoints:
- `GET /api/dates?workspaceId=<ws>&projectId=<project>&includeDrafts=true`
- `GET /api/dates/<dateId>?workspaceId=<ws>`
- `GET /api/dates/<dateId>/guest-list?workspaceId=<ws>`
- `GET /api/projects?workspaceId=<other-ws>`

Roles:
- viewer / editor / admin / owner

## 1) Auth/session mechanism (inspected)

- Primary API guard is `requireApiAuth(request)` in route handlers.
- Auth can be supplied in two realistic ways:
  1. Browser cookie session (set via `POST /api/auth/session` using access+refresh tokens).
  2. Direct `Authorization: Bearer <access_token>` header (supported fallback in `lib/auth.ts`).
- For API smoke automation, bearer tokens are sufficient and closer to programmatic checks.

## 2) Execution status in this environment

- Full live staging API execution: **NOT POSSIBLE from current runner** (no staging URL or role tokens available in env).
- Implemented closest high-confidence path:
  - End-to-end static code-path trace for all required GET endpoints.
  - Added executable staging runner: `scripts/phase4-api-smoke.mjs`.

## 3) Required endpoint outcomes (code-trace results)

### A. `GET /api/dates?...&includeDrafts=true`
- Enforced in `listDatesScoped()`:
  - viewer OR `includeDrafts` not true => forced `status='published'`
  - editor/admin/owner + includeDrafts true => drafts visible
- **Result**: expected behavior **PASS (code-trace confidence: high)**

### B. `GET /api/dates/<dateId>?workspaceId=<ws>`
- Enforced in `getDateScoped()` / `assertDateReadable()`:
  - viewer + non-published date => `404 Date not found`
  - editor/admin/owner => normal access
- **Result**: expected behavior **PASS (code-trace confidence: high)**

### C. `GET /api/dates/<dateId>/guest-list?workspaceId=<ws>`
- Enforced by `listGuestListEntriesScoped()` calling `getDateScoped()` first.
- Therefore viewer on draft parent date is denied (404 via date read guard).
- **Result**: expected behavior **PASS (code-trace confidence: high)**

### D. `GET /api/projects?workspaceId=<other-ws>`
- Enforced by `requireWorkspaceAccess()` in `listProjectsScoped()`.
- Non-member gets `403 You do not have access to this workspace.`
- **Result**: expected behavior **PASS (code-trace confidence: high)**

## 4) Critical caveat / blocker found (outside requested GET set)

`POST/PATCH/DELETE` guest-list paths do not role-gate to editor+ in app layer:
- `addGuestListEntriesScoped`, `updateGuestListEntryScoped`, `deleteGuestListEntryScoped`
- They call `requireWorkspaceAccess(userId, workspaceId)` **without allowedRoles**.
- With current service-role data client, a viewer can likely mutate guest list for published dates.

Impact:
- Not a cross-workspace leak, but a role-enforcement gap.
- Prevents claiming fully solid role enforcement at API layer in Phase 4.

## 5) Recommendation

- **Phase 4 complete & solid?** **NO (not fully solid)**
  - RLS migration + required GET read-path behavior look correct.
  - But write-role gap on guest list is a real blocker.

- **Remaining blockers for true multi-tenant enforcement**
  1. Fix guest-list write role checks to `['owner','admin','editor']` in app layer.
  2. Run live API smoke with real role tokens on staging (script provided).
  3. Phase 5 refactor to user-scoped Supabase clients (remove routine service-role dependency) for true RLS-at-query-time enforcement.

- **Go/No-Go for Phase 5**
  - **GO for Phase 5 work**, with a condition:
    - Patch guest-list write role checks first (or in first Phase 5 PR) before claiming security signoff.

## 6) Confidence

- Code-trace confidence on required GET behavior: **High**.
- Live staging confidence: **Medium** until the script is run with real role tokens.

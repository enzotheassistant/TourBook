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

## 4) Blocker status update — guest-list write role gate patched

`POST/PATCH/DELETE` guest-list mutation paths are now explicitly role-gated in app-layer auth:
- `addGuestListEntriesScoped`
- `updateGuestListEntryScoped`
- `deleteGuestListEntryScoped`

Enforcement now requires workspace role in:
- `owner`
- `admin`
- `editor`

Denied:
- `viewer`
- non-members

Implementation notes:
- Centralized reusable role constant + predicate in `lib/data/server/authorization.ts`.
- Mutation handlers call `requireWorkspaceAccess(..., ['owner','admin','editor'])` via helper.
- Read paths remain unchanged.

## 5) Verification and recommendation

- **Phase 4 complete & solid?** **YES for the previously identified app-layer blocker**
  - The guest-list write-role gap is now closed.
  - Required GET read-path behavior remains unchanged.

- **Still recommended before final production security signoff**
  1. Run live API smoke with real role tokens on staging (script provided).
  2. Proceed with Phase 5 refactor to user-scoped Supabase clients to reduce service-role reliance.

- **Go/No-Go for Phase 5**
  - **GO**.

## 6) Confidence

- Code-trace confidence on required GET behavior: **High**.
- Guest-list write-role enforcement confidence: **High** (code + authz tests).
- Live staging confidence: **Medium** until smoke script is run with real role tokens.

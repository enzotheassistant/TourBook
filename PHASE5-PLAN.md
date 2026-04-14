# Phase 5 Plan — Cleanup and Legacy Removal

Date: 2026-04-15
Scope: Conservative cleanup after Phase 4 signoff, with no user-facing workflow changes.

## Audit Inventory

### A) Legacy auth remnants

1. `lib/auth/roles.ts`
- Status: **SAFE TO REMOVE NOW**
- Reason: Not imported by app/API/server modules; no runtime references.

2. `lib/auth/session.ts`
- Status: **SAFE TO REMOVE NOW**
- Reason: Thin wrapper (`requireUser`) unused by current API/page flows.

3. `lib/auth.ts` admin aliases (`isAdminAuthenticated`, `requireAdminApiAuth`)
- Status: **KEEP TEMPORARILY**
- Reason: `requireAdminApiAuth` is currently used by AI intake endpoint(s). Alias is low-risk compatibility until API shape cleanup batch.

4. Bearer-token fallback in `getAuthStateFromRequest`
- Status: **DEPRECATE WITH FLAG**
- Reason: likely for non-cookie callers and transition clients. Keep for now; add explicit opt-out flag in future batch once callers are confirmed.

### B) Show-centric compatibility surface

1. `/api/shows/*` routes and `lib/adapters/date-show.ts`
- Status: **KEEP TEMPORARILY**
- Reason: actively used by current UI/data client (`lib/data-client.ts`, admin + dashboard + show page flows). Removing now would break existing routes/workflows.

2. `/api/guest-list/[id]` (legacy shape) + legacy guest-list adapter mapping
- Status: **KEEP TEMPORARILY**
- Reason: still used through `lib/data-client.ts` in active flows.

3. `app/api/ai-intake/route.ts` (legacy/parallel path vs `/api/dates/ai-intake`)
- Status: **DEPRECATE WITH FLAG**
- Reason: no in-repo caller found, but external callers cannot be excluded. Keep as compatibility endpoint pending telemetry/transition.

### C) Old show_id relationship scaffolding

1. `lib/server-store.ts`
- Status: **SAFE TO REMOVE NOW**
- Reason: dead legacy store path for `shows` + `show_id`; no imports, no runtime usage.

2. `lib/sample-data.ts`
- Status: **SAFE TO REMOVE NOW**
- Reason: only used by `lib/server-store.ts`; no active usage.

3. DB-level `show_id` columns/legacy schema artifacts
- Status: **KEEP TEMPORARILY**
- Reason: schema-destructive changes deferred to isolated migration batch with explicit rollback/testing plan.

## Executed in this batch

- Removed dead files:
  - `lib/auth/roles.ts`
  - `lib/auth/session.ts`
  - `lib/server-store.ts`
  - `lib/sample-data.ts`

## Next Phase 5 Batches (recommended order)

1. **Compatibility observability pass (low risk)**
   - Add lightweight logging/metrics counters for `/api/shows/*`, `/api/guest-list/[id]`, and `/api/ai-intake` usage.
   - Goal: prove whether legacy endpoints are still externally called.

2. **Flagged deprecation pass (low-medium risk)**
   - Gate bearer-token fallback and `/api/ai-intake` via env flags (default ON).
   - Run staging bake period before defaulting OFF.

3. **Route consolidation pass (medium risk)**
   - Move internal UI client to `/api/dates/*` native types where feasible.
   - Keep alias routes until stability window completes.

4. **Schema cleanup pass (medium-high risk)**
   - Remove remaining schema-level legacy `show_id` only with explicit migration/rollback and data validation.

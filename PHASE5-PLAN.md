# Phase 5 Plan — Cleanup and Legacy Removal

Date: 2026-04-15
Scope: Conservative cleanup after Phase 4 signoff, with no user-facing workflow changes.

## Audit Inventory

### A) Legacy auth remnants

1. `lib/auth/roles.ts`
- Status: **REMOVED (Batch 1)**
- Reason: Not imported by app/API/server modules; no runtime references.

2. `lib/auth/session.ts`
- Status: **REMOVED (Batch 1)**
- Reason: Thin wrapper (`requireUser`) unused by current API/page flows.

3. `lib/auth.ts` admin aliases (`isAdminAuthenticated`, `requireAdminApiAuth`)
- Status: **KEEP TEMPORARILY**
- Reason: `requireAdminApiAuth` is currently used by AI intake endpoint(s). Alias is low-risk compatibility until API shape cleanup batch.

4. Bearer-token fallback in `getAuthStateFromRequest`
- Status: **DEPRECATE WITH FLAG**
- Reason: likely for non-cookie callers and transition clients. Keep for now; add explicit opt-out flag in future batch once callers are confirmed.

### B) Show-centric compatibility surface

1. `/api/shows/*` routes and `lib/adapters/date-show.ts`
- Status: **KEEP TEMPORARILY (Batch 2 telemetry active)**
- Reason: actively used by current UI/data client (`lib/data-client.ts`, admin + dashboard + show page flows). Removing now would break existing routes/workflows.

2. `/api/guest-list/[id]` (legacy shape) + legacy guest-list adapter mapping
- Status: **KEEP TEMPORARILY (Batch 2 telemetry active)**
- Reason: still used through `lib/data-client.ts` in active flows.

3. `app/api/ai-intake/route.ts` (legacy/parallel path vs `/api/dates/ai-intake`)
- Status: **DEPRECATE WITH FLAG (Batch 2 telemetry active)**
- Reason: no in-repo caller found, but external callers cannot be excluded. Keep as compatibility endpoint pending telemetry/transition.

### C) Old show_id relationship scaffolding

1. `lib/server-store.ts`
- Status: **REMOVED (Batch 1)**
- Reason: dead legacy store path for `shows` + `show_id`; no imports, no runtime usage.

2. `lib/sample-data.ts`
- Status: **REMOVED (Batch 1)**
- Reason: only used by `lib/server-store.ts`; no active usage.

3. DB-level `show_id` columns/legacy schema artifacts
- Status: **KEEP TEMPORARILY**
- Reason: schema-destructive changes deferred to isolated migration batch with explicit rollback/testing plan.

## Executed in this phase

### Batch 1

- Removed dead files:
  - `lib/auth/roles.ts`
  - `lib/auth/session.ts`
  - `lib/server-store.ts`
  - `lib/sample-data.ts`

### Batch 2 — Compatibility observability pass (this change)

- Added lightweight legacy endpoint telemetry (NDJSON + console info) for:
  - `/api/shows`
  - `/api/shows/[id]`
  - `/api/shows/[id]/guest-list`
  - `/api/shows/[id]/guest-list/export`
  - `/api/guest-list/[id]`
  - `/api/ai-intake`
- Event shape (no payload logging):
  - `endpoint`
  - `method`
  - `timestamp` (ISO)
  - optional `workspaceId`
  - optional `projectId`
- Local file sink:
  - `var/telemetry/legacy-endpoints.ndjson`
  - override with `LEGACY_TELEMETRY_FILE=/path/to/file.ndjson`
- Inspection helper:
  - `npm run telemetry:legacy -- 100` (shows recent events + per-endpoint summary)

## Deprecation observation window and decision criteria

Recommended observation window: **14 full days** (minimum) in active usage environments.

Deprecation decision criteria for each compatibility endpoint:
1. **No usage for 14 consecutive days** in telemetry logs, and
2. No known internal callers remaining, and
3. Stakeholders confirm no external integrations depend on it.

Then execute:
- Step 1: mark endpoint as deprecated in docs + release notes
- Step 2: gate endpoint behind env flag (default ON) for **7-day** warning window
- Step 3: switch default OFF after warning window if still no usage
- Step 4: remove code in next cleanup batch

## Batch 3 — Env-flagged legacy endpoint deprecation gates

Added centralized legacy endpoint flags (`lib/config/legacy-flags.ts`) with default-safe behavior (enabled when env var is unset):
- `LEGACY_SHOWS_API_ENABLED` → gates all `/api/shows/*` compatibility routes
- `LEGACY_GUEST_LIST_API_ENABLED` → gates `/api/guest-list/[id]`
- `LEGACY_AI_INTAKE_API_ENABLED` → gates `/api/ai-intake`

When a flag is disabled, the endpoint returns HTTP `410` with a consistent JSON payload:
- `code: "LEGACY_ENDPOINT_DISABLED"`
- `message: "<endpoint> is deprecated and has been disabled."`

### Rollout steps (for each legacy surface)

a) Observe telemetry for **14 full days** under normal traffic.  
b) Disable flag in **staging** for **7 days** and monitor regressions.  
c) Disable flag in **production**.  
d) Remove compatibility code in next batch if no regressions.

## Next Phase 5 Batches (recommended order)

1. **Bearer fallback deprecation pass (low-medium risk)**
   - Gate bearer-token fallback in `getAuthStateFromRequest` via env flag (default ON).
   - Run staging bake period before defaulting OFF.

2. **Route consolidation pass (medium risk)**
   - Move internal UI client to `/api/dates/*` native types where feasible.
   - Keep alias routes until stability window completes.

3. **Schema cleanup pass (medium-high risk)**
   - Remove remaining schema-level legacy `show_id` only with explicit migration/rollback and data validation.

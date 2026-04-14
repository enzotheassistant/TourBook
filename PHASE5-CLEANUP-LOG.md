# Phase 5 Cleanup Log

Date: 2026-04-15

## Batch 1 (conservative)

### Removed in this pass

1. `lib/auth/roles.ts`
- Removed as unused legacy role helper module.
- Verified no imports before deletion.

2. `lib/auth/session.ts`
- Removed as unused wrapper around auth lookup.
- Verified no imports before deletion.

3. `lib/server-store.ts`
- Removed unused legacy in-memory + old `shows` table server store.
- Included old `show_id` guest-list logic not used by current scoped data layer.
- Verified no imports before deletion.

4. `lib/sample-data.ts`
- Removed unused sample dataset.
- Dependency of removed `lib/server-store.ts` only.

## Batch 2 (compatibility observability)

### Added

1. `lib/telemetry/legacy-endpoints.ts`
- New tiny reusable telemetry helper for legacy compatibility routes.
- Records one NDJSON event per request with:
  - `endpoint`
  - `method`
  - `timestamp` (ISO)
  - optional `workspaceId`
  - optional `projectId`
- Explicitly does **not** log request payload/body contents.
- Uses local file sink (`var/telemetry/legacy-endpoints.ndjson`) + `console.info` for easy ops visibility.
- Fail-open behavior: telemetry failures are swallowed so API behavior is unchanged.

2. Legacy route instrumentation
- `/api/shows` (GET/POST)
- `/api/shows/[id]` (GET/PUT/DELETE)
- `/api/shows/[id]/guest-list` (GET/POST)
- `/api/shows/[id]/guest-list/export` (GET)
- `/api/guest-list/[id]` (PATCH/DELETE)
- `/api/ai-intake` (POST)

3. Inspection helper
- `scripts/legacy-telemetry-tail.mjs`
- `package.json` script: `npm run telemetry:legacy -- 100`
- Prints recent events and per-endpoint/method summary for quick deprecation decisions.

## Preserved intentionally

- `/api/shows/*` and `/api/guest-list/[id]` compatibility routes
- `lib/adapters/date-show.ts` and legacy response-shape adapters
- `lib/auth.ts` compatibility helpers currently used by APIs
- All DB schema and migrations (no destructive schema operations)

## Observation window + removal criteria

- Observe telemetry for **14 consecutive days** in environments with normal user traffic.
- Candidate endpoint may move to flagged deprecation when:
  1) zero hits during observation window,
  2) no in-repo/internal callers, and
  3) no confirmed external dependents.
- After criteria met:
  - run **7-day** deprecation warning window with env-flag gate default ON,
  - then switch default OFF,
  - then remove in next cleanup batch if still unused.

## Batch 3 (env-flagged deprecation toggles)

### Added

1. `lib/config/legacy-flags.ts`
- Centralized source of truth for legacy compatibility flags and deprecation response shape.
- Default-safe parser: unset/empty env vars are treated as enabled (`true`).
- Flags:
  - `LEGACY_SHOWS_API_ENABLED`
  - `LEGACY_GUEST_LIST_API_ENABLED`
  - `LEGACY_AI_INTAKE_API_ENABLED`
- Disabled behavior: HTTP `410` JSON `{ code: "LEGACY_ENDPOINT_DISABLED", message: "..." }`.

2. Endpoint gating (no default behavior change)
- `/api/shows`
- `/api/shows/[id]`
- `/api/shows/[id]/guest-list`
- `/api/shows/[id]/guest-list/export`
- `/api/guest-list/[id]`
- `/api/ai-intake`

3. Docs and tests
- `.env.example` updated with new flags (default `true`).
- Added unit tests for legacy flag helper and endpoint gate response behavior.

### Rollout sequence

a) Observe telemetry for **14 days**.  
b) Disable flags in **staging** for **7 days** and monitor.  
c) Disable in **production**.  
d) Remove compatibility code in next batch if no regressions.

## Batch 4 (operator disable + delete readiness pack)

### Added

1. `PHASE5-LEGACY-DISABLE-RUNBOOK.md`
- Single-source runbook for staged legacy API disable execution.
- Includes prerequisites, telemetry review process, 14-day zero-hit threshold, exception handling, 7-day staging protocol, production protocol, rollback steps, and signoff ownership fields.

2. `PHASE5-LEGACY-REMOVAL-CHECKLIST.md`
- Post-disable checklist for physical route deletion readiness.
- Maps each legacy endpoint to canonical replacement path.
- Defines post-removal API/UI smoke checks and signoff template.

3. `scripts/legacy-telemetry-deprecation-check.mjs`
- Summarizes legacy telemetry over configurable window (`--days`).
- Reports endpoint + method counts and emits explicit `DEPRECATION_CHECK=PASS|FAIL`.
- Designed for conservative gate decisions before disabling flags.

4. `package.json`
- Added helper command:
  - `npm run telemetry:legacy:check -- --days 14`

### No behavior changes

- No live endpoint behavior changed in this batch.
- Changes are operational docs/tooling only.

## Verification notes

- No route/UI workflow changed by default (flags unset => enabled).
- Telemetry remains additive and fail-open for enabled routes.
- No sensitive payload capture introduced.
- Unit tests and production build were re-run after Batch 4 doc/script additions.

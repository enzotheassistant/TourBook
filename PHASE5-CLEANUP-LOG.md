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

## Verification notes

- No route/UI workflow changed.
- Telemetry is additive and fail-open.
- No sensitive payload capture introduced.
- Build/typecheck/lint validation executed; see command outputs in commit context (including any pre-existing failures).

# Stability & Readiness Runbook

Date: 2026-04-15

Scope: operational checks for post-incident safety guards, runtime API error telemetry, and legacy endpoint telemetry.

## Monitoring Files

- Post-incident DB guard SQL: `database/tests/post_incident_rls_guards.sql`
- Runtime API error telemetry (new): `var/telemetry/api-errors.ndjson` (override with `API_ERROR_TELEMETRY_FILE`)
- Legacy endpoint telemetry: `var/telemetry/legacy-endpoints.ndjson` (override with `LEGACY_TELEMETRY_FILE`)

## Daily Quick Checks (5–10 min)

1. **Post-incident guard execution readiness**
   - Confirm operator can run:
     - `database/tests/post_incident_rls_guards.sql`
   - Confirm test fixture IDs are available (one member user id + one workspace id for that member).

2. **Runtime API error telemetry pulse**
   - Check whether new high-risk endpoint failures are appearing:
     - `tail -n 100 var/telemetry/api-errors.ndjson`
   - Look for repeated 5xx on:
     - `/api/me/context`
     - `/api/dates`
     - `/api/dates/[id]`
     - `/api/dates/[id]/guest-list`

3. **Legacy endpoint traffic pulse**
   - Run:
     - `npm run telemetry:legacy -- 100`
   - If file is missing, confirm whether this is expected for the environment (no traffic yet) or a logging-path/config issue.

## Weekly Checks

1. **Run formal legacy deprecation gate**
   - `npm run telemetry:legacy:check -- --days 14`
   - PASS criteria:
     - `DEPRECATION_CHECK=PASS`
     - `TOTAL_HITS=0`

2. **Run post-incident guard SQL on target DB**
   - Must pass both guard checks with `GUARD PASS` notices and no exception.

3. **Trend runtime errors**
   - Count by endpoint/status from `api-errors.ndjson` and compare week-over-week.

## Alert Thresholds (Action Required)

- **Immediate (P1):**
  - Any sudden spike of `status >= 500` for `/api/me/context` (bootstrap integrity risk).
  - Any repeated `status >= 500` on `/api/dates*` affecting create/update/delete/list behavior.
- **Within same day (P2):**
  - More than 10 runtime error events/hour for a single monitored endpoint.
  - Any non-zero legacy endpoint hits after a disable decision has been made.
- **Within 1 business day (P3):**
  - Missing telemetry files in an environment expected to emit traffic.

## Current Status Snapshot (this workspace)

- Legacy telemetry file currently not present in this workspace (`var/telemetry/legacy-endpoints.ndjson` missing).
- This indicates either:
  - no local traffic has hit legacy endpoints yet, or
  - telemetry file path/env has not been set in this runtime.
- Runtime API error telemetry file will be created on first caught error in wired endpoints.

## Response Playbook (short)

1. Confirm whether failures are 4xx expected-denials vs 5xx regressions.
2. For 5xx clusters, capture endpoint + method + status + errorName/errorCode from telemetry.
3. Correlate with recent deploy/migration changes.
4. If user-impacting, rollback or hotfix based on existing release SOP.

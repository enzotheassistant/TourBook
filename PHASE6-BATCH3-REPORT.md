# Phase 6 — Batch 3 Report (Telemetry-Driven Activation Hardening)

Date: 2026-04-15

## 1) Activation telemetry analysis (initial funnel)

### Pipeline check
- Client event emitter: `lib/activation-telemetry.ts` (`trackActivationEvent`).
- API ingest endpoint: `app/api/telemetry/activation/route.ts`.
- Persistence sink: `lib/telemetry/activation.ts` to NDJSON file.
- Default storage path: `var/telemetry/activation.ndjson` (override via `ACTIVATION_TELEMETRY_FILE`).
- Fail-open behavior confirmed at client + API + file-write levels.

### Initial funnel report
- No telemetry file present in this environment yet.
- Result: **bootstrap baseline** (no statistically meaningful conversion metrics yet).

Output (from `node scripts/activation-funnel-report.mjs`):
- Bootstrap mode: telemetry file not found yet at `/data/.openclaw/workspace/TourBook/var/telemetry/activation.ndjson`.

### Added measurement utility
- New script: `scripts/activation-funnel-report.mjs`
- Computes:
  - empty state renders
  - CTA clicks
  - create success/failure
  - click-through + success/failure ratios
  - top state types + top CTAs

## 2) Integration-style coverage for first-run permutations

Added: `lib/activation/first-run.test.mjs`

Coverage includes owner/admin/editor/viewer permutations for:
- Crew no-artists state (CTA visibility and fallback behavior)
- Crew no-upcoming-dates state (create CTA visibility by role)
- Crew no-active-artist state (Admin recovery path available to all roles)
- Admin no-artists guardrail (creator roles can create; viewer receives restriction copy)

Also wired this test into unit suite:
- `package.json` `test:unit` script updated to include new file.

## 3) First-run micro-flow copy + guardrails improvements

New centralized policy module:
- `lib/activation/first-run.ts`

Applied changes (no route/auth rewrites, no visual redesign):
- Crew empty states now use explicit activation guidance:
  - clearer “why blocked” language
  - creator-role paths get actionable Admin CTA
  - viewer-role paths avoid misleading create CTA
- Crew no-upcoming state now explicitly ties action to “publish first date”.
- Admin no-artists flow now uses role-aware guardrail policy from shared module.

## 4) Docs updated

- Updated: `PHASE6-PLAN.md` (Batch 3 status + shipped scope).
- Added: `PHASE6-BATCH3-REPORT.md` (this report).

## 5) Validation

Executed:
1. `npm run test:unit` ✅ pass
2. `npx tsc --noEmit` ✅ pass
3. `npm run build` ✅ pass
4. `npm run lint` ⚠️ fails

Lint failures observed (pre-existing/unrelated to this batch):
- `components/address-autocomplete-field.tsx`
  - `react-hooks/set-state-in-effect` (2 errors)
- `components/admin-page-client.tsx`
  - `react-hooks/set-state-in-effect` (2 errors)
  - `react-hooks/exhaustive-deps` warnings
- `postcss.config.mjs`
  - `import/no-anonymous-default-export` warning

## 6) Next recommendations

1. **Collect minimum telemetry volume before optimization decisions**
   - target: at least 100 empty-state renders and 30+ CTA clicks.
2. **Add state-to-outcome correlation**
   - tie `stateType + role + cta` to `create_success/create_failure` windows.
3. **Add reason taxonomy for failures**
   - normalize `reason` into stable buckets for trend analysis.
4. **Resolve lint debt in separate maintenance PR**
   - isolate non-activation hook lint fixes to keep risk low.

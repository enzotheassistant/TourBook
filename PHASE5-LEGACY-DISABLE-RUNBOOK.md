# Phase 5 Legacy API Disable Runbook (Batch 4)

Date: 2026-04-15  
Owner: ____________________  
Environment: ____________________  
Change Window: ____________________

This document is the single execution source for safely disabling legacy compatibility endpoints, with rollback and signoff controls.

## Scope

Legacy routes covered by this runbook:
- `/api/shows`
- `/api/shows/[id]`
- `/api/shows/[id]/guest-list`
- `/api/shows/[id]/guest-list/export`
- `/api/guest-list/[id]`
- `/api/ai-intake`

Flags (default ON):
- `LEGACY_SHOWS_API_ENABLED`
- `LEGACY_GUEST_LIST_API_ENABLED`
- `LEGACY_AI_INTAKE_API_ENABLED`

## 1) Exact prerequisites (must all be true)

1. Batch 2 telemetry is active and writing NDJSON events (`var/telemetry/legacy-endpoints.ndjson` or `LEGACY_TELEMETRY_FILE`).
2. Batch 3 env flags are available in target environment.
3. Telemetry check shows **14-day zero hits** for all listed legacy endpoints.
4. No known in-repo callers remain (already true for direct legacy usage; verify no new regressions).
5. External integration owners notified and asked to confirm no dependency.
6. On-call owner + rollback owner assigned for disable window.
7. Change ticket created and linked in signoff section.

## 2) Telemetry review process (decision query)

### Quick read (recent activity)
```bash
npm run telemetry:legacy -- 200
```

### Formal gate check (14-day threshold)
```bash
npm run telemetry:legacy:check -- --days 14
```

Optional explicit file path:
```bash
npm run telemetry:legacy:check -- --days 14 --file var/telemetry/legacy-endpoints.ndjson
```

Expected output requirement:
- `DEPRECATION_CHECK=PASS`
- `TOTAL_HITS=0`
- Every tracked endpoint total is `0`

## 3) Deprecation threshold and exception handling

### Standard threshold
- **14 consecutive days** with zero telemetry hits for each legacy endpoint.

### Exceptions
If any endpoint has non-zero hits during the 14-day window:
1. Mark status as `FAIL` and stop disable rollout.
2. Export endpoint/method hit counts from script output.
3. Identify caller source (internal regression vs external client).
4. Open remediation task and extend observation window by another 14 days **after** fix/communication.
5. Re-run gate check before any disable step.

## 4) Staging disable protocol (7-day soak)

### Change
Set all legacy flags OFF in staging:
- `LEGACY_SHOWS_API_ENABLED=false`
- `LEGACY_GUEST_LIST_API_ENABLED=false`
- `LEGACY_AI_INTAKE_API_ENABLED=false`

Example env override (platform-agnostic):
```bash
LEGACY_SHOWS_API_ENABLED=false \
LEGACY_GUEST_LIST_API_ENABLED=false \
LEGACY_AI_INTAKE_API_ENABLED=false \
npm run start
```

### Verification during 7 days
1. Confirm disabled routes return `410` + `LEGACY_ENDPOINT_DISABLED`.
2. Run normal regression/smoke flows that rely on canonical routes (`/api/dates/*`).
3. Monitor app errors/support reports for breakage.
4. Review telemetry script daily to ensure no new unexpected legacy traffic patterns.

### Staging exit criteria (after day 7)
- No blocking regressions.
- No unresolved consumer complaints.
- Signoff recorded (see checklist).

## 5) Production disable protocol

1. Re-run gate check immediately before production change:
   ```bash
   npm run telemetry:legacy:check -- --days 14
   ```
2. Apply same three flags as `false` in production config.
3. Deploy/restart according to normal release SOP.
4. Post-change validation:
   - Spot-check each disabled route returns `410`.
   - Confirm canonical routes (`/api/dates/*`) remain healthy.
5. Monitor logs/incidents closely during first 24 hours.

## 6) Rollback (re-enable flags)

If any production regression appears tied to legacy route disablement:

1. Set one or more flags back to `true`:
   - `LEGACY_SHOWS_API_ENABLED=true`
   - `LEGACY_GUEST_LIST_API_ENABLED=true`
   - `LEGACY_AI_INTAKE_API_ENABLED=true`
2. Redeploy/restart.
3. Validate impacted workflow recovered.
4. Keep disable plan paused until root cause and stakeholder comms are complete.

## 7) Signoff checklist (ownership)

- [ ] Telemetry PASS for 14-day window (`DEPRECATION_CHECK=PASS`)  
  Owner: ____________________  Date: __________
- [ ] External dependency review complete  
  Owner: ____________________  Date: __________
- [ ] Staging 7-day disable completed with no blockers  
  Owner: ____________________  Date: __________
- [ ] Production disable executed  
  Owner: ____________________  Date: __________
- [ ] 24h production monitoring complete  
  Owner: ____________________  Date: __________
- [ ] Rollback plan verified and documented  
  Owner: ____________________  Date: __________
- [ ] Approved for physical code removal checklist handoff  
  Owner: ____________________  Date: __________

## 8) Handoff rule: disable -> delete

Code deletion is allowed only after:
1. Production flags remain OFF without incident for at least 7 days, and
2. No legacy telemetry hits observed during that OFF window, and
3. Removal checklist (`PHASE5-LEGACY-REMOVAL-CHECKLIST.md`) is fully signed.

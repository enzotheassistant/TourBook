# Phase 5 Legacy API Removal Checklist (Post-Disable)

Date: 2026-04-15  
Removal Owner: ____________________  
Reviewer: ____________________

Use this only after successful disable rollout per `PHASE5-LEGACY-DISABLE-RUNBOOK.md`.

## Preconditions (must be true)

- [ ] Production legacy flags have been OFF for at least 7 days.
- [ ] No legacy endpoint hits observed during that OFF window.
- [ ] No active incident linked to disabled legacy routes.
- [ ] Canonical replacement routes are validated in production.

## Canonical replacements

| Legacy route | Canonical route |
|---|---|
| `/api/shows` | `/api/dates` |
| `/api/shows/[id]` | `/api/dates/[id]` |
| `/api/shows/[id]/guest-list` | `/api/dates/[id]/guest-list` |
| `/api/shows/[id]/guest-list/export` | `/api/dates/[id]/guest-list/export` |
| `/api/guest-list/[id]` | `/api/dates/guest-list/[id]` |
| `/api/ai-intake` | `/api/dates/ai-intake` |

## Route-by-route physical deletion readiness

### A) Shows compatibility surface
Files:
- `app/api/shows/route.ts`
- `app/api/shows/[id]/route.ts`
- `app/api/shows/[id]/guest-list/route.ts`
- `app/api/shows/[id]/guest-list/export/route.ts`

Delete when:
- [ ] 7+ days in prod with `LEGACY_SHOWS_API_ENABLED=false`
- [ ] No telemetry hits for any `/api/shows*` endpoint in disable window
- [ ] No support tickets / partner dependency for `/api/shows*`

### B) Guest-list legacy compatibility route
File:
- `app/api/guest-list/[id]/route.ts`

Delete when:
- [ ] 7+ days in prod with `LEGACY_GUEST_LIST_API_ENABLED=false`
- [ ] No telemetry hits for `/api/guest-list/[id]` in disable window
- [ ] No support tickets / partner dependency for this route

### C) AI intake compatibility route
File:
- `app/api/ai-intake/route.ts`

Delete when:
- [ ] 7+ days in prod with `LEGACY_AI_INTAKE_API_ENABLED=false`
- [ ] No telemetry hits for `/api/ai-intake` in disable window
- [ ] No support tickets / partner dependency for this route

## Post-removal smoke tests

Run after route files are removed:

1. Canonical API smoke checks
- [ ] `GET /api/dates` returns success
- [ ] `GET /api/dates/[id]` returns success
- [ ] `GET/POST /api/dates/[id]/guest-list` works as expected
- [ ] `GET /api/dates/[id]/guest-list/export` works as expected
- [ ] `PATCH/DELETE /api/dates/guest-list/[id]` works as expected
- [ ] `POST /api/dates/ai-intake` works as expected

2. UI workflow spot checks
- [ ] Admin dates list/details still function
- [ ] Guest-list editing flow still function
- [ ] AI intake flow still function

3. Build/test checks
- [ ] `npm run test:unit`
- [ ] `npm run build`

## Signoff

- [ ] Removal PR approved by API owner  
  Name: ____________________ Date: __________
- [ ] QA/ops validation complete  
  Name: ____________________ Date: __________
- [ ] Cleanup log updated (`PHASE5-CLEANUP-LOG.md`)  
  Name: ____________________ Date: __________

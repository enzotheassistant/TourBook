# Phase 6 — Batch 2 Checklist (Activation Completion)

## Scope
- [x] Role-scope create CTAs in onboarding/empty states.
- [x] Keep UI label as **Artist** while backend naming remains **project**.
- [x] Preserve existing routes and avoid cosmetic redesign.

## Implementation
- [x] Add role helpers (`owner/admin/editor` can create; `viewer` cannot).
- [x] Update Crew empty states:
  - [x] Viewer sees guidance-only copy for no-artists/no-upcoming scenarios.
  - [x] Creator roles retain create-oriented CTA paths.
- [x] Update Admin empty states:
  - [x] Keep workspace/artist selection actions.
  - [x] Add first-artist creation flow for owner/admin/editor.
  - [x] Show non-actionable viewer guidance where creation is restricted.
- [x] Add activation telemetry (fail-open):
  - [x] `activation.empty_state_rendered`
  - [x] `activation.create_cta_clicked`
  - [x] `activation.create_success`
  - [x] `activation.create_failure`

## Monitoring
- [x] Activation telemetry written to `var/telemetry/activation.ndjson` (or `ACTIVATION_TELEMETRY_FILE`).
- [x] Event payload remains sanitized (no freeform user content).

## Validation
- [ ] npm run test:unit
- [ ] npx tsc --noEmit
- [ ] npm run build
- [ ] npm run lint (expect pre-existing unrelated lint failures)

## Remaining for Batch 3
- [ ] Add focused integration tests for first-run role/context permutations.
- [ ] Analyze activation funnel telemetry and tune copy/flow based on drop-off.
- [ ] Consider workspace creation path if/when API support is introduced.

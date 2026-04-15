# Phase 6 — Product Entry & Activation Plan

## Goal
Reduce first-run drop-off by removing dead-end states in Crew/Admin and guiding users to a valid activation path (workspace → artist → first date).

## Principles (for all batches)
- No visual redesign.
- Preserve existing routes/workflows.
- Avoid auth rewrites and broad schema changes.
- Keep each step reversible and low-risk.

---

## Batch 1 (Shippable now) — First-run dead-end removal
**Priority:** P0  
**Status:** Implemented in this branch

### Scope
1. Add robust empty-state UX in Crew and Admin with explicit next actions.
2. Improve context fallback so active artist never points to another workspace.
3. Provide lightweight activation controls in Admin empty state (workspace/artist pickers) using existing context state.

### Acceptance Criteria
- Crew no longer shows generic empty text when workspace/project context is missing.
- Crew empty states include clear CTA(s) to proceed.
- Admin no longer hard-stops with a generic “Select workspace and artist” message.
- Admin empty state allows workspace/artist selection when data exists.
- Context provider does not auto-select `data.projects[0]` from a different workspace.
- Existing routes (`/`, `/admin`, `/admin/dates`, `/admin/drafts`) remain unchanged.

### Risks
- Copy/CTA wording may not match final product language.
- If no API for creating workspace/artist exists yet, CTA can guide but not fully complete setup.

### Mitigations
- Keep copy and CTA logic centralized and easy to modify.
- Use only existing context + route flows.

---

## Batch 2 — Activation completion path
**Priority:** P1

### Proposed Scope
1. Add lightweight guided creation flow where feasible:
   - Create artist (project) CTA from Admin empty state to existing API/route.
   - Optional workspace creation CTA if API exists and permissions allow.
2. Persist onboarding hint state (dismissed/completed) to reduce repeat friction.
3. Add telemetry hooks for activation funnel stages.

### Acceptance Criteria
- New user can reach a first active artist/date flow with minimal guesswork.
- CTA actions are permissions-safe and fail with actionable messaging.
- No route churn or schema-breaking changes.

### Risks
- Missing or inconsistent create endpoints.
- Permission model mismatch (owner/admin/editor).

---

## Batch 3 — Hardening + measurement
**Priority:** P2

### Proposed Scope
1. Integration tests for first-run context permutations.
2. Analytics review: where users abandon activation.
3. Copy and micro-interaction polish based on evidence.

### Acceptance Criteria
- Test coverage for key first-run states.
- Documented conversion baseline and follow-up improvements.

---

## Open Decisions (Phil)
1. Should non-admin members see create CTA buttons, or only guidance text?
2. Preferred language for “artist” vs “project” across the product.
3. Should activation telemetry be added now or deferred until Batch 2?

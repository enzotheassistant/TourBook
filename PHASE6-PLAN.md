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
**Status:** Implemented in this branch

### Shipped Scope
1. Role-scoped activation CTAs in Crew/Admin empty states.
   - Viewer role no longer gets create CTAs.
   - Owner/admin/editor keep create-oriented paths.
2. Activation flow wiring (incremental, existing routes preserved).
   - Workspace/artist selection remains in Admin empty state.
   - Added first-artist creation path in Admin (`POST /api/projects`) for owner/admin/editor.
   - Kept create-first-date path to Admin with role-aware CTA visibility.
3. Activation telemetry hooks (fail-open, NDJSON).
   - Empty state rendered.
   - CTA clicked.
   - Create success/failure for artist/date flows.

### Acceptance Criteria
- New user can reach a first active artist/date flow with minimal guesswork.
- CTA actions are permissions-safe and fail with actionable messaging.
- No route churn or schema-breaking changes.

### Risks
- Workspace creation endpoint still unavailable in this phase.
- Permission model mismatch (owner/admin/editor) remains guarded by backend/RLS.

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

## Decision Log (Phil)
1. Create CTAs are role-scoped (no viewer create CTA).
2. UI copy remains “Artist” while internal/backend naming remains project.
3. Activation telemetry is included in Batch 2.

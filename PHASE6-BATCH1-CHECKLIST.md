# Phase 6 — Batch 1 Checklist (Product Entry & Activation)

## Plan / Scope
- [x] Define Batch 1 scope focused on first-run dead-end removal.
- [x] Keep changes reversible and route-compatible.
- [x] Avoid major auth or schema rewrites.

## Implementation
- [x] Add reusable empty-state component with CTA support.
- [x] Upgrade Crew empty states for:
  - [x] no workspace access/selection
  - [x] no active artist/project
  - [x] no upcoming dates
  - [x] no past dates
- [x] Upgrade Admin empty states for:
  - [x] no workspace access/selection
  - [x] no active artist/project
- [x] Add lightweight workspace/artist selectors in Admin empty state using existing context setters.
- [x] Fix first-run context fallback to prevent cross-workspace project auto-selection.

## Validation
- [x] npm run test:unit
- [x] npx tsc --noEmit
- [x] npm run build
- [x] npm run lint (fails on pre-existing `react-hooks/set-state-in-effect` and `postcss.config.mjs` warning paths outside Batch 1 scope)

## Release Hygiene
- [ ] Review diffs for reversibility and minimal risk.
- [ ] Commit with clear Batch 1 message.
- [ ] Document shipped scope and remaining Batch 2 items.

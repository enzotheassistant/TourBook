# PHASE 7 — Project-First Context UX Report

## What changed

### 1) Compact project selector (no label)
- Updated `components/app-shell.tsx` project switch control to use the **current project name as the trigger text**.
- Removed generic trigger copy (`"Project"`).
- Trigger now shows only the active project name (with compact chevron), no `Project:`/`Work On` style label.
- Selector remains hidden when switching is not applicable (single-project scope), keeping single-project users uncluttered.

### 2) Project-first context in operational views
- Crew shell/header now renders the **active project name as the primary title** (instead of generic app-first title treatment).
- Crew subtitle is suppressed in day-to-day view to reduce non-essential chrome and keep context project-centric.
- Added direct project switch trigger in the crew list header area (where relevant) for fast project context changes.

### 3) Workspace context relegation
- Preserved workspace-facing controls in admin surfaces.
- No additional workspace-prominent elements were introduced into operational crew surfaces.
- Existing admin/team/projects areas remain the right place for workspace-level context and management.

### 4) Behavior/security preserved
- No backend authorization logic changed.
- No auth/session model changes.
- Existing role/scope enforcement remains unchanged and source-of-truth.

## Validation run

- `npm run test:unit` ✅
- `npx tsc --noEmit` ✅
- `npm run build` ✅
- `npm run lint` ✅

## Rationale
- The UI now reflects user intent directly: users operate within a project most of the day.
- Keeping selector text equal to the current project removes label noise and improves scan speed.
- Workspace context remains available where governance/admin decisions are made, not where daily execution happens.

## Phase 8 follow-up recommendation
- Add lightweight breadcrumb/context chips in admin-only surfaces (e.g., `Workspace / Project`) while preserving crew minimalism.
- Optional UX telemetry: measure project-switch frequency and time-to-target-screen to confirm project-first improvements quantitatively.

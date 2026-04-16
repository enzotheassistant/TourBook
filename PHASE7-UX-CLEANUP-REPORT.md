# Phase 7 UX Cleanup Report

## Scope
Focused, low-risk UX cleanup based on feedback. No redesign, no permission-model rewrites.

## A) IA + Copy Cleanup
- Moved invite management into dedicated route: **`/admin/team`**.
  - Added `app/admin/team/page.tsx`.
  - Added **Team** tab in admin flow navigation.
  - Removed invite panel from New Date/Dates/Drafts main workflows.
- Updated invite copy to user-facing language.
  - Removed implementation-facing “best-effort…” wording.
  - New copy emphasizes email-first behavior with manual fallback.
- Updated top context indicator:
  - Removed `Project:` prefix.
  - Shows project name only.

## B) Project Management Actions
- Added practical admin-only project management UI in admin flows:
  - **Create artist/project**
  - **Rename selected artist/project**
- Added backend rename capability:
  - New endpoint: `PATCH /api/projects/[projectId]`
  - New server method: `renameProjectScoped(...)`
  - New client method: `renameArtist(...)`
- Safety / gating:
  - Create + rename are gated to **owner/admin** in server logic.
  - UI actions aligned to owner/admin for these project-management actions.
- Validation/sanity:
  - Name normalization (trim + collapse spaces)
  - Required name checks
  - Length limit (<=120 chars)
  - Workspace-level duplicate name protection (case-insensitive, normalized)
- Context behavior preserved:
  - Existing workspace/project selection flow remains unchanged.

## C) Invite UX Refinement (Email-first)
- Invite create flow now communicates email-first behavior as primary path.
- Manual link/token sharing remains available but secondary:
  - Hidden behind toggle button: **Show manual invite link** / **Hide manual invite link**.
- Existing invite telemetry and revoke flow retained.

## Validation
- `npm run test:unit` ✅
- `npx tsc --noEmit` ✅
- `npm run build` ✅
- `npm run lint` ✅

## Constraints / Notes
- No visual redesign performed.
- Auth and role model not broken; changes are additive/targeted.
- Invites now intentionally live in `/admin/team` to reduce New Date workflow noise.

## Before Phase 8
- Optional UX polish: surface subtle success/error badges for create/rename actions in team/admin section.
- Optional audit: add unit tests around project rename and duplicate-name checks.

# PHASE7 UX Correction Report

## What changed

### 1) Project Management moved to dedicated page
- Added a new admin route: `GET /admin/projects` (`app/admin/projects/page.tsx`).
- Extended `AdminPageClient` mode union with `projects` and added a **Projects** tab in admin navigation.
- Removed the project management panel from always rendering across admin pages.
  - It now renders only in **Projects** mode.
- Reworked project management UI into a project-focused list with actions:
  - Workspace artist list is shown directly in Projects page.
  - Added per-project options affordance (`⋯` menu) with:
    - **Rename artist** action.
    - **Invite teammate to this artist** CTA (links safely to Team page with project context query).
- Kept create-artist flow and rename API behavior unchanged (`createArtist`, `renameArtist`, existing server-side auth).

### 2) Team invite scope UX changed from dropdown to checklist model
- In `InviteManagementSection`, removed scope dropdown selector pattern.
- Added clear scope chooser with:
  - **Workspace-wide** option at top (radio).
  - **Project-limited** option (radio).
  - **Project checklist** below using per-project checkboxes.
- Behavior now matches request:
  - Switching to project-limited initializes with no selected projects.
  - User must explicitly check projects to grant.
  - Workspace-wide option is visually and semantically distinct.
- Backend contract unchanged:
  - Still submits `scopeType` and `projectIds` to existing invite API.
  - Existing server-side role/scope enforcement remains in place.

### 3) Context handoff for invite CTA
- Added safe context handoff via query param (`contextProjectId`) from Projects page CTA to Team page.
- Team mode pre-fills invite scope to project-limited with that project selected when param is valid for active workspace.

## Rationale
- Separates concerns: date workflows stay focused, while project lifecycle tasks are centralized in a dedicated Projects page.
- Reduces repeated UI noise and accidental context switching on non-project admin pages.
- Checklist scope grants make permissions explicit and safer than multi-select dropdown behavior.
- Keeps all security-sensitive logic server-side and unchanged.

## Deferred / notes
- Invite-from-project is implemented as a safe CTA into Team flow (with context prefill), not as direct invite creation from the project menu. This avoids duplicating invite logic/UI and preserves the existing invite audit path.

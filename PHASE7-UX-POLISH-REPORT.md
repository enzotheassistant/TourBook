# Phase 7 UX Polish Report

## Scope
Focused UX polish pass for admin project switching and login screen cleanup, without backend/auth architecture changes.

## What changed

### 1) Admin header project selector
- Updated `components/app-shell.tsx`.
- Added a compact `AdminProjectSelector` dropdown under the **TourBook** brand line in admin mode.
- Replaced the static current-project pill in admin header with this selector.
- Kept existing project context behavior by reusing:
  - `useAppContext()` active workspace/project state
  - `getProjectsForWorkspace(...)` scoped project filtering
  - `pickNextProjectId(...)` validation of selected target project
- Removed the separate project-switch icon button from admin action controls (switching now happens directly in header).
- No permission/scope broadening: only already-available workspace-scoped projects are selectable.

### 2) Login screen cleanup
- Updated `app/login/page.tsx`.
- Simplified auth mode controls from 3 pill buttons to a cleaner 2-option segmented control:
  - Sign in
  - Create account
- Moved **Forgot password?** to a small link under the password field in sign-in mode.
- Preserved reset flow with `forgot` mode and added a small “Back to sign in” link while in reset mode.
- Removed the “Use your email and password...” helper subtext.
- Kept existing signup + password reset functionality (including invite-token-aware redirects/flows).

## Architecture/Security impact
- No backend permission changes.
- No auth/session logic changes.
- No API contract changes.
- No broad redesign.

## Validation
Executed successfully:
- `npm run test:unit`
- `npx tsc --noEmit`
- `npm run build`
- `npm run lint`

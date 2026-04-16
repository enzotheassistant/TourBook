# PHASE7 Mobile Hotfix Report

## Scope
Urgent mobile-only polish pass for admin header, tab rail, and primary action row to remove overlap/clipping without changing routes or desktop behavior.

## Changes made

### 1) Top header controls cleanup (mobile)
- Updated `components/app-shell.tsx`:
  - Added `HeaderActionMenu` (mobile overflow menu) for non-crew-list header actions.
  - On mobile (`sm:hidden`), replaced inline `Crew/Admin` + `Logout` button cluster with compact overflow menu.
  - Kept desktop behavior unchanged (`hidden sm:flex` retains existing inline controls).
  - Ensured header left content can flex safely (`min-w-0 flex-1`) and right actions don’t squeeze/overlap (`shrink-0`).

Result: Admin header controls are compact on mobile and no longer crowd logo/title area.

### 2) Admin tab rail cleanup (mobile)
- Updated `components/admin-page-client.tsx`:
  - `adminTabClassName()` now uses chip-safe mobile classes:
    - `shrink-0`
    - `whitespace-nowrap`
    - removed clipping/ellipsis constraints that caused label truncation
    - maintained desktop sizing overrides

Result: `New Date`, `Existing Dates`, `Drafts`, `Team`, `Projects` render as readable horizontal-scroll chips without overlap/clipping.

### 3) Primary action row cleanup (mobile)
- Updated new-date action row in `components/admin-page-client.tsx`:
  - Mobile row now starts/scrolls cleanly (`justify-start` on mobile, desktop unchanged).
  - Added mobile min widths + `shrink-0` for `Import`, `Save Draft`, `Create Date` buttons.

Result: Action buttons keep tap-target size and avoid crowding/clipping on narrow viewports.

## Functional safety
- No route changes.
- No behavior changes to save/import/draft/publish flows.
- Desktop layout kept intact via `sm:` split behavior.

## Validation
- `npm run test:unit` ✅
- `npx tsc --noEmit` ✅
- `npm run build` ✅
- `npm run lint` ✅

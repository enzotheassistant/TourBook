# PHASE7 Crew Switcher Mobile Hotfix

## Scope Completed
Targeted hotfix applied only to the mobile crew project switcher in `components/app-shell.tsx` (`ProjectSwitchSheet`).

## What Changed
1. Reworked mobile switcher into a stable bottom-sheet modal pattern:
   - Full-screen fixed overlay container.
   - Anchored sheet at viewport bottom with safe-area padding.
   - Explicit mobile max-height (`max-h-[82svh]`) and desktop max-height preserved (`sm:max-h-[70vh]`).
2. Made project list reliably scrollable:
   - Sheet uses `flex flex-col` with `min-h-0`.
   - List region uses `flex-1 min-h-0 overflow-y-auto overscroll-contain`.
   - Removed brittle nested `calc(...)` height constraints.
3. Preserved outside-tap close behavior:
   - Backdrop remains clickable and closes sheet.
   - Escape key close retained.
4. Kept desktop switcher behavior unchanged:
   - Desktop positioning/size behavior remains under `sm:` breakpoints.
5. Added open-state body scroll lock to improve viewport stability while modal is open.

## Validation
- `npm run test:unit` ✅
- `npx tsc --noEmit` ✅
- `npm run build` ✅
- `npm run lint` ✅

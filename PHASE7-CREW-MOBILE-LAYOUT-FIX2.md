# PHASE7 Crew Mobile Layout Fix 2

## Summary
Applied a targeted mobile-only crew header stabilization in `components/app-shell.tsx` to remove top-area breakage (dead vertical space / malformed composition) while preserving desktop and admin behavior.

## What changed
- Reworked **crew mobile header** (`sm:hidden`) into a compact two-row structure:
  - Row 1: project switch trigger (left, stable anchor) + contextual controls (menu/back on crew list, account menu on other crew pages).
  - Row 2: current project/title link with `truncate` to prevent overlap and wrapping explosions.
- Kept **crew desktop header** behavior intact via a separate `sm:flex` block that preserves existing control layout.
- Kept **admin header** behavior/layout intact (including subtitle + admin project selector).
- Did not alter project switch sheet logic (open/close/scroll/select behavior remains in `ProjectSwitchSheet` / `ProjectSwitchControl`).

## Why this resolves the issue
- Eliminates unstable mixed mobile stacking that allowed oversized/wrapping top content to create large blank gaps.
- Prevents title/control overlap by separating concerns into predictable rows and enforcing truncation.
- Keeps project context first and consistently placed at the top-left on mobile crew.

## Validation
- `npm run test:unit` ✅
- `npx tsc --noEmit` ✅
- `npm run build` ✅
- `npm run lint` ✅

## Files touched
- `components/app-shell.tsx`
- `PHASE7-CREW-MOBILE-LAYOUT-FIX2.md`

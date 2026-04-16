# PHASE7 UI Stability Patch Report

## Scope A — Crew switcher/mobile behavior (Admin switcher untouched)
1. ✅ Fixed crew project switcher clipping on mobile by constraining trigger width (`max-w-[55vw]` on mobile) and preserving desktop width.
2. ✅ Made mobile switcher panel reliably scrollable with many projects (`max-h` sheet + `flex-1` scroll container).
3. ✅ Confirmed outside tap closes switcher without changing active project (existing overlay close behavior retained).
4. ✅ Desktop behavior preserved (mobile-specific class adjustments; desktop styles remain unchanged).

## Scope B — Project name corruption bug
5. ✅ Root cause identified in project name normalization regex typo: `/s+/g` instead of `/\s+/g` in `lib/data/server/projects.ts`.
   - Patched both normalization points (direct normalize + duplicate-check normalization).
   - Added regression unit test (`lib/data/server/projects.test.mjs`) that guards against reintroducing `/s+/g` and preserves the "Test" case.

## Scope C — Project list kebab menu behavior
6. ✅ Added outside-click close and `Esc` close for project row kebab menu in Project Management section.

## Scope D — Owner-only delete project
7. ✅ Added `Delete` menu option in project kebab menu.
8. ✅ Owner-only visibility in UI (`canDeleteArtist` derived from owner role) and owner-only server enforcement (`deleteProjectScoped` requires owner role).
9. ✅ Added confirmation step (`Delete artist? Are you sure...`) before deletion.
10. ✅ Added conservative backend guardrail: block delete when related `dates` or `tours` exist with clear 409 error message.

## Scope E — Mobile control polish
11. ✅ Improved mobile tab/chip/button behavior with conservative style updates:
   - Larger tap targets for admin tabs (`min-h-10`, text size alignment).
   - Prevent text overflow (`overflow-hidden`, `text-ellipsis`, mobile max-width constraints).
   - Enforced horizontal scroll row for mobile controls (admin tabs + crew filter row).
12. ✅ Desktop behavior kept stable (mobile-first constraints with `sm:` desktop parity).

## Validation
- ✅ `npm run test:unit`
- ✅ `npx tsc --noEmit`
- ✅ `npm run build`
- ✅ `npm run lint`

## Notes
- Added API support for artist deletion at `DELETE /api/projects/[projectId]` and client helper `deleteArtist`.
- No redesign changes introduced; patch is scoped and production-safe.

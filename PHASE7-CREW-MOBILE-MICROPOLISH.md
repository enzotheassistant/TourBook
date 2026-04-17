# PHASE7 Crew Mobile Micro-Polish

## Summary
Applied final mobile-only crew polish in `components/app-shell.tsx` to make the project switcher read as collapsed-by-default, fix mobile top safe-area clipping risk, and tighten top control spacing.

## Changes made

### 1) Switcher now reads as collapsed-by-default (mobile crew)
- Updated the mobile trigger style in `ProjectSwitchControl` to a compact chip:
  - Reduced height to `h-8`
  - Tighter horizontal padding
  - Slight filled background (`bg-white/[0.03]`) and rounded `xl` shape to visually separate trigger state from expanded list state
- Added explicit disclosure semantics:
  - `aria-expanded={open}`
  - `aria-haspopup="dialog"`
- Switched trigger behavior to toggle on tap (`setOpen((value) => !value)`), and added chevron rotation when open for clearer collapsed/expanded feedback.
- Desktop trigger styling remains unchanged via `sm:*` classes.

### 2) Mobile safe-area / top cut-off correction
- Added crew-only safe-area top inset padding on the sticky header:
  - `pt-[env(safe-area-inset-top)] sm:pt-0`
- Added safe-area-aware max panel height for the switch sheet:
  - `max-h-[calc(82svh-env(safe-area-inset-top))]`
- This prevents top clipping on iOS notch devices while preserving desktop/admin behavior.

### 3) Tightened top control spacing (mobile crew)
- Reduced mobile crew header vertical spacing:
  - Container top padding adjusted from `pt-4` to `pt-2` (desktop remains `sm:pt-4`)
  - Mobile block bottom padding `pb-4` → `pb-3`
  - Control row gap `gap-2` → `gap-1.5`
  - Title row margin `mt-3` → `mt-2`
- Scope is mobile crew only; desktop and admin layouts remain intact.

## Behavioral guarantees retained
- Outside-tap close remains via full-screen backdrop button in `ProjectSwitchSheet`.
- Esc close remains via keydown listener in `ProjectSwitchSheet`.
- Existing project switching flow and scope/security logic unchanged (`pickNextProjectId`, context project list scoping, setter behavior unchanged).

## Validation
- `npm run test:unit` ✅
- `npx tsc --noEmit` ✅
- `npm run build` ✅
- `npm run lint` ✅

## Files touched
- `components/app-shell.tsx`
- `PHASE7-CREW-MOBILE-MICROPOLISH.md`

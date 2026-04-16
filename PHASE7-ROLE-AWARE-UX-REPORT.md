# PHASE7 Role-Aware UX Report — Project Context Switching

## What changed

1. **Discreet switch access in top controls**
   - Added a compact **switch-project icon button (`⇄`)** in existing header action controls.
   - It only appears when the active workspace has **more than one accessible project**.
   - No extra control appears for single-project users.

2. **Current project indicator in header**
   - Added a subtle **`Project: <name>` pill** beneath the title area in `AppShell`.
   - Visible on crew and admin screens using the shared shell, reducing context confusion.

3. **Mobile-first switch interaction**
   - Added a lightweight **project switch sheet/modal**:
     - bottom-sheet style on mobile
     - compact popover-like card on larger screens
   - Includes:
     - tap backdrop to close
     - explicit close button
     - `Esc` close support
     - touch-friendly project list rows with clear current-state marker

4. **Role/scope awareness preserved**
   - Switch list is sourced from already-scoped context projects for the active workspace.
   - Project selection is constrained to allowed workspace project IDs in UI helper logic.
   - No backend or permission model changes.

5. **Targeted tests added**
   - New helper + unit tests for:
     - switch visibility for single vs multi-project contexts
     - guarded context selection behavior
   - Files:
     - `lib/ui/project-context.ts`
     - `lib/ui/project-context.test.mjs`

## Rationale

- Keeps switching available but **not visually dominant**, matching product direction.
- Adds constant, low-noise context awareness to reduce accidental cross-project edits.
- Mobile interaction stays compact and familiar without redesigning navigation.
- Uses existing scoped context data to avoid any auth/data behavior risk.

## Follow-up improvements (optional)

- Add project search in sheet if project counts grow large.
- Add analytics events for switch-open and switch-complete to measure discoverability.
- Consider replacing `⇄` with an icon asset for stronger visual consistency.

# UI Plan — Progress

Work branch: `ui-plan` (each item is its own commit). Phase 1 went live 2026-11-21 (pull request #5). Phase 2 went live 2026-11-21 (pull request #6). Phase 3 went live 2026-11-21 (pull request #9). Phase 4 approved by Phil and went live 2026-11-21 (pull request #10). All phases done; back-burner items below are not started. To resume in a new session: "Continue the UI plan in UI_PLAN.md" → pick up from the first unticked item below.

- [x] 1.1 Day sheet section order
- [x] 1.2 Tappable phone numbers
- [x] 1.3 Attachments (custom name, name without extension, file tiles)
- [x] 1.4 Header title becomes the project switcher
- [x] 1.5 Upcoming / Past switcher
- [x] 1.6 Crew "…" menu Logout styling
- [x] 2.1 Admin mobile navigation
- [x] 2.2 Pinned Save Draft / Create buttons
- [x] 2.3 Section visibility toggle switches
- [x] 2.4 Team page rows
- [x] 2.5 "project" instead of "artist"
- [x] 2.6 Compact schedule editor
- [x] 3.1 Address fields match other inputs
- [x] 3.2 Matching upload boxes
- [x] 3.3 One "…" menu icon
- [x] 3.4 Loading placeholders everywhere
- [x] 3.5 One accent colour
- [x] 3.6 One chevron for collapsible sections
- [x] 4.1 Geist font + tabular numbers
- [x] 4.2 Corner radius
- [x] 4.3 Flatten nested boxes

## Notes for Phil

**Phase 1 (done 2026-11-21, waiting for Phil's test on the preview before merging)**
- 1.1 Only show days were reordered. Travel and off days have a different layout (Route → Departure & arrival → Transport…) and were left as they were.
- 1.2 Only the DOS / contact phone fields are tappable. Numbers typed inside Notes are not linked (the app deliberately tells phones not to guess phone numbers in text, so times and dates don't get mistaken for numbers).
- 1.3 Database: added an optional `display_name` column to `date_attachments`, plus a rule that lets owners/admins/editors change only that column. Applied to the live Supabase project on 2026-11-21 (file: database/migrations/2026-11-21_date_attachments_display_name.sql). Rename = pencil on each file tile in the admin edit form; new dates get an optional name box under each staged file. Empty name = the file name without its extension.
- 1.3 PDF previews only exist for PDFs uploaded from now on. Older PDFs show the file-icon tile until re-uploaded. Word/Excel/other docs always show the file-icon tile.
- 1.4 The header picker is shared code (components/picker-menu.tsx) reused by 1.5. On phones the header is now one row.
- 1.5 The "←" back arrow on Past dates was removed (agreed with Phil; the picker replaces it).
- 1.6 The admin "…" menu on phones uses the same Logout row, so it changed too.
- Checks: GitHub CI (lint, typecheck, unit tests, build) passed on every Phase 1 commit. The app couldn't be run in Claude's workspace, so the screen-by-screen check is Phil's test on the preview link.
- Phase 1 merged and live on 2026-11-21.

**Phase 2 (live 2026-11-21)**
- 2.1 Phil chose to also switch the admin header's project dropdown to the Phase 1 picker (plain text when there's only one project).
- 2.2 Pinned bar also covers editing: Update (published date) and Delete / Save / Publish (draft), per Phil.
- 2.3 The switch shows even when a section is folded shut; the "Visible / Hidden" words were removed (Phil OK'd). Hidden sections dim to 70%.
- 2.4 Email kept as small grey text under the name (Phil's choice). Invites keep email + expiry as a plain date. "Pending" badges kept.
- 2.5 UI text and error messages only. Database, code names and analytics labels still say "artist". 4 unit tests updated to the new wording; all 108 pass.
- Fixes after Phil's phone test (both live 2026-11-21):
  - Pull request #7: crew project title and "Upcoming dates" had become small/regular weight (cause: globals.css has an unlayered `button { font: inherit }` that overrides Tailwind text classes on buttons) and the title was cut off ("Texas ..."). Now: big bold heading, just the name + a small arrow (no box), one line, only cut short with "…" if it truly runs out of room.
  - Pull request #8: the Save / Create / Update bar was `sticky` but AppShell's `overflow-x-hidden` wrapper stopped it pinning; it's now `position: fixed` to the bottom of the screen while the form is open.
- 2.6 Before/after approved by Phil before saving. Undo lasts 5 seconds and only the most recent deleted line can be undone. Time field is 10rem wide on phones, 13rem on desktop; fields stack under 360px wide.

**Phase 3 (live 2026-11-21)**
- 3.1 One shared field style (lib/ui/field-styles.ts) used by the address fields and the rest of the admin form.
- 3.2 Shared upload box (components/upload-dropzone.tsx). Phil chose the grey outlined "Choose files" button for both, keeping blue for each screen's main action.
- 3.3 One drawn "…" icon (components/icons.tsx, MoreIcon) on all seven menu buttons.
- 3.4 Shared placeholders (components/skeleton.tsx): app frame while sign-in is checked (was the dark flash), page fallbacks, day sheet, admin date lists, Team members/invites, edit-form attachments, opening a date into the editor. The day sheet keeps its existing 200ms delay before placeholders appear so cached loads don't strobe. The file viewer keeps its small "Loading…".
- 3.5 Accent defined once in app/globals.css (`--color-accent`, with -hover, -soft, -light worked out from it). To change the accent later: edit that one line, plus the glow colour in app/icon.tsx and app/apple-icon.tsx (app icons can't read CSS variables). Green removed (background glow, text selection, app icon glow now blue; Phil OK'd changing the icon). Error messages kept red, using the same red as Delete (Phil OK'd); "Revoked" badge now grey. Amber is still used for warnings (offline, import warnings) and the Owner badge.
- 3.6 One chevron (components/icons.tsx, ChevronIcon) on the admin form's fold-open sections. Dropdown arrows (like "All tours") are separate and unchanged.
- For Phase 4: globals.css's unlayered `button, input, select, textarea { font: inherit }` makes Tailwind text-size classes on buttons and fields do nothing (they all inherit 16px). Fields must stay at 16px on iPhone to avoid zoom-on-tap, but buttons could be fixed as part of the visual polish (with a preview first).

**Phase 4 (approved by Phil after testing the preview; live 2026-11-21)**
- Phil approved the picture mockup and chose B: 10px corners for buttons, fields and tabs; 12px for cards/boxes; pills only for tags; round icon buttons stay circles.
- 4.1 Geist via next/font/google (app/layout.tsx), wired as Tailwind --font-sans in globals.css; tabular numbers on schedule times, date badges, list dates, day sheet date.
- 4.2 Corners as above.
- Extra (from the plan's Phase 4 note): `button` removed from globals.css's unlayered `font: inherit` rule so button text sizes work; fields keep it (16px, no iPhone zoom).
- 4.3 Existing Dates/Drafts: one card, divider rows, Upcoming/Past as a two-part switch in the card header. Projects: one card, divider rows. Team: member/invite rows are divider rows; invite list separated by a line.

**Tweaks after Phase 4 (live 2026-11-21, from Phil's phone/desktop feedback)**
- Pull request #11: New Date / Edit date title area is one row: "New show day" / "Edit travel day" … with Import on the right. Dropped the "NEW DATE" label and the description line. Expand / Collapse all sit in the title row on desktop and just below it on phones. Phil asked to keep the boxes, the space under the header and the section sizes as they were.
- Pull request #12: removed the 16px spacer under the admin header (gap between the project name and the tabs ~52px → ~36px; Phil asked to "split the difference").

**New accent colour (live 2026-11-21):** Phil compared options (Steel, an in-between blue, Brass, Sage, Heather, Bone, Oxblood, deep Olive) and chose **Steel**, `oklch(72% 0.065 245)`: today's blue toned way down, so it no longer looks like Apple's iOS blue. Applied in app/globals.css (`--color-accent`) and the glow in app/icon.tsx and app/apple-icon.tsx. Oxblood was ruled out because it's too close to the Delete/error red. To change it again later, edit those same three places. Update (same day): after using Steel in practice Phil found it a little too subtle and dull, so the accent is now the **in-between blue**, `oklch(70% 0.11 243)` — calmer than the original iOS-like blue, livelier than Steel.

---

# The plan (saved word for word)

I want to make a set of UI improvements to TourBook (Next.js App Router + Tailwind, Supabase, deployed on Vercel). It's a mobile-first touring app for bands and crew, so every change must work great on a phone (~390px wide) AND on desktop.

Note: you can see the code but not the live app or its data. Where I mention "Texas King", that's just the name of my project (band) as stored in the database. It won't appear in the code.

HOW TO WORK
- FIRST STEP: save this whole plan, word for word, as a file called UI_PLAN.md in the project root. As each item is finished, tick it off in that file (and note anything I should know). If we start a new session, I'll say "Continue the UI plan in UI_PLAN.md" and you should pick up from the first unticked item.
- Plan first. Before touching code, look at the relevant files and show me a short plan for the phase you're about to do. Wait for my OK.
- Stability over speed. Don't break or change any existing features, data, or permissions. No regressions.
- Work one phase at a time, and commit each item separately so it's easy to undo.
- After each phase, check every changed screen at phone width and desktop width, and tell me what to test.
- Explain things to me in plain, simple language. I'm not a coder.

PHASE 1 — CREW SIDE
1. Day sheet section order: Venue → Schedule → Load / parking info → DOS contact → everything else stays in its current order.
2. Make the DOS contact phone number tappable (tel: link) so tapping it starts a call. Same for any other phone numbers shown to crew.
3. Attachments:
   - Admins can OPTIONALLY give an attachment a custom display name when uploading or editing.
   - If no custom name is given, show the original file name without the extension ("Menu.pdf" shows as "Menu").
   - Images keep their thumbnail previews exactly as now.
   - PDFs/docs: show a first-page preview if practical; if not, show a tile the same size as image thumbnails with a file-type icon and the name. No blank or broken boxes.
   - Tapping still opens the file like it does now.
4. Header / project switcher: the big title on the left (the current project's name) becomes the project switcher.
   - If the user has only one project: plain title, not tappable, no arrow.
   - If they have more than one: show a small ▾ next to the title. Tapping opens a list of their projects (bottom sheet on mobile, dropdown on desktop) with a checkmark on the current one.
   - Remove the separate project-switcher pill on the right side of the header (it currently shows the selected project's name with a small ▾, e.g. "Texas King ▾", where "Texas King" is just the project name). Only the "…" menu stays on the right.
5. Upcoming / Past: the "Upcoming dates" heading becomes "Upcoming dates ▾". Tapping it lets you choose Upcoming or Past (same pattern as the project switcher). Remove "Past" from the "…" menu, leaving Admin and Logout.
6. In the crew "…" menu, style Logout the same as the other menu items (it currently looks like a separate outlined button).

PHASE 2 — ADMIN SIDE
1. Mobile navigation: on phones, show only three tabs at the top: New Date · Existing Dates · Drafts. Move Team and Projects into a "…" menu on mobile, along with Crew View and Logout. Desktop stays exactly as it is now (all five tabs plus the "Operations" / "Workspace" labels).
2. New Date form: pin "Save Draft" and "Create" to the bottom of the screen so they're always within reach while filling out the form. Leave "Import" where it is.
3. Section visibility: replace the "● Hide" pills with a small sliding toggle switch (no text label, keep the tap area at least 44px for fingers).
   - On = lit in the accent colour = crew can see this section.
   - Off = grey, and the whole section dims slightly so it's obvious it's hidden.
   - Give it an accessible label for screen readers (e.g. "Show Venue to crew").
4. Team page: make rows look human.
   - Show the person's name (fall back to email only if there's no name), their role, and the project name once.
   - Remove the join date/time (it currently shows down to the second, e.g. "joined 5/1/2026, 2:09:59 PM").
   - Remove repeated project-name labels. Each member row currently shows the selected project's name (e.g. "Texas King") about three times: as an "In [project]" tag, in the "1 artist" line, and as grey text underneath. Show it once at most.
5. Use the word "project" everywhere in the UI instead of "artist" (UI text only; don't rename database tables or columns).
   - Projects page: remove both the "Project management" label and the "Manage artists" heading (the tab already says Projects). Input placeholder: "New project name". Button: "Create". List label "Artists in workspace" becomes "Projects".
   - Team page: "Current artist" becomes "Current project", "Viewing current artist…" becomes "Viewing current project…", and so on.
6. Schedule editor (the Load in / Doors / etc. rows in the admin create/edit date form): make it more compact. Same design on phone and desktop. Do NOT change the crew view of the published schedule.
   - Keep the "LINE 1 / LINE 2 / LINE 3" labels.
   - Replace the large red outlined "Delete" button with a small red trash icon on the same row as the LINE label (tap area at least 44px). Keep it on every line.
   - Remove the "Label" and "Time" words next to the fields. Instead, show faded placeholder text inside the empty fields: "Item" and "Time". It disappears when typing starts. Keep accessible labels for screen readers ("Item" and "Time").
   - Put the Item field (wide) and Time field (narrower) side by side on one row. If it's too tight on very small phones, let them stack.
   - Make sure times like "5:00 - 7:00 PM" fit without being cut off on a ~390px phone screen.
   - After deleting a line, show a small "Line deleted · Undo" message at the bottom for a few seconds. No confirmation pop-up.
   - Use thin divider lines between lines instead of a full box around each one.
   - Keep the "Add line" button below the rows.
   - Show me a before/after on phone and desktop before committing.

PHASE 3 — CONSISTENCY (whole app)
1. Address fields (the autocomplete ones) should look exactly like every other input field: same shape, height, border, and corner radius.
2. Upload boxes: the Attachments upload box and the AI Import upload box use the same design (same icon, dashed border, button style). The "PDFs, images, and docs up to 25 MB" line only appears on Attachments.
3. Use one "…" menu icon everywhere (some places currently use "..." text and others "···").
4. Loading states: every screen that loads data shows placeholder boxes (like the Existing Dates tab already does). No blank screens. (The admin page currently flashes a dark screen with a soft green glowing gradient at the top before it loads. Replace that with placeholders.)
5. One accent colour: use the current blue (from the "Create" button) as the single accent, defined in ONE place (a theme variable) so it can be swapped later with a one-line change.
   - Full colour: main buttons and toggle switches when on.
   - Soft, dimmed version: background of the selected tab.
   - Lighter version: links (like addresses).
   - Remove the green.
   - Red is used ONLY for Delete or other destructive actions.
6. Arrows on collapsible sections: use one chevron icon everywhere, same size and weight, that smoothly rotates when a section opens or closes (pointing right when closed, down when open).

PHASE 4 — VISUAL POLISH (show me a preview/mockup first, don't commit until I approve)
Goal: sleek, modern, intentional. NOT a theme, NOT flashy, and not a generic template. People shouldn't notice the design; it should just look good.
1. Font: switch to Geist (via next/font) for the whole app. Use tabular numbers for times so schedule times line up.
2. Corners: give big boxes (cards/sections) a smaller corner radius (around 12px) instead of the very rounded look. Keep the pill shape for small tags. Suggest what buttons and inputs should do, and show me.
3. Flatten nested boxes: avoid boxes inside boxes inside boxes (e.g. Existing Dates, Drafts, Projects). Use spacing and thin divider lines instead of extra containers where possible.

BACK BURNER (do NOT build these now, just be aware)
- Colour-coded day types (Show / Travel / Off). Colours not chosen yet.
- A new signature accent colour: classy and muted, nothing neon or "stage" looking.

DO NOT CHANGE
- Don't add a "Next up" / countdown card to the home screen.
- Don't move the schedule to the very top of the day sheet (Venue stays first).
- Keep addresses as they are: visible text that opens Google Maps when tapped. No "Directions" buttons.
- Don't change the crew view of the published schedule (it already looks good on phone and desktop).
- Don't rename the "Import" button.
- No bottom tab bar.
- Leave pinch-zoom and the small grey helper text as they are for now.
- No touring / printed-day-sheet theme.

If anything is unclear feel free to ask me questions to clearify

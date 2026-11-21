# UI Plan — Progress

Work branch: `ui-plan` (each item is its own commit). To resume in a new session: "Continue the UI plan in UI_PLAN.md" → pick up from the first unticked item below.

- [ ] 1.1 Day sheet section order
- [ ] 1.2 Tappable phone numbers
- [ ] 1.3 Attachments (custom name, name without extension, file tiles)
- [ ] 1.4 Header title becomes the project switcher
- [ ] 1.5 Upcoming / Past switcher
- [ ] 1.6 Crew "…" menu Logout styling
- [ ] 2.1 Admin mobile navigation
- [ ] 2.2 Pinned Save Draft / Create buttons
- [ ] 2.3 Section visibility toggle switches
- [ ] 2.4 Team page rows
- [ ] 2.5 "project" instead of "artist"
- [ ] 2.6 Compact schedule editor
- [ ] 3.1 Address fields match other inputs
- [ ] 3.2 Matching upload boxes
- [ ] 3.3 One "…" menu icon
- [ ] 3.4 Loading placeholders everywhere
- [ ] 3.5 One accent colour
- [ ] 3.6 One chevron for collapsible sections
- [ ] 4.1 Geist font + tabular numbers
- [ ] 4.2 Corner radius
- [ ] 4.3 Flatten nested boxes

## Notes for Phil

(Notes are added here as items are finished.)

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

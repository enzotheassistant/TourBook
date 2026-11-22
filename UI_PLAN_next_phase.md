# Next UI phase — progress

Source: Phil's plan (saved word for word below). Work branch: `ui-phase-5`, one commit per step.
To resume in a new session: "Continue the UI plan in UI_PLAN_next_phase.md" → pick up from the first unticked step.

- [x] Step 1: Wording
- [x] Step 2: Admin date tabs and landing screen
- [x] Step 3: Instant Day sheet / Guest list switch
- [x] Step 4: Eye icons for "Visible to crew"
- [x] Step 5: Compact schedule editor
- [x] Step 6: Team page cleanup
- [x] Step 7: Venue fills in city, province and country
- [x] Step 8: Bottom tab bar on phones (admin only)
- [ ] Step 9: Managing tours (needs a database change — Phil's OK first)
- [ ] Step 10 (added 2026-11-22, proposed — confirm with Phil): one flat project list in the picker — every project you can access, your own and invited ones

## Notes for Phil

Decisions with Phil before starting (2026-11-22):
- Keep the word **Workspace** for the umbrella (Workspace → Projects → Tours → Dates). It fits a solo tour manager, a management company and a band; "Team" and "Account" clash with the Team page and the new Account tab. Only the Team page's "Full workspace" / "Current project" change (to "All projects" / "This project").
- Bottom tab bar: try it (overrides "No bottom tab bar" from the first UI plan).
- Schedule line delete: inside the "…" menu with **no** confirmation pop-up, plus the short "Line deleted · Undo" message.
- Go live in batches after preview testing: Steps 1–3, 4–6, 7–8, then 9.

Batch 1 (Steps 1–3) — live 2026-11-22, pull request #17:
- Step 1: sentence case across the app; "Quick import"; "Create date" / "Save changes" / "Save draft" with matching messages ("Date created", "Changes saved", "Draft saved"); "Loaded into editor" removed; shared plus icon.
- Step 2: `/admin` redirects to `/admin/dates`; the new date form moved to `/admin/new` ("+ New date" button). `/admin?edit=…` / `?duplicate=…` links still open the editor. The right tab is highlighted from the first moment when opening a date; back arrow sits beside the title.
- Step 3: the tab switch no longer calls the server (URL updated in the browser), and the guest list loads in the background when the date opens, so switching is instant.
- The blue dot next to section names: shown only when a section is folded shut, and it means the section already has something filled in. Reported to Phil; left as is unless he wants it changed.

Batch 2 (Steps 4–6) — live 2026-11-22, pull request #18:
- Step 4: eye buttons (open = visible to crew, crossed-out = hidden), grey title when hidden, 2-second "Visible to crew" / "Hidden from crew" message. Screen-reader label "<Section>: visible to crew / hidden from crew".
- Step 5: one row per schedule item; Delete in the "…" menu, no pop-up, Undo message kept. No reordering existed, so none to keep. Per Phil's feedback: **Item on the left, Time on the right**, and the Time box sizes itself to what's typed (no scrolling inside it). If a long time (e.g. "5:00 - 7:00 PM") would make the row cramped, the time drops to its own line under the item for that line only.
- Step 6: one role control per person, owner first, project line only in "All projects" view, Invite button at the top, new invites default to This project, Create invite last, history folded away.
- Data check (read-only): 15 "revoked" invite records belong to ~10 people who are current members and also have an accepted invite. They're older invites replaced when re-sent (Apr 30–May 3) — history, not broken data. Nothing changed.

Batch 3 (Steps 7–8) — live 2026-11-22, pull request #19:
- Step 7: picking a venue fills City / Region / Country only into empty boxes (country used to overwrite; city was never filled). Hotel search fills region/country only, only when empty. Date box shows "Tue, Dec 1, 2026" when not being edited; saved value unchanged.
- Step 8 (changed from the written plan, agreed with Phil): sections are **Dates · Team · Settings** — bottom bar on phones (hidden in the editor), top header on desktop. **Crew view** is its own header button (not under Account). Settings = Projects (create/rename/delete), Workspace (shows its name; rename/switch could come later), Your account (email, Log out). The admin "…" menu is gone. `/admin/projects` forwards to `/admin/settings`.

How workspaces and projects work (agreed with Phil, 2026-11-22):
- A workspace is what you own (basically your account/business). Not everyone needs one — people who are only invited never create one; you only need your own to create your own projects.
- Invites give access to projects (this project, several, or all projects in the inviter's workspace). Technically, accepting makes you a limited member of the inviter's workspace.
- You only manage what you own: Settings → Projects lists projects in workspaces you own or administer. Projects you were invited to just appear in your project list to use.
- Proposed Step 10: the project picker shows one flat list of every project you can access (no grouping; only show the owner's workspace name next to two projects with the same name). Picking one switches to it automatically, so nobody has to "switch workspaces".

---

# The plan (saved word for word)

# UI phase: navigation, editing and team cleanup

## Summary for Phil

This phase makes TourBook simpler to move around and quicker to edit, especially on a phone. Admin opens on your list of dates. Switching tabs feels instant. The "show to crew" switches become eye icons. The schedule editor gets slimmer. The Team page gets cleaned up. Phones get a bottom tab bar, like most apps. And tours get a proper home so old ones stop cluttering the dropdown.

None of this changes how the crew day sheet looks. The crew schedule layout stays exactly as it is.

## Notes for Claude Code

- Plan first, then build. Stability matters more than speed. Don't break anything that works today.
- Do one step at a time, in the order below. After each step, check it at phone width (about 390px) and on desktop, and confirm the crew view still works.
- Phil isn't a developer. When you report back, explain what changed in plain language.
- Only change what users see. Don't rename database tables, columns or internal code names. For example, `dates` stays `dates` internally even where the UI wording changes.
- Use sentence case for every label, button, tab, heading and menu item: capitalize the first word and proper names only. "Guest list", "Save draft", "New date", not "Guest List".
- Wherever a "+" appears, use a plus icon with a small gap after it, not a typed "+" character.

---

## Step 1: Wording (low risk, text only)

1. Change every UI label to sentence case. Examples: Day sheet, Guest list, Save draft, Existing dates, Crew view. Leave proper names alone (Texas King, venue names, people's names).
2. Rename "Import" on the new date screen to **Quick import**.
3. Names for things, used the same way everywhere in the UI: **Project → Tours → Dates.**
   - Never show the words "Artist" or "Workspace" to users.
   - On the Team page, "Full workspace" becomes **All projects**, and "Current project" stays **This project**.
4. Remove the "Loaded into editor" text from the edit screen.
5. Button wording: "Create" becomes **Create date**, "Update" becomes **Save changes**, and "Save Draft" becomes **Save draft**. Any confirmation message should repeat the button's word ("Date created", "Changes saved", "Draft saved").

**Done when:** no Title Case labels are left, and the words Artist and Workspace don't appear anywhere a user can see them.

## Step 2: Admin date tabs and landing screen

1. The tabs become **Dates | Drafts** ("Existing dates" is renamed to "Dates").
2. Put a **+ New date** button at the right end of the same row. It opens the new date form. It's a button, not a tab.
3. Admin opens on **Dates** by default, not on the new date form.
4. When you open a date to edit it, the Dates tab stays highlighted the whole time. Fix the current flash where "New Date" lights up first.
5. On the edit screen, put the back arrow together with the "Edit show day" title, instead of on its own line between the header and the tabs.

**Done when:** `/admin` lands on the dates list, editing a date never highlights the wrong tab, and the row fits on one line at 390px.

## Step 3: Instant Day sheet / Guest list switch (crew)

1. Switching between Day sheet and Guest list should be instant. No grey loading placeholders, and the date header must not reload.
2. The data for both tabs is already known when the page opens, so keep the header in place and only swap the content below it. If the tabs are separate addresses (URLs), keep it that way so links still work, but share the layout so the header stays put.
3. Keep the tab buttons and the date header exactly as they look now.

**Done when:** tapping between the two tabs shows no loading flash on phone or desktop.

## Step 4: Eye icons for "Visible to crew"

Each section in the date editor has a switch that controls whether crew can see it. Nothing on screen explains this right now.

1. Replace each switch with an **eye icon button**: an open eye means crew can see the section, a crossed-out eye means it's hidden.
2. Accessible label: "Visible to crew" or "Hidden from crew", whichever applies, so screen readers announce it.
3. When a section is hidden, grey out its header text so it looks switched off at a glance.
4. When the eye is tapped, show a short message at the bottom of the screen ("Hidden from crew" / "Visible to crew") for about 2 seconds.
5. The tap area should be at least 44 × 44px.
6. Look into the small blue dot next to section names (for example "Load / parking info"). Report back to Phil what it means before changing it.

**Done when:** every section shows the eye, hidden sections look greyed out, and the short message appears on tap.

## Step 5: Compact schedule editor (admin only)

Only the admin editor changes. The crew schedule view stays as it is.

1. Each schedule item is **one row**: a narrow time box on the left, an item name box filling the rest, and a "…" menu at the end.
2. Remove the "LINE 1 / LINE 2" labels and the red trash icon on every row. Delete moves into the "…" menu, which should ask for confirmation.
3. Keep **+ Add line** at the bottom of the list.
4. Keep any reordering that already works.
5. At 390px, the item name box should get most of the width, so names like "Support check" fit easily.

**Done when:** a 7-item show day fits on one phone screen in the editor, and adding, editing and deleting all still work.

## Step 6: Team page cleanup

1. **Members list**
   - Show each person's **name**, with their email under it in smaller grey text. Use the name from their invite. If there's no name, show the email only.
   - Show **one** role control per person. Remove the duplicate role badge and the "ROLE" label on each row.
   - Only show the project name under a person when the "All projects" view is selected.
   - The owner goes at the top of the list.
2. **Inviting**
   - Add an **Invite** button at the top of the page that opens the invite form, instead of the form always sitting at the bottom.
   - New invites default to **This project** access, not "All projects".
   - The order in the form is: name, email, role, access choices, then the **Create invite** button last. On phones it's currently above the access choices, which is wrong.
3. **Invite history** is folded away by default behind **Show invite history** (with a count). Report to Phil if any people show as both a current member and "revoked". That may be a data issue rather than a display issue.

**Done when:** names show instead of only emails, roles appear once per person, and a new invite defaults to This project.

## Step 7: Venue fills in city, province and country

1. When a venue is picked from the address search in the new date or edit form, copy the city, province/state and country from the search result into those boxes.
2. **Only fill boxes that are empty.** Never overwrite something the user typed.
3. The boxes stay editable as normal.
4. If the user doesn't pick from the search (for example a "TBA" venue), nothing changes. They type everything as they do today.
5. In the Date box, show the date in a friendly format (for example "Tue, Dec 1, 2026") instead of the "YYYY-MM-DD" placeholder. Keep the native date picker. Change how it's shown only; the saved value stays the same.

**Done when:** picking London Music Hall fills London / ON / CA into empty boxes, and typed values are never replaced.

## Step 8: Bottom tab bar on phones (admin only)

1. On phone-width screens, admin gets a tab bar fixed to the bottom of the screen with four tabs: **Dates, Team, Projects, Account.** Each tab has an icon and a short label.
2. **Account** holds Crew view and Logout. The "…" menu in the admin header goes away on phones.
3. On desktop, the same four destinations sit in the top header instead. No bottom bar on desktop.
4. Hide the bottom bar while a date is open in the editor, so the Save/Create bar at the bottom has room. It comes back when the user leaves the editor.
5. Leave space for the iPhone home bar (safe-area inset at the bottom).
6. The crew side gets **no** tab bar.
7. Highlight the current tab.

**Done when:** at 390px all four tabs fit with readable labels, the bar hides in the editor, and nothing is covered by the iPhone home bar.

## Step 9: Managing tours

Today, tours are created from the Tour dropdown when making a date. Over time the dropdown fills up with old tours.

1. **Smarter dropdown (no new screens).** Tours with upcoming dates, or with no dates yet, show first. Tours whose dates are all in the past fold under a **Past tours** group at the bottom. Keep "+ New tour" in the dropdown as it works now.
2. **Tours in Projects.** Tapping a project on the Projects screen shows its tours. Each tour can be:
   - **Renamed**
   - **Archived.** It's hidden from the Tour dropdown, but its dates keep their tour label. Archived tours show in a folded "Archived" group where they can be restored.
   - **Deleted, only if it has no dates.** That's for typos and test tours. If a tour has dates, only offer Archive.
3. This step needs a database change (an "archived" marker on tours). Plan it, explain it to Phil, and get his OK before applying it. Make sure existing tours stay unarchived and nothing changes for the crew.

**Done when:** old tours stop crowding the dropdown, and archiving a tour never removes the tour label from its dates.

---

## Not in this phase (parked for later)

- A "what's next" summary at the top of the crew day sheet (skipped for now)
- Changing the font, removing the small all-caps labels, and reducing boxes-inside-boxes (the "generic look" items)
- The smaller polish list: matching the crew and admin date lists, slimming the crew list header, the Drafts empty screen, the stray bar on the date tile, renaming attachments, dashes in time ranges, a light mode

# Round 2 Restart Checklist

Status: repo partially landed, live alignment still needs verification.

## What already landed in repo

- Day-type selector is a real dropdown (`Show Day` / `Travel Day` / `Off Day`)
- Offline/status card was slimmed down
- Login auth error messaging was improved
- Admin helper-copy pass trimmed explanatory filler (`f3efdf5`)

## Repo-side migrations that should exist

### 1) Tour-scoped permissions
File:
- `database/migrations/2026-04-24_phase8_batch2a_tour_scoped_permissions.sql`

Expected live effects:
- `workspace_members.scope_type` allows `tours`
- `workspace_invites.scope_type` allows `tours`
- table `workspace_member_tours` exists
- table `workspace_invite_tours` exists
- indexes for both grant tables exist
- RLS policies for both grant tables exist
- functions exist:
  - `tourbook_has_project_access(uuid, uuid)`
  - `tourbook_has_tour_access(uuid, uuid, uuid)`
- `tours_read`, `dates_read`, `guest_list_entries_read`, `date_schedule_items_read` policies are updated for tour scope

### 2) Tour-day foundation
File:
- `database/migrations/2026-04-25_tour_day_foundation.sql`

Expected live effects:
- `dates.day_type` exists
- invalid / blank values are backfilled to `show`
- default for `dates.day_type` is `show`
- check constraint allows only `show`, `travel`, `off`

## Strong repo signs that live drift may still exist

File:
- `lib/data/server/dates.ts`

Current compatibility shim:
- `LEGACY_MISSING_DATE_COLUMNS = ['day_type']`
- read/write fallback strips `day_type` if schema drift is detected

Meaning:
- repo is still defending against a live database that may not yet have `dates.day_type`

## Live verification checklist

Run these checks against live Supabase before assuming round 2 is complete.

### A. Schema presence
Confirm:
- `public.workspace_member_tours` exists
- `public.workspace_invite_tours` exists
- `public.dates.day_type` exists

### B. Constraint/state checks
Confirm:
- `workspace_members.scope_type` accepts `workspace | projects | tours`
- `workspace_invites.scope_type` accepts `workspace | projects | tours`
- `dates.day_type` default is `show`
- `dates_day_type_check` exists and allows `show | travel | off`

### C. Function/policy checks
Confirm these functions exist:
- `public.tourbook_has_project_access`
- `public.tourbook_has_tour_access`

Confirm these policies were recreated successfully:
- `tours_read`
- `dates_read`
- `guest_list_entries_read`
- `date_schedule_items_read`
- `workspace_member_tours_self_read`
- `workspace_member_tours_admin_write`
- `workspace_invite_tours_admin_read`
- `workspace_invite_tours_admin_write`

### D. Behavioral checks after migration
Verify in the app:
- create invite with `tour` scope
- accept invite with `tour` scope
- edit existing member to `tour` scope
- switch a tour-scoped member back to `workspace`
- confirm date visibility respects project/tour scope correctly
- create/edit `Show Day`, `Travel Day`, and `Off Day`
- confirm `day_type` persists in live data

## UI cleanup status

Completed in `components/admin-page-client.tsx`:
- removed filler subcopy under scope options
- removed redundant edit-member explanatory sentence
- shortened admin-only scope lock message

Kept intentionally:
- `Invite directory`
- `Accepted team members`
- `X pending · Y recent`
- `Viewing current artist ...` context lines
- current artist / full workspace toggles

Reason:
- keep concise operational info
- remove explanatory prose

## Remaining judgment call

Still evaluate visually whether these lines are worth keeping:
- `Viewing current artist: ... invites.`
- `Viewing current artist: ... members.`

Keep if they materially help mobile/context clarity.
Remove if the toggle state already makes context obvious.

## Recommended next order

1. Verify/apply live schema alignment
2. Run behavioral checks for tour scope + day type
3. Reassess whether the `Viewing current artist...` lines still earn their keep
4. Then continue itinerary/tour-day polish

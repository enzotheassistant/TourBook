# TourBook Phase 3 Patch Notes

This patch cuts the visible app over from legacy `shows` storage/API usage to scoped `dates` APIs while preserving the existing UI routes and interaction model.

## What changed

- Added adapter layer:
  - `lib/adapters/date-show.ts`
- Rewired legacy client data access to the new scoped dates APIs:
  - `lib/data-client.ts`
- Updated page-level client components to wait for active workspace/project context before loading scoped data:
  - `components/dashboard-client.tsx`
  - `components/admin-page-client.tsx`
  - `components/show-page-client.tsx`
  - `components/guest-list-manager.tsx`
- Reimplemented compatibility routes so old `/api/shows/*` and `/api/guest-list/*` endpoints proxy through the new date/guest-list data layer:
  - `app/api/shows/route.ts`
  - `app/api/shows/[id]/route.ts`
  - `app/api/shows/[id]/guest-list/route.ts`
  - `app/api/shows/[id]/guest-list/export/route.ts`
  - `app/api/guest-list/[id]/route.ts`

## Intentional behavior

- Routes remain stable, including `/shows/[id]`.
- UI components still operate on legacy `Show`-shaped objects internally for minimal disruption.
- Reads/writes now target scoped `dates` APIs underneath.
- Guest list operations now run through `date_id` while remaining UI-compatible.
- No RLS activation in this patch.
- No legacy `shows` table removal in this patch.

## Validation notes

- Modified files were checked for TypeScript parse/syntax errors.
- Full Next.js build could not be executed in the container because project dependencies were not available locally and `npm install` was terminated before completion.

## Recommended smoke test after deploy

1. Dashboard shows upcoming/past dates.
2. Open a date via `/shows/[id]`.
3. Create a new date in Admin.
4. Edit an existing date.
5. Save draft and publish draft.
6. Add/edit/remove guest list entries.
7. Export guest list CSV.
8. Confirm AI import still creates draft dates.


## Phase 3 follow-up
- Admin AI import review now posts to `/api/dates/ai-intake` with active `workspaceId`, `projectId`, optional `tourId`, and `previewOnly=1`.
- `/api/dates/ai-intake` now supports preview-only review without creating records, preserving the existing modal UX while keeping AI intake on the dates path.
- Legacy `/api/ai-intake` no longer reads from `listShowsServer()` and now forwards requests to `/api/dates/ai-intake`.

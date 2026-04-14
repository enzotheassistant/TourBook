# Phase 5 Cleanup Log

Date: 2026-04-15
Pass: Phase 5 — Batch 1 (conservative)

## Removed in this pass

1. `lib/auth/roles.ts`
- Removed as unused legacy role helper module.
- Verified no imports before deletion.

2. `lib/auth/session.ts`
- Removed as unused wrapper around auth lookup.
- Verified no imports before deletion.

3. `lib/server-store.ts`
- Removed unused legacy in-memory + old `shows` table server store.
- Included old `show_id` guest-list logic not used by current scoped data layer.
- Verified no imports before deletion.

4. `lib/sample-data.ts`
- Removed unused sample dataset.
- Dependency of removed `lib/server-store.ts` only.

## Preserved intentionally

- `/api/shows/*` and `/api/guest-list/[id]` compatibility routes
- `lib/adapters/date-show.ts` and legacy response-shape adapters
- `lib/auth.ts` compatibility helpers currently used by APIs
- All DB schema and migrations (no destructive schema operations)

## Verification notes

- No route or UI workflow changed.
- Cleanup is file-level and reversible via git.
- See verification command outputs in commit context.

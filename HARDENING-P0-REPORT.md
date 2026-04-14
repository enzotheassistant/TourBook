# HARDENING-P0-REPORT

## Fixed items

### 1) Service-role usage reduced in normal request paths
- Refactored server data layer to require a request-scoped Supabase client for user flows:
  - `lib/data/server/shared.ts`
  - `lib/data/server/dates.ts`
  - `lib/data/server/guest-list.ts`
  - `lib/data/server/projects.ts`
  - `lib/data/server/tours.ts`
  - `lib/data/server/workspaces.ts`
- Updated all affected API routes to pass `authState.supabase` into scoped data functions.
- Kept service-role helper (`getPrivilegedDataClient`) available only as explicit privileged/system utility (not used by normal API request handlers changed in this sprint).

### 2) `/api/me/context` hardening
- Reworked endpoint to use authenticated request-scoped Supabase client (RLS-respecting reads).
- Removed implicit project bootstrap/insert side effects.
- Endpoint is now read-only context retrieval.

### 3) Admin auth semantics clarified
- Added explicit helper: `requireApiAuthForWorkspaceAdmin(request, workspaceId)` in `lib/auth.ts`.
  - Enforces owner/admin membership on the given workspace.
- Updated `/api/ai-intake` to use explicit workspace-scoped admin authorization.
- Deprecated ambiguous `requireAdminApiAuth` helper with an explicit error response to prevent accidental insecure use.

### 4) Baseline performance guardrails
- Added sensible server-side limits on hot list endpoints in data layer:
  - dates list default cap (`200`, max `500`)
  - projects/tours/workspaces list caps
  - guest-list list cap
- Added DB indexes migration:
  - `database/migrations/2026-04-15_p0_hardening_indexes.sql`
  - Includes composite indexes for dates, guest_list_entries, and date_schedule_items hot predicates.

## Verified outcomes
- `npm run test:unit` ✅ passed
- `npx tsc --noEmit` ✅ passed (after dependencies installed)
- `npm run build` ✅ passed
- `npm run lint` ⚠️ failed due to pre-existing React hook lint errors in UI components not modified for this security sprint:
  - `components/address-autocomplete-field.tsx`
  - `components/admin-page-client.tsx`
  - plus one warning in `postcss.config.mjs`

## Residual blockers / follow-ups
- `lib/data/server/rls-validation.ts` intentionally still uses service-role for RLS audit/probe tooling (non-request-path diagnostics).
- Deprecated `requireAdminApiAuth` remains exported for compatibility signaling but now intentionally errors; any future callsites must migrate to explicit auth helpers.
- Lint baseline has existing unrelated issues; security hardening changes were validated via unit tests + typecheck + production build.

## Updated go/no-go assessment
- **Go (conditional)** for P0 security hardening scope covered here:
  - normal API paths now use user-scoped clients,
  - `/api/me/context` no longer performs silent writes,
  - admin semantics are explicit where used,
  - hot list paths have baseline limits and supporting indexes.
- **Condition:** keep rollout with existing lint debt acknowledged as non-blocking for this hardening patch set.

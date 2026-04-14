# REAUDIT-P0-FINAL

Date: 2026-04-15
Scope: Post-P0 hardening re-audit after commit `5075e08`

## Executive Decision

**Verdict: CONDITIONAL GO** for the claim **"production-ready multi-tenant platform"**.

P0 hardening materially improved tenant safety and request scoping. Core user request paths now use request-scoped Supabase clients and `/api/me/context` is read-only. However, there is one important authorization-consistency gap that should be closed before calling this fully clean from an admin-policy perspective.

---

## 1) P0 fix effectiveness verification

### A. Service-role removed/limited from normal request paths — **PASS**

Evidence:
- No API route imports `createServiceRoleSupabaseClient` or `getPrivilegedDataClient`.
- Service-role usage now appears confined to diagnostic helper module:
  - `lib/data/server/rls-validation.ts:10,35,63,88,135,178`
- Scoped auth client is propagated into data layer from route handlers (example):
  - `app/api/shows/route.ts:27,59`
  - `app/api/dates/route.ts:17,39`
  - `app/api/ai-intake/route.ts:101,158`

### B. `/api/me/context` read-only behavior — **PASS**

Evidence:
- Endpoint reads memberships/workspaces/projects/tours only and returns context payload.
- No insert/update/delete calls in route.
- Explicit in-code note:
  - `app/api/me/context/route.ts:110` (`Read-only context endpoint: no implicit bootstrap writes.`)

### C. Explicit workspace-admin enforcement where intended — **PARTIAL**

Evidence:
- Explicit helper enforces owner/admin on concrete workspace:
  - `lib/auth.ts:103-131` (`requireApiAuthForWorkspaceAdmin`)
- Legacy AI intake route correctly uses it:
  - `app/api/ai-intake/route.ts:83`
- Deprecated ambiguous helper is now fail-closed:
  - `lib/auth.ts:134-139`

Gap found:
- `/api/dates/ai-intake` uses only `requireApiAuth`:
  - `app/api/dates/ai-intake/route.ts:202-203`
- Mutations then rely on `createDateScoped` editor-or-higher checks:
  - `lib/data/server/dates.ts:275-283`

Interpretation:
- If AI intake is intended to be admin-only everywhere, `/api/dates/ai-intake` is a policy bypass path.
- If editor access is intentionally allowed for this route, behavior is consistent with current data-layer role rules but policy should be explicitly documented.

---

## 2) Re-check of prior top failures

### Multi-tenant isolation — **PASS**
- Workspace membership and workspace/project/tour consistency are enforced before read/write:
  - `lib/data/server/shared.ts:35-67` (`requireWorkspaceAccess`)
  - `lib/data/server/shared.ts:71-93` (`ensureProjectInWorkspace`)
  - `lib/data/server/shared.ts:95-124` (`ensureTourInScope`)
- Date/guest-list operations include workspace scoping in queries and role checks:
  - `lib/data/server/dates.ts:207-210,215-216,279,299,328-329`
  - `lib/data/server/guest-list.ts:83-90,110-113,188-194`

### Auth/session consistency — **PASS**
- Unified request auth state via cookie-bound or bearer-bound anon client:
  - `lib/auth.ts:45-85`
- Route responses commonly finalize auth cookies through `finalizeAuthResponse`:
  - e.g. `app/api/me/context/route.ts:143-157`
  - e.g. `app/api/dates/ai-intake/route.ts:212,217,247,287,291`

### Unscoped/bypass paths — **PARTIAL**
- Major prior bypass class (service-role request-path usage) is fixed.
- Residual policy-parity concern remains for AI intake admin gating:
  - strict admin on `/api/ai-intake` vs generic auth on `/api/dates/ai-intake`.

### RLS enforcement posture — **PASS (with caveat)**
- RLS enabled on tenant tables:
  - `database/migrations/2026-04-15_phase4_rls_activation.sql:12-18`
- Role-specific policies present for core entities:
  - dates (`:212,245,258,271`), guest list (`:291,329,347,365`), schedule items (`:389,427,445,463`), etc.
- Caveat: diagnostic helper uses service-role and is not suitable as proof of runtime user-context RLS behavior:
  - `lib/data/server/rls-validation.ts`.

### Performance guardrails / index posture — **PASS**
- Server-side caps added on hot lists:
  - dates cap 200 default / 500 max: `lib/data/server/dates.ts:228-229`
  - projects/tours/workspaces caps at 200 in their data readers.
- Index migration added for hot predicates/order columns:
  - `database/migrations/2026-04-15_p0_hardening_indexes.sql:2-12`

---

## 3) Index migration quality & applicability

File: `database/migrations/2026-04-15_p0_hardening_indexes.sql`

Assessment:
- **Good**: uses `IF NOT EXISTS` (idempotent/safe re-run).
- **Good**: index keys align with common filters/sorts in code:
  - dates: `(workspace_id, project_id, [status|tour_id], date, created_at)` matches list predicates + ordering.
  - guest list: `(workspace_id, date_id, created_at)` matches list by workspace/date ordered by created_at.
  - schedule items: `(date_id, sort_order, created_at)` matches schedule retrieval order.
- **Operational caveat**: no `CONCURRENTLY`; on large production tables, create during low-traffic window to avoid lock impact.

---

## 4) Validation runs

Executed in `/data/.openclaw/workspace/TourBook`:

- `npm run test:unit` ✅ PASS (7/7)
- `npx tsc --noEmit` ✅ PASS
- `npm run build` ✅ PASS
- `npm run lint` ❌ FAIL (pre-existing UI lint issues unrelated to this P0 backend hardening)
  - `components/address-autocomplete-field.tsx` (setState-in-effect)
  - `components/admin-page-client.tsx` (setState-in-effect + hook deps warnings)
  - `postcss.config.mjs` (anonymous default export warning)

---

## Remaining blockers & precise next steps

### Blocker A (policy consistency): AI-intake admin gating parity

Current state:
- `/api/ai-intake` = workspace admin enforced.
- `/api/dates/ai-intake` = authenticated + editor-or-higher via data-layer write permissions.

Why this matters:
- If product/security policy says “AI intake must be admin-only,” this is a live bypass path.

Next step (required before unconditional GO):
1. Decide policy explicitly:
   - **Option 1 (strict admin)**: switch `/api/dates/ai-intake` to `requireApiAuthForWorkspaceAdmin(request, parsed.workspaceId)`.
   - **Option 2 (editor allowed)**: formally document this as intended and update hardening report to prevent future false positives.
2. Add regression tests for chosen policy on both endpoints (`owner/admin/editor/viewer`).

### Non-blocker B: lint debt

Next step:
1. Resolve existing React hook lint violations.
2. Re-run `npm run lint` and enforce green CI baseline.

---

## Final production-readiness statement

- **Security posture for multi-tenant isolation/authz is substantially improved and mostly production-ready.**
- **Final label remains `CONDITIONAL GO`** until AI-intake admin policy is made explicitly consistent (or explicitly documented as intentionally different) and covered by tests.

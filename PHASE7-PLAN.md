# Phase 7 Plan — Collaboration Foundation (Invites)

## Objective
Add a safe, incremental invite system foundation for workspace collaboration without disrupting existing auth/session flows.

## Batch 1 Scope
1. **Data model (migration)**
   - Add `public.workspace_invites` table:
     - `id` (uuid)
     - `workspace_id`
     - `email`
     - `role` (`admin|editor|viewer`; owner disallowed)
     - `token_hash` (secure accept identifier storage)
     - `status` (`pending|accepted|revoked|expired`)
     - `invited_by_user_id`
     - `accepted_by_user_id` nullable
     - `expires_at`
     - `created_at` / `updated_at`
   - Add indexes for workspace listing, email lookup, expiry, token hash lookup.
   - Add partial unique index to prevent duplicate pending invites for same workspace/email/role.
   - Enable RLS with admin/owner read+write controls.

2. **API foundation**
   - `GET /api/workspaces/[workspaceId]/invites`
   - `POST /api/workspaces/[workspaceId]/invites`
   - `DELETE /api/workspaces/[workspaceId]/invites/[inviteId]`
   - `POST /api/workspaces/invites/accept`

3. **Validation/security**
   - Enforce invite role constraints (`admin|editor|viewer`).
   - Normalize and validate email/token inputs.
   - Token generation via cryptographically secure random bytes.
   - Token storage as SHA-256 hash (`token_hash`), return plaintext token only at create-time response.
   - Accept flow verifies: token validity, pending status, expiry, workspace scope, and authenticated user email match.

4. **UI approach**
   - API-first in Batch 1 to minimize risk.
   - Admin UI entry-point and token delivery UX deferred to Batch 2.

## Delivery strategy (without email infra)
Batch 1 issues secure invite tokens and supports authenticated acceptance via API. Outbound email dispatch will be added in Batch 2 (provider integration + template + delivery telemetry + retry strategy).

## Validation gates
- `npm run test:unit`
- `npx tsc --noEmit`
- `npm run build`
- `npm run lint`

## Rollback
- Revert API/routes/module changes.
- Revert migration and re-run down/compensating migration (drop `workspace_invites`) if needed.

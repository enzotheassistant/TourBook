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
Batch 1 issues secure invite tokens and supports authenticated acceptance via API.

Batch 2 interim delivery path (implemented):
- Admin invite UX now exposes one-time invite link/token for manual copy/share.
- Acceptance UX is wired in dashboard (URL token + paste fallback).
- Outbound email dispatch remains deferred to Batch 3 (provider integration + template + retry strategy).

## Validation gates
- `npm run test:unit`
- `npx tsc --noEmit`
- `npm run build`
- `npm run lint`

## Batch 3 Scope (Operationalization)
1. **Outbound invite email integration (safe/incremental)**
   - Provider-agnostic adapter for invite email delivery.
   - Concrete provider path via env-selected adapter (`resend`) plus no-op/log adapter fallback.
   - Trigger best-effort email send on invite creation without blocking invite issuance.
   - Templated invite email with accept link.

2. **Invite expiry maintenance**
   - Add idempotent maintenance command to mark expired pending invites.
   - Document scheduler/cron usage.

3. **Failure visibility / alerting baseline**
   - Add invite failure report script from `invites.ndjson` for windowed counts + ratio.
   - Define initial alert thresholds and escalation guidance.

4. **Optional route polish**
   - Lightweight `/invite/[token]` landing route to normalize deep-link acceptance.

## Monitoring (Batch 2 + Batch 3)
- `tail -f var/telemetry/invites.ndjson`
- `grep -o '"event":"[^"]*"' var/telemetry/invites.ndjson | sort | uniq -c`
- `grep '"event":"invite.failed"' var/telemetry/invites.ndjson | tail -n 20`
- `npm run invites:failures:report`

## Rollback
- Revert Batch 2 UI/telemetry wiring only (safe, no schema changes).
- Revert API/routes/module changes from Batch 1 if full invite rollback is needed.
- Revert migration and re-run down/compensating migration (drop `workspace_invites`) only for full feature removal.

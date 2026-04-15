# Phase 7 Batch 1 Report — Collaboration Foundation (Invites)

## Summary
Implemented invite foundation with conservative, API-first changes:
- Added invite schema migration with RLS and indexes.
- Added server invite module with validation + security utilities.
- Added workspace-scoped invite create/list/revoke endpoints.
- Added authenticated invite acceptance endpoint.
- Added unit tests for invite validation/token helpers.

## Changes

### 1) Database migration
**File:** `database/migrations/2026-04-15_phase7_workspace_invites_foundation.sql`

Adds `public.workspace_invites` with:
- `id uuid primary key`
- `workspace_id` FK to `public.workspaces(id)`
- `email text`
- `role text` constrained to `admin|editor|viewer`
- `token_hash text unique`
- `status text` constrained to `pending|accepted|revoked|expired`
- `invited_by_user_id uuid`
- `accepted_by_user_id uuid null`
- `expires_at timestamptz`
- `created_at/updated_at timestamptz`

Indexes:
- `workspace_id + status + created_at`
- `workspace_id + lower(email)`
- `expires_at`
- Unique pending dedupe: `(workspace_id, lower(email), role) where status='pending'`

RLS policies:
- Admin/owner select invites in workspace
- Admin/owner insert invites (with `invited_by_user_id = auth.uid()`)
- Admin/owner update invites (e.g., revoke)

### 2) Server data module
**File:** `lib/data/server/invites.ts`

Implements:
- `listWorkspaceInvitesScoped`
- `createWorkspaceInviteScoped`
- `revokeWorkspaceInviteScoped`
- `acceptWorkspaceInvitePrivileged`

Security/validation details:
- Role validation rejects `owner` invite role.
- Email normalization to lowercase.
- Secure token generation (`crypto.randomBytes(32)`), hash storage (`sha256`).
- Duplicate pending invite prevention (app check + DB unique constraint).
- Acceptance checks token, status, expiry, and authenticated email match.
- Acceptance inserts workspace membership if absent, then marks invite accepted.

### 3) API routes
- `app/api/workspaces/[workspaceId]/invites/route.ts`
  - `GET`: list invites (admin/owner)
  - `POST`: create invite (admin/owner), returns one-time `acceptToken`
- `app/api/workspaces/[workspaceId]/invites/[inviteId]/route.ts`
  - `DELETE`: revoke invite (admin/owner)
- `app/api/workspaces/invites/accept/route.ts`
  - `POST`: accept invite with token (authenticated user)

Response shape convention:
- Success: `{ invites }`, `{ invite }`, `{ invite, acceptToken }`, `{ invite, membershipCreated }`
- Error: `{ error }`

### 4) Tests
- Added `lib/data/server/invites.test.mjs`
- Updated `package.json` test script to include invite tests.

## Batch-1 constraints check
- ✅ No visual redesign.
- ✅ Existing auth/session architecture preserved.
- ✅ Conservative/reversible API-first changes.
- ✅ No outbound email dependency introduced.

## Known limitations / Batch 2 recommendations
1. **Token delivery UX:** currently returns `acceptToken` from create endpoint; needs email transport in Batch 2.
2. **Acceptance path:** uses privileged server client for secure token lookup + membership mutation; can be upgraded to a transactional RPC for stricter DB-level atomicity.
3. **Expiry lifecycle:** status auto-computed as expired when listing/accepting; scheduled background sweeper can convert stale pending invites to `expired` in Batch 2.
4. **Admin UI wiring:** add invite management controls in admin workspace settings panel in Batch 2.

# Phase 7 Batch 2 Report — Invite UX + Acceptance Wiring

## Summary
Batch 2 adds practical, role-safe invite UX on top of the Batch 1 APIs without redesigning existing admin/dashboard flows.

## What shipped

### 1) Admin invite management (owner/admin only)
- Added invite management section in existing admin experience.
- Owners/admins can:
  - create invite (email + role)
  - view pending/recent invites
  - revoke pending invite
- Viewer/editor roles do not see invite management controls.
- Server-side access checks remain source of truth.

### 2) Invite acceptance UX
- Added acceptance panel in crew dashboard when `inviteToken`/`token` is in URL.
- Added manual token paste fallback in the same panel.
- Wired to existing `POST /api/workspaces/invites/accept`.
- Clear status messaging for success and API error states (invalid/expired/revoked/wrong email/etc. surfaced from API).
- Login page now preserves invite token and redirects to dashboard acceptance flow after sign-in.

### 3) Temporary manual delivery path
- After creating an invite, UI now shows generated one-time invite link + token.
- Added copy link / copy token actions.
- Explicitly marked as interim delivery strategy until outbound email integration.

### 4) Minimal invite telemetry (fail-open)
- Added invite funnel telemetry stream:
  - `invite.created`
  - `invite.revoked`
  - `invite.accepted`
  - `invite.failed`
- Added client tracker + authenticated API endpoint + NDJSON sink.
- Telemetry is fail-open and never blocks product flows.

## Monitoring / ops
- Tail invite telemetry:
  - `tail -f var/telemetry/invites.ndjson`
- Quick event counts:
  - `grep -o '"event":"[^"]*"' var/telemetry/invites.ndjson | sort | uniq -c`
- Check latest invite failures:
  - `grep '"event":"invite.failed"' var/telemetry/invites.ndjson | tail -n 20`

## Rollback notes
Conservative and reversible rollback options:
1. Revert UI-only wiring:
   - `components/admin-page-client.tsx`
   - `components/dashboard-client.tsx`
   - `app/login/page.tsx`
   - `lib/data-client.ts`
   - `lib/roles.ts`
2. Revert invite telemetry only:
   - `app/api/telemetry/invites/route.ts`
   - `lib/invite-telemetry.ts`
   - `lib/telemetry/invites.ts`
3. Batch 1 schema/API remain untouched by Batch 2.

## Remaining Batch 3 candidates
- Outbound email provider integration (template + delivery + retries + bounce handling).
- Dedicated invite landing route for pre-auth deep-link UX.
- Invite expiry sweeper / lifecycle automation.
- Optional analytics dashboards/alerts on invite failure rates.

# Phase 7 Closeout Checklist (Invite System Go-Live)

Operational scope: invite create/list/revoke/accept, outbound invite email (best-effort), expiry maintenance, and failure reporting.

## 1) Required env vars and secrets

### Core (required for app + invite jobs)
- `SUPABASE_URL` (fallback: `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY` (required for `npm run invites:expire`)

### Invite email provider mode
- `INVITE_EMAIL_PROVIDER`
  - `resend` = live provider mode
  - unset/other = no-op provider mode (manual share fallback)

### Required only when `INVITE_EMAIL_PROVIDER=resend`
- `INVITE_EMAIL_FROM` (e.g. `TourBook <invites@yourdomain.com>`)
- `RESEND_API_KEY`

### Strongly recommended
- `INVITE_APP_BASE_URL` (fallbacks: `NEXT_PUBLIC_APP_URL`, request origin, then `http://localhost:3000`)
- `INVITE_EMAIL_APP_NAME` (defaults to `TourBook`)

## 2) Provider configuration matrix

| Mode | `INVITE_EMAIL_PROVIDER` | Required secrets | Invite create behavior | Email behavior |
|---|---|---|---|---|
| Live Resend | `resend` | `INVITE_EMAIL_FROM`, `RESEND_API_KEY` | Succeeds | Sends via Resend API |
| Safe fallback | unset/other | none | Succeeds | No provider send; logs no-op + manual share token/link remains available |
| Misconfigured Resend | `resend` but missing key/from | missing one/both | Succeeds | Delivery fails safely; records `invite.failed` reason `invite_email_failed:resend:missing_resend_env` |

## 3) Cron / maintenance jobs

- Expiry sweeper:
  - `npm run invites:expire`
  - Hourly cron example:
    - `0 * * * * cd /data/.openclaw/workspace/TourBook && npm run invites:expire >> var/log/invite-expiry.log 2>&1`
- Failure report:
  - `npm run invites:failures:report`
  - Custom window: `node scripts/invite-failures-report.mjs --hours=6`

## 4) First live smoke test (practical runbook)

Run these first:
1. `npm run invites:go-live:check`
2. `npm run invites:expire`
3. `npm run invites:failures:report`

Then execute app flow smoke test in staging/live:
1. **Create invite** (admin/owner)
   - Create invite for test email + role (`viewer` recommended first).
   - Verify API response includes `invite`, `acceptToken`, and `emailDelivery`.
   - Verify invite appears in invite list with `pending`.
2. **Accept invite** (matching authenticated email)
   - Open `/invite/<token>` (or dashboard `?inviteToken=...`) while logged into matching email account.
   - Verify success response and membership creation.
3. **Revoke invite**
   - Create second test invite and revoke via admin UI/API.
   - Verify status becomes `revoked` and revoked token cannot be accepted.
4. **Expiry path**
   - Create short-expiry invite (or wait until expiry).
   - Run `npm run invites:expire`.
   - Verify stale pending invite transitions to `expired` and cannot be accepted.
5. **Failure reporting**
   - Run `npm run invites:failures:report`.
   - Verify report prints created/failed counts and top reasons.

## 5) Default-safe behavior when config is missing

- Missing/invalid email provider config **does not block invite creation**.
- Provider failures are captured as telemetry (`invite.failed`) with reason prefix `invite_email_failed:`.
- Manual share (token/link) remains available as fallback path.
- Expiry job exits non-zero if required Supabase env is missing (safe failure, no partial updates).

## 6) Rollback / fallback steps

If live email issues occur:
1. Set `INVITE_EMAIL_PROVIDER=` (unset) to force no-op/manual-share mode.
2. Keep invite APIs enabled; continue using token/link copy-share fallback.
3. Monitor telemetry for failed reasons:
   - `npm run invites:failures:report`
4. Keep expiry cron running to maintain lifecycle hygiene.

If full Phase 7 rollback is required:
- Revert Phase 7 route/module changes and apply migration rollback strategy per `PHASE7-PLAN.md`/batch reports.

## 7) Go / No-Go criteria

### Go
- `npm run invites:go-live:check` has **0 fail**.
- Unit/TS/build/lint all pass.
- Smoke test passes: create, accept, revoke, expiry, failure report.
- Telemetry path writable and failure ratio within threshold.

### No-Go
- Missing required env for selected mode (`resend` without key/from).
- `invites:expire` cannot authenticate to Supabase service role.
- Smoke test blocks on core invite lifecycle steps.
- Repeated auth/provider errors (e.g., `missing_resend_env`, `resend_http_401`).

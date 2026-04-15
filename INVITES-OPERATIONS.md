# Invite Operations Setup

## 0) Go-live preflight (recommended first)

Run:
- `npm run invites:go-live:check`

What it verifies (non-destructive):
- Required maintenance env (`SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
- Invite provider mode (`resend` vs fallback noop/manual-share)
- Required Resend env when provider is live (`INVITE_EMAIL_FROM`, `RESEND_API_KEY`)
- Invite link base URL fallback posture
- Telemetry directory writability

## 1) Outbound invite email delivery

Invite creation now triggers best-effort email delivery using an adapter:
- `INVITE_EMAIL_PROVIDER=resend` enables Resend API delivery.
- Any other value (or unset) uses no-op/log mode and keeps manual share flow active.

Required env for Resend mode:
- `INVITE_EMAIL_PROVIDER=resend`
- `INVITE_EMAIL_FROM="TourBook <invites@yourdomain.com>"`
- `RESEND_API_KEY=...`

Optional:
- `INVITE_APP_BASE_URL=https://app.yourdomain.com` (used for invite accept links)
- `INVITE_EMAIL_APP_NAME=TourBook`

Fail-safe behavior:
- Invite creation is never blocked by email provider issues.
- Delivery failures are logged to invite telemetry as `invite.failed` reasons prefixed with `invite_email_failed:`.
- UI still exposes manual copy/share link + token.

## 2) Expiry maintenance job

Command:
- `npm run invites:expire`

Behavior:
- Marks `workspace_invites` from `pending` to `expired` when `expires_at < now()`.
- Idempotent and safe to run repeatedly.

Scheduler examples:
- Cron (hourly): `0 * * * * cd /data/.openclaw/workspace/TourBook && npm run invites:expire >> var/log/invite-expiry.log 2>&1`
- OpenClaw scheduler (example command payload): `npm run invites:expire`

## 3) Failure visibility report

Command:
- Default 24h: `npm run invites:failures:report`
- Custom window: `node scripts/invite-failures-report.mjs --hours=6`

Report includes:
- Invite created count
- Invite failed count
- Failure ratio (%)
- Top failure reasons

Suggested alert thresholds (starting point):
- **Warning:** `invite.failed > 5` in 24h
- **Critical:** failure ratio > `20%` over 24h
- **Critical:** any repeated provider auth/config errors (e.g., `missing_resend_env`, `resend_http_401`)

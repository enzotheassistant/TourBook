import { recordInviteTelemetry } from '@/lib/telemetry/invites';
import type { WorkspaceInviteSummary } from '@/lib/data/server/invites';
import type { WorkspaceInviteRole } from '@/lib/invites/security';

type SendInviteEmailInput = {
  invite: WorkspaceInviteSummary;
  acceptToken: string;
  workspaceName?: string | null;
  scopeProjectNames?: string[];
  inviterName?: string | null;
  requestOrigin?: string | null;
};

type EmailDeliveryResult = {
  ok: boolean;
  provider: string;
  mode: 'live' | 'noop';
  reason?: string;
};

type InviteEmailAdapter = {
  provider: string;
  mode: 'live' | 'noop';
  send: (input: SendInviteEmailInput) => Promise<EmailDeliveryResult>;
};

function resolveAppBaseUrl(requestOrigin?: string | null) {
  const explicit = process.env.INVITE_APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim().replace(/\/$/, '');
  if (typeof requestOrigin === 'string' && requestOrigin.trim()) return requestOrigin.trim().replace(/\/$/, '');
  return 'http://localhost:3000';
}

function buildAcceptLink(input: SendInviteEmailInput) {
  const base = resolveAppBaseUrl(input.requestOrigin);
  return `${base}/invite/${encodeURIComponent(input.acceptToken)}`;
}

function roleLabel(role: WorkspaceInviteRole) {
  if (role === 'admin') return 'Admin';
  if (role === 'editor') return 'Editor';
  return 'Viewer';
}

function renderInviteEmail(input: SendInviteEmailInput) {
  const acceptLink = buildAcceptLink(input);
  const appName = process.env.INVITE_EMAIL_APP_NAME?.trim() || 'TourBook';
  const workspaceName = input.workspaceName?.trim() || '';
  const inviterName = input.inviterName?.trim() || 'A teammate';
  const role = roleLabel(input.invite.role);
  const projectNames = (input.scopeProjectNames ?? []).map((name) => name.trim()).filter(Boolean);

  const scopeLabel = input.invite.scopeType === 'projects'
    ? `projects: ${projectNames.length ? projectNames.join(', ') : 'selected project(s)'}`
    : `workspace: ${workspaceName || 'your workspace'}`;

  const subjectTarget = input.invite.scopeType === 'projects'
    ? (projectNames.length ? projectNames.join(', ') : 'selected projects')
    : (workspaceName || 'your workspace');

  const subject = `${inviterName} invited you to ${subjectTarget} on ${appName}`;
  const text = [
    `You were invited to join ${appName}.`,
    `Scope: ${scopeLabel}`,
    `Role: ${role}`,
    `Accept invite: ${acceptLink}`,
    `Invite expires: ${new Date(input.invite.expiresAt).toISOString()}`,
    '',
    'If this was unexpected, you can ignore this message.',
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
      <p>You were invited to join <strong>${appName}</strong>.</p>
      <p><strong>Scope:</strong> ${scopeLabel}</p>
      <p><strong>Role:</strong> ${role}</p>
      <p>
        <a href="${acceptLink}" style="display:inline-block;background:#111;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none;">Accept invite</a>
      </p>
      <p style="font-size:12px;color:#555">Invite link: <a href="${acceptLink}">${acceptLink}</a></p>
      <p style="font-size:12px;color:#555">Expires: ${new Date(input.invite.expiresAt).toISOString()}</p>
      <p style="font-size:12px;color:#555">If this was unexpected, ignore this message.</p>
    </div>
  `.trim();

  return { subject, text, html, acceptLink };
}

function buildNoopAdapter(): InviteEmailAdapter {
  return {
    provider: 'noop-log',
    mode: 'noop',
    async send(input) {
      const content = renderInviteEmail(input);
      console.info('[invite-email][noop] provider not configured, manual share fallback active', {
        inviteId: input.invite.id,
        email: input.invite.email,
        acceptLink: content.acceptLink,
      });
      return { ok: true, provider: 'noop-log', mode: 'noop', reason: 'provider_not_configured' };
    },
  };
}

function buildResendAdapter(): InviteEmailAdapter {
  return {
    provider: 'resend',
    mode: 'live',
    async send(input) {
      const apiKey = process.env.RESEND_API_KEY?.trim();
      const from = process.env.INVITE_EMAIL_FROM?.trim();
      if (!apiKey || !from) {
        return { ok: false, provider: 'resend', mode: 'live', reason: 'missing_resend_env' };
      }

      const content = renderInviteEmail(input);
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [input.invite.email],
          subject: content.subject,
          text: content.text,
          html: content.html,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        return {
          ok: false,
          provider: 'resend',
          mode: 'live',
          reason: `resend_http_${response.status}:${body.slice(0, 160)}`,
        };
      }

      return { ok: true, provider: 'resend', mode: 'live' };
    },
  };
}

function resolveAdapter(): InviteEmailAdapter {
  const provider = (process.env.INVITE_EMAIL_PROVIDER || '').trim().toLowerCase();
  if (provider === 'resend') {
    return buildResendAdapter();
  }
  return buildNoopAdapter();
}

export async function sendInviteEmailBestEffort(input: SendInviteEmailInput): Promise<EmailDeliveryResult> {
  const adapter = resolveAdapter();

  try {
    const result = await adapter.send(input);
    if (!result.ok) {
      await recordInviteTelemetry({
        event: 'invite.failed',
        workspaceId: input.invite.workspaceId,
        inviteId: input.invite.id,
        role: input.invite.role,
        reason: `invite_email_failed:${result.provider}:${result.reason ?? 'unknown'}`,
      });
    }
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown_error';
    await recordInviteTelemetry({
      event: 'invite.failed',
      workspaceId: input.invite.workspaceId,
      inviteId: input.invite.id,
      role: input.invite.role,
      reason: `invite_email_failed:${adapter.provider}:${reason}`,
    });
    return { ok: false, provider: adapter.provider, mode: adapter.mode, reason };
  }
}

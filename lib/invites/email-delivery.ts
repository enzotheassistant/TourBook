import { recordInviteTelemetry } from '@/lib/telemetry/invites';
import type { WorkspaceInviteSummary } from '@/lib/data/server/invites';
import type { WorkspaceInviteRole } from '@/lib/invites/security';

type SendInviteEmailInput = {
  invite: WorkspaceInviteSummary;
  acceptToken: string;
  workspaceName?: string | null;
  scopeProjectNames?: string[];
  /** Per-band levels, e.g. [{ name: 'Texas King', role: 'crew' }]. Preferred over scopeProjectNames. */
  bands?: Array<{ name: string; role: WorkspaceInviteRole }>;
  /** True when this replaces an earlier invite (their access was changed). */
  updated?: boolean;
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
  if (role === 'admin' || role === 'editor') return 'Manager';
  if (role === 'crew') return 'Crew';
  return 'Viewer';
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] as string));
}

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? 'TourBook';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function renderInviteEmail(input: SendInviteEmailInput) {
  const acceptLink = buildAcceptLink(input);
  const appName = process.env.INVITE_EMAIL_APP_NAME?.trim() || 'TourBook';
  const workspaceName = input.workspaceName?.trim() || '';
  const inviterName = input.inviterName?.trim() || 'A teammate';
  const role = roleLabel(input.invite.role);
  const bands = (input.bands ?? []).filter((band) => band.name.trim());
  const projectNames = bands.length
    ? bands.map((band) => band.name.trim())
    : (input.scopeProjectNames ?? []).map((name) => name.trim()).filter(Boolean);

  const scopeLabel = bands.length
    ? bands.map((band) => `${band.name.trim()} (${roleLabel(band.role)})`).join(', ')
    : input.invite.scopeType === 'projects'
    ? `projects: ${projectNames.length ? projectNames.join(', ') : 'selected project(s)'}`
    : input.invite.scopeType === 'tours'
      ? `tours: ${projectNames.length ? projectNames.join(', ') : 'selected tour(s)'}`
      : `workspace: ${workspaceName || 'your workspace'}`;

  const subjectTarget = bands.length
    ? joinNames(projectNames)
    : input.invite.scopeType === 'projects'
    ? (projectNames.length ? projectNames.join(', ') : 'selected projects')
    : input.invite.scopeType === 'tours'
      ? (projectNames.length ? projectNames.join(', ') : 'selected tours')
      : (workspaceName || 'your workspace');

  const subject = input.updated
    ? `Your invite to ${subjectTarget} on ${appName} was updated`
    : `${inviterName} invited you to ${subjectTarget} on ${appName}`;
  const intro = input.updated
    ? `Your ${appName} invite was updated. Use this link, not the one in the earlier email.`
    : `You were invited to join ${appName}.`;
  const accessLines = bands.length ? [`Access: ${scopeLabel}`] : [`Scope: ${scopeLabel}`, `Role: ${role}`];
  const text = [
    intro,
    ...accessLines,
    `Accept invite: ${acceptLink}`,
    `Invite expires: ${new Date(input.invite.expiresAt).toISOString()}`,
    '',
    'If this was unexpected, you can ignore this message.',
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
      <p>${input.updated ? escapeHtml(intro) : `You were invited to join <strong>${appName}</strong>.`}</p>
      ${bands.length
        ? `<p><strong>Access:</strong> ${escapeHtml(scopeLabel)}</p>`
        : `<p><strong>Scope:</strong> ${escapeHtml(scopeLabel)}</p><p><strong>Role:</strong> ${role}</p>`}
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


/**
 * A plain heads-up when someone already on the team is given access to
 * another band. No link to accept — they just open the app. (Nothing is sent
 * when access is removed.)
 */
export async function sendAccessAddedEmailBestEffort(input: {
  email: string;
  bands: Array<{ name: string; role: WorkspaceInviteRole }>;
  requestOrigin?: string | null;
}): Promise<EmailDeliveryResult> {
  const bands = input.bands.filter((band) => band.name.trim());
  if (!input.email || !bands.length) return { ok: true, provider: 'none', mode: 'noop', reason: 'nothing_to_send' };

  const appName = process.env.INVITE_EMAIL_APP_NAME?.trim() || 'TourBook';
  const appLink = resolveAppBaseUrl(input.requestOrigin);
  const names = joinNames(bands.map((band) => band.name.trim()));
  const lines = bands.map((band) => `${band.name.trim()} as ${roleLabel(band.role)}`);
  const subject = `You've been added to ${names} on ${appName}`;
  const text = [
    `You've been added to ${lines.join(', ')} on ${appName}.`,
    `Open ${appName} and pick it from your project list: ${appLink}`,
  ].join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
      <p>You've been added to <strong>${escapeHtml(lines.join(', '))}</strong> on ${appName}.</p>
      <p>Open ${appName} and pick it from your project list.</p>
      <p><a href="${appLink}" style="display:inline-block;background:#111;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none;">Open ${appName}</a></p>
    </div>
  `.trim();

  const provider = (process.env.INVITE_EMAIL_PROVIDER || '').trim().toLowerCase();
  if (provider !== 'resend') {
    console.info('[access-email][noop] provider not configured', { email: input.email, subject });
    return { ok: true, provider: 'noop-log', mode: 'noop', reason: 'provider_not_configured' };
  }
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.INVITE_EMAIL_FROM?.trim();
  if (!apiKey || !from) return { ok: false, provider: 'resend', mode: 'live', reason: 'missing_resend_env' };
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [input.email], subject, text, html }),
    });
    if (!response.ok) {
      const body = await response.text();
      return { ok: false, provider: 'resend', mode: 'live', reason: `resend_http_${response.status}:${body.slice(0, 160)}` };
    }
    return { ok: true, provider: 'resend', mode: 'live' };
  } catch (error) {
    return { ok: false, provider: 'resend', mode: 'live', reason: error instanceof Error ? error.message : 'unknown_error' };
  }
}

/** A short "your account was deleted" note, sent after an account is deleted. */
export async function sendAccountDeletedEmailBestEffort(input: { email: string }): Promise<EmailDeliveryResult> {
  if (!input.email) return { ok: true, provider: 'none', mode: 'noop', reason: 'nothing_to_send' };

  const appName = process.env.INVITE_EMAIL_APP_NAME?.trim() || 'TourBook';
  const subject = `Your ${appName} account was deleted`;
  const text = [
    `Your ${appName} account (${input.email}) has been deleted, as you asked.`,
    `You no longer have access to any band on ${appName}. Anything you added to a band's day sheets or guest lists stays with that band.`,
    `If you didn't ask for this, let your tour manager know.`,
  ].join('\n\n');
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
      <p>Your ${appName} account (<strong>${escapeHtml(input.email)}</strong>) has been deleted, as you asked.</p>
      <p>You no longer have access to any band on ${appName}. Anything you added to a band's day sheets or guest lists stays with that band.</p>
      <p>If you didn't ask for this, let your tour manager know.</p>
    </div>
  `.trim();

  const provider = (process.env.INVITE_EMAIL_PROVIDER || '').trim().toLowerCase();
  if (provider !== 'resend') {
    console.info('[account-email][noop] provider not configured', { email: input.email, subject });
    return { ok: true, provider: 'noop-log', mode: 'noop', reason: 'provider_not_configured' };
  }
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.INVITE_EMAIL_FROM?.trim();
  if (!apiKey || !from) return { ok: false, provider: 'resend', mode: 'live', reason: 'missing_resend_env' };
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [input.email], subject, text, html }),
    });
    if (!response.ok) {
      const body = await response.text();
      return { ok: false, provider: 'resend', mode: 'live', reason: `resend_http_${response.status}:${body.slice(0, 160)}` };
    }
    return { ok: true, provider: 'resend', mode: 'live' };
  } catch (error) {
    return { ok: false, provider: 'resend', mode: 'live', reason: error instanceof Error ? error.message : 'unknown_error' };
  }
}

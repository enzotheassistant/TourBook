import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

type InviteTelemetryEvent = {
  timestamp: string;
  event: 'invite.created' | 'invite.revoked' | 'invite.accepted' | 'invite.failed';
  workspaceId?: string;
  inviteId?: string;
  role?: string;
  reason?: string;
};

const DEFAULT_LOG_PATH = path.join(process.cwd(), 'var', 'telemetry', 'invites.ndjson');

function normalizeOptional(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function sanitizeReason(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 180) : undefined;
}

export async function recordInviteTelemetry(details: Omit<InviteTelemetryEvent, 'timestamp'>) {
  const event: InviteTelemetryEvent = {
    timestamp: new Date().toISOString(),
    event: details.event,
    workspaceId: normalizeOptional(details.workspaceId),
    inviteId: normalizeOptional(details.inviteId),
    role: normalizeOptional(details.role),
    reason: sanitizeReason(details.reason),
  };

  const line = `${JSON.stringify(event)}\n`;

  try {
    const telemetryPath = process.env.INVITE_TELEMETRY_FILE || DEFAULT_LOG_PATH;
    await mkdir(path.dirname(telemetryPath), { recursive: true });
    await appendFile(telemetryPath, line, 'utf8');
  } catch {
    // Fail-open by design.
  }
}

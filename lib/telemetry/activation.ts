import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

type ActivationEvent = {
  timestamp: string;
  event: 'activation.empty_state_rendered' | 'activation.create_cta_clicked' | 'activation.create_success' | 'activation.create_failure';
  stateType?: string;
  cta?: string;
  entity?: 'workspace' | 'artist' | 'date';
  workspaceId?: string;
  projectId?: string;
  role?: string;
  reason?: string;
};

const DEFAULT_LOG_PATH = path.join(process.cwd(), 'var', 'telemetry', 'activation.ndjson');

function normalizeOptional(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function sanitizeReason(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 180);
}

export async function recordActivationTelemetry(details: Omit<ActivationEvent, 'timestamp'>) {
  const event: ActivationEvent = {
    timestamp: new Date().toISOString(),
    event: details.event,
    stateType: normalizeOptional(details.stateType),
    cta: normalizeOptional(details.cta),
    entity: details.entity,
    workspaceId: normalizeOptional(details.workspaceId),
    projectId: normalizeOptional(details.projectId),
    role: normalizeOptional(details.role),
    reason: sanitizeReason(details.reason),
  };

  const line = `${JSON.stringify(event)}\n`;

  try {
    const telemetryPath = process.env.ACTIVATION_TELEMETRY_FILE || DEFAULT_LOG_PATH;
    await mkdir(path.dirname(telemetryPath), { recursive: true });
    await appendFile(telemetryPath, line, 'utf8');
  } catch {
    // Telemetry must never affect API behavior.
  }
}

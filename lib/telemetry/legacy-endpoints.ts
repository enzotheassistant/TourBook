import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { NextRequest } from 'next/server';

type LegacyEndpointTelemetryEvent = {
  endpoint: string;
  method: string;
  timestamp: string;
  workspaceId?: string;
  projectId?: string;
};

const DEFAULT_LOG_PATH = path.join(process.cwd(), 'var', 'telemetry', 'legacy-endpoints.ndjson');

function normalizeOptional(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export async function recordLegacyEndpointTelemetry(
  request: NextRequest,
  details: { endpoint: string; workspaceId?: string | null; projectId?: string | null },
) {
  const event: LegacyEndpointTelemetryEvent = {
    endpoint: details.endpoint,
    method: request.method,
    timestamp: new Date().toISOString(),
    workspaceId: normalizeOptional(details.workspaceId),
    projectId: normalizeOptional(details.projectId),
  };

  const line = `${JSON.stringify(event)}\n`;

  try {
    const telemetryPath = process.env.LEGACY_TELEMETRY_FILE || DEFAULT_LOG_PATH;
    await mkdir(path.dirname(telemetryPath), { recursive: true });
    await appendFile(telemetryPath, line, 'utf8');
  } catch {
    // Telemetry must never affect API behavior.
  }

  console.info('[legacy-telemetry]', line.trim());
}

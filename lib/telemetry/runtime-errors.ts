import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { NextRequest } from 'next/server';

type ApiRuntimeErrorEvent = {
  timestamp: string;
  endpoint: string;
  method: string;
  status: number;
  errorName: string;
  errorCode?: string;
};

const DEFAULT_LOG_PATH = path.join(process.cwd(), 'var', 'telemetry', 'api-errors.ndjson');

function toErrorName(error: unknown) {
  if (error instanceof Error && error.name) return error.name;
  return 'UnknownError';
}

function toErrorCode(error: unknown) {
  if (!error || typeof error !== 'object') return undefined;
  const code = 'code' in error ? (error as { code?: unknown }).code : undefined;
  return typeof code === 'string' && code.trim() ? code.trim() : undefined;
}

export async function recordApiRuntimeError(
  request: NextRequest,
  details: {
    endpoint: string;
    status: number;
    error: unknown;
  },
) {
  const event: ApiRuntimeErrorEvent = {
    timestamp: new Date().toISOString(),
    endpoint: details.endpoint,
    method: request.method,
    status: details.status,
    errorName: toErrorName(details.error),
    errorCode: toErrorCode(details.error),
  };

  const line = `${JSON.stringify(event)}\n`;

  try {
    const telemetryPath = process.env.API_ERROR_TELEMETRY_FILE || DEFAULT_LOG_PATH;
    await mkdir(path.dirname(telemetryPath), { recursive: true });
    await appendFile(telemetryPath, line, 'utf8');
  } catch {
    // Telemetry must never affect API behavior.
  }

  console.error('[api-runtime-error]', {
    endpoint: event.endpoint,
    method: event.method,
    status: event.status,
    errorName: event.errorName,
    ...(event.errorCode ? { errorCode: event.errorCode } : {}),
  });
}

#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_LOG_PATH = path.join(process.cwd(), 'var', 'telemetry', 'legacy-endpoints.ndjson');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseArgs(argv) {
  const parsed = {
    days: 14,
    file: process.env.LEGACY_TELEMETRY_FILE || DEFAULT_LOG_PATH,
    allowTotalHits: 0,
    endpoints: [
      '/api/shows',
      '/api/shows/[id]',
      '/api/shows/[id]/guest-list',
      '/api/shows/[id]/guest-list/export',
      '/api/guest-list/[id]',
      '/api/ai-intake',
    ],
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--days' || arg === '-d') {
      parsed.days = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--file' || arg === '-f') {
      parsed.file = argv[i + 1];
      i += 1;
    } else if (arg === '--allow-total-hits') {
      parsed.allowTotalHits = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--endpoints') {
      parsed.endpoints = String(argv[i + 1])
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage: node scripts/legacy-telemetry-deprecation-check.mjs [options]\n
Options:
  -d, --days <n>               Window length in days (default: 14)
  -f, --file <path>            NDJSON telemetry file path
      --allow-total-hits <n>   Allowed total hits in window (default: 0)
      --endpoints <csv>        Comma-separated endpoint list to evaluate
  -h, --help                   Show help\n
Exit codes:
  0 = PASS (safe to proceed with disable gate)
  1 = FAIL (threshold not met)
  2 = invalid args / processing error
`);
}

function toIso(value) {
  return new Date(value).toISOString();
}

const args = parseArgs(process.argv);

if (args.help) {
  printHelp();
  process.exit(0);
}

if (!Number.isFinite(args.days) || args.days <= 0) {
  console.error('Invalid --days value. Must be a positive number.');
  process.exit(2);
}

if (!Number.isFinite(args.allowTotalHits) || args.allowTotalHits < 0) {
  console.error('Invalid --allow-total-hits value. Must be >= 0.');
  process.exit(2);
}

try {
  const raw = await readFile(args.file, 'utf8');
  const now = Date.now();
  const windowStart = now - args.days * MS_PER_DAY;

  const events = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((event) => {
      const ts = Date.parse(event.timestamp);
      return Number.isFinite(ts) && ts >= windowStart;
    });

  const endpointMethodCounts = new Map();
  const endpointTotals = new Map();

  for (const endpoint of args.endpoints) endpointTotals.set(endpoint, 0);

  for (const event of events) {
    const endpoint = String(event.endpoint || 'unknown');
    const method = String(event.method || 'UNKNOWN');
    const key = `${endpoint} ${method}`;

    endpointMethodCounts.set(key, (endpointMethodCounts.get(key) || 0) + 1);

    if (endpointTotals.has(endpoint)) {
      endpointTotals.set(endpoint, (endpointTotals.get(endpoint) || 0) + 1);
    }
  }

  const totalHits = [...endpointTotals.values()].reduce((acc, count) => acc + count, 0);
  const endpointFailures = [...endpointTotals.entries()].filter(([, count]) => count > 0);
  const pass = totalHits <= args.allowTotalHits && endpointFailures.length === 0;

  console.log('Legacy endpoint deprecation telemetry check');
  console.log('------------------------------------------');
  console.log(`file: ${args.file}`);
  console.log(`windowDays: ${args.days}`);
  console.log(`windowStart: ${toIso(windowStart)}`);
  console.log(`windowEnd: ${toIso(now)}`);
  console.log(`allowTotalHits: ${args.allowTotalHits}`);
  console.log(`trackedEndpoints: ${args.endpoints.length}`);
  console.log('');

  console.log('Per-endpoint totals (window):');
  for (const endpoint of args.endpoints) {
    console.log(`- ${endpoint}: ${endpointTotals.get(endpoint) || 0}`);
  }

  console.log('');
  console.log('Per endpoint/method totals (window):');
  if (endpointMethodCounts.size === 0) {
    console.log('- none');
  } else {
    const sorted = [...endpointMethodCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [key, count] of sorted) {
      console.log(`- ${key}: ${count}`);
    }
  }

  console.log('');
  console.log(`TOTAL_HITS=${totalHits}`);
  console.log(`DEPRECATION_CHECK=${pass ? 'PASS' : 'FAIL'}`);

  process.exit(pass ? 0 : 1);
} catch (error) {
  console.error(`Unable to process telemetry file at ${args.file}`);
  if (error instanceof Error) console.error(error.message);
  process.exit(2);
}

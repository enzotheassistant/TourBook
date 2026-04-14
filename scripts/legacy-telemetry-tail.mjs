#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_LOG_PATH = path.join(process.cwd(), 'var', 'telemetry', 'legacy-endpoints.ndjson');
const logPath = process.env.LEGACY_TELEMETRY_FILE || DEFAULT_LOG_PATH;
const limit = Number(process.argv[2] || 50);

try {
  const raw = await readFile(logPath, 'utf8');
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
    .filter(Boolean);

  const last = events.slice(-limit);
  const summary = new Map();

  for (const event of last) {
    const key = `${event.endpoint} ${event.method}`;
    summary.set(key, (summary.get(key) || 0) + 1);
  }

  console.log(`File: ${logPath}`);
  console.log(`Showing ${last.length} of ${events.length} events\n`);
  console.log('Recent events:');
  for (const event of last) {
    console.log(JSON.stringify(event));
  }

  console.log('\nSummary (recent window):');
  for (const [key, count] of summary.entries()) {
    console.log(`${count}x ${key}`);
  }
} catch (error) {
  console.error(`Unable to read telemetry file at ${logPath}`);
  if (error instanceof Error) console.error(error.message);
  process.exit(1);
}

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const telemetryPath = process.env.INVITE_TELEMETRY_FILE || path.join(process.cwd(), 'var', 'telemetry', 'invites.ndjson');
const hoursArg = process.argv.find((arg) => arg.startsWith('--hours='));
const windowHours = Math.max(1, Number.parseInt(hoursArg?.split('=')[1] ?? '24', 10) || 24);
const windowStart = Date.now() - windowHours * 60 * 60 * 1000;

function safeParse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

try {
  const raw = await readFile(telemetryPath, 'utf8');
  const rows = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(safeParse)
    .filter(Boolean)
    .filter((row) => {
      const ts = new Date(String(row.timestamp ?? '')).getTime();
      return Number.isFinite(ts) && ts >= windowStart;
    });

  const failureRows = rows.filter((row) => row.event === 'invite.failed');
  const createdRows = rows.filter((row) => row.event === 'invite.created');
  const failureRatio = createdRows.length ? (failureRows.length / createdRows.length) * 100 : 0;

  const reasonCounts = new Map();
  for (const row of failureRows) {
    const reason = typeof row.reason === 'string' && row.reason.trim() ? row.reason.trim() : 'unknown';
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }

  console.log(`# Invite Failure Report (${windowHours}h)`);
  console.log('');
  console.log(`- Telemetry file: ${telemetryPath}`);
  console.log(`- Window start (UTC): ${new Date(windowStart).toISOString()}`);
  console.log(`- Invite created: ${createdRows.length}`);
  console.log(`- Invite failed: ${failureRows.length}`);
  console.log(`- Failure ratio: ${failureRatio.toFixed(1)}%`);
  console.log('');

  if (!failureRows.length) {
    console.log('No invite failures recorded in this window.');
    process.exit(0);
  }

  console.log('## Failure reasons');
  [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([reason, count]) => console.log(`- ${reason}: ${count}`));
} catch {
  console.log(`# Invite Failure Report (${windowHours}h)`);
  console.log('');
  console.log(`No telemetry rows found at ${telemetryPath}.`);
  console.log('Once invite telemetry exists, rerun:');
  console.log('node scripts/invite-failures-report.mjs --hours=24');
}

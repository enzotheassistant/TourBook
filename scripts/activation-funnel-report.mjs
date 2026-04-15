import { readFile } from 'node:fs/promises';
import path from 'node:path';

const telemetryPath = process.env.ACTIVATION_TELEMETRY_FILE || path.join(process.cwd(), 'var', 'telemetry', 'activation.ndjson');

function pct(num, den) {
  if (!den) return '0.0%';
  return `${((num / den) * 100).toFixed(1)}%`;
}

try {
  const raw = await readFile(telemetryPath, 'utf8');
  const rows = raw
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

  if (!rows.length) {
    console.log(`# Activation Funnel Report\n\nNo telemetry rows found at: ${telemetryPath}`);
    process.exit(0);
  }

  const eventCounts = new Map();
  const stateCounts = new Map();
  const ctaCounts = new Map();

  for (const row of rows) {
    eventCounts.set(row.event, (eventCounts.get(row.event) ?? 0) + 1);
    if (row.stateType) stateCounts.set(row.stateType, (stateCounts.get(row.stateType) ?? 0) + 1);
    if (row.cta) ctaCounts.set(row.cta, (ctaCounts.get(row.cta) ?? 0) + 1);
  }

  const rendered = eventCounts.get('activation.empty_state_rendered') ?? 0;
  const clicked = eventCounts.get('activation.create_cta_clicked') ?? 0;
  const success = eventCounts.get('activation.create_success') ?? 0;
  const failure = eventCounts.get('activation.create_failure') ?? 0;

  console.log('# Activation Funnel Report\n');
  console.log(`- Telemetry file: ${telemetryPath}`);
  console.log(`- Total events: ${rows.length}`);
  console.log('');
  console.log('## Funnel');
  console.log(`- Empty states rendered: ${rendered}`);
  console.log(`- CTA clicks: ${clicked} (${pct(clicked, rendered)} of renders)`);
  console.log(`- Create success: ${success} (${pct(success, clicked)} of CTA clicks)`);
  console.log(`- Create failure: ${failure} (${pct(failure, clicked)} of CTA clicks)`);
  console.log('');

  console.log('## Top Empty States');
  [...stateCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([state, count]) => console.log(`- ${state}: ${count}`));
  console.log('');

  console.log('## Top CTAs');
  [...ctaCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([cta, count]) => console.log(`- ${cta}: ${count}`));
} catch {
  console.log(`# Activation Funnel Report\n\nBootstrap mode: telemetry file not found yet at ${telemetryPath}.\n\nStart collecting data by exercising Crew/Admin first-run states, then rerun:\n\n\`node scripts/activation-funnel-report.mjs\``);
}

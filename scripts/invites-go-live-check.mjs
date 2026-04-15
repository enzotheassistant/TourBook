#!/usr/bin/env node
import { access, constants, stat } from 'node:fs/promises';
import path from 'node:path';

function env(name, fallback) {
  const value = process.env[name] ?? (fallback ? process.env[fallback] : undefined);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function masked(value) {
  if (!value) return 'missing';
  if (value.length <= 8) return 'set';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

const checks = [];

function addCheck(status, name, detail) {
  checks.push({ status, name, detail });
}

async function checkWritableDir(dirPath) {
  try {
    const info = await stat(dirPath);
    if (!info.isDirectory()) {
      addCheck('warn', 'Telemetry directory', `${dirPath} exists but is not a directory`);
      return;
    }
    await access(dirPath, constants.W_OK);
    addCheck('pass', 'Telemetry directory', `${dirPath} writable`);
  } catch {
    addCheck('warn', 'Telemetry directory', `${dirPath} not present/writable yet (created on first telemetry write)`);
  }
}

const provider = (env('INVITE_EMAIL_PROVIDER') || '').toLowerCase();
const supabaseUrl = env('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
const inviteFrom = env('INVITE_EMAIL_FROM');
const resendKey = env('RESEND_API_KEY');
const baseUrl = env('INVITE_APP_BASE_URL', 'NEXT_PUBLIC_APP_URL');
const telemetryFile = env('INVITE_TELEMETRY_FILE') || path.join(process.cwd(), 'var', 'telemetry', 'invites.ndjson');

if (supabaseUrl) {
  addCheck('pass', 'SUPABASE_URL', `set (${supabaseUrl})`);
} else {
  addCheck('fail', 'SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL', 'missing (required for maintenance scripts)');
}

if (serviceRoleKey) {
  addCheck('pass', 'SUPABASE_SERVICE_ROLE_KEY', `set (${masked(serviceRoleKey)})`);
} else {
  addCheck('fail', 'SUPABASE_SERVICE_ROLE_KEY', 'missing (required for invites:expire maintenance script)');
}

if (provider === 'resend') {
  addCheck('pass', 'INVITE_EMAIL_PROVIDER', 'resend (live email mode)');

  if (inviteFrom) {
    addCheck('pass', 'INVITE_EMAIL_FROM', `set (${inviteFrom})`);
  } else {
    addCheck('fail', 'INVITE_EMAIL_FROM', 'missing while provider=resend');
  }

  if (resendKey) {
    addCheck('pass', 'RESEND_API_KEY', `set (${masked(resendKey)})`);
  } else {
    addCheck('fail', 'RESEND_API_KEY', 'missing while provider=resend');
  }
} else {
  addCheck('warn', 'INVITE_EMAIL_PROVIDER', 'not "resend" (manual share + noop adapter mode)');
  addCheck('warn', 'Email transport mode', 'Invite creation still works; outbound emails are not sent by provider');
}

if (baseUrl) {
  addCheck('pass', 'INVITE_APP_BASE_URL / NEXT_PUBLIC_APP_URL', `set (${baseUrl})`);
} else {
  addCheck('warn', 'INVITE_APP_BASE_URL / NEXT_PUBLIC_APP_URL', 'unset (accept links fall back to request origin or http://localhost:3000)');
}

const telemetryDir = path.dirname(telemetryFile);
await checkWritableDir(telemetryDir);

console.log('# Invite Go-Live Preflight');
console.log('');
for (const check of checks) {
  const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
  console.log(`${icon} ${check.name}: ${check.detail}`);
}

const failCount = checks.filter((c) => c.status === 'fail').length;
const warnCount = checks.filter((c) => c.status === 'warn').length;

console.log('');
console.log(`Summary: ${checks.length} checks | ${failCount} fail | ${warnCount} warn`);
console.log('');
console.log('Suggested first commands:');
console.log('- npm run invites:go-live:check');
console.log('- npm run invites:expire');
console.log('- npm run invites:failures:report');

if (failCount > 0) {
  process.exit(1);
}

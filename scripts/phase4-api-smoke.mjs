#!/usr/bin/env node

/**
 * Phase 4 API smoke runner (staging)
 *
 * Required env:
 *   BASE_URL
 *   WORKSPACE_ID
 *   OTHER_WORKSPACE_ID
 *   PROJECT_ID
 *   DRAFT_DATE_ID
 *
 *   VIEWER_TOKEN
 *   EDITOR_TOKEN
 *   ADMIN_TOKEN
 *   OWNER_TOKEN
 */

const required = [
  'BASE_URL',
  'WORKSPACE_ID',
  'OTHER_WORKSPACE_ID',
  'PROJECT_ID',
  'DRAFT_DATE_ID',
  'VIEWER_TOKEN',
  'EDITOR_TOKEN',
  'ADMIN_TOKEN',
  'OWNER_TOKEN',
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error('Missing required env vars:', missing.join(', '));
  process.exit(2);
}

const baseUrl = process.env.BASE_URL.replace(/\/$/, '');

async function call(path, token) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

function hasDrafts(body) {
  return Array.isArray(body) && body.some((d) => String(d?.status) === 'draft');
}

function printResult(name, ok, detail) {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name} :: ${detail}`);
}

async function runRole(role, token) {
  const ws = process.env.WORKSPACE_ID;
  const otherWs = process.env.OTHER_WORKSPACE_ID;
  const projectId = process.env.PROJECT_ID;
  const draftDateId = process.env.DRAFT_DATE_ID;

  const dates = await call(`/api/dates?workspaceId=${ws}&projectId=${projectId}&includeDrafts=true`, token);
  const date = await call(`/api/dates/${draftDateId}?workspaceId=${ws}`, token);
  const guest = await call(`/api/dates/${draftDateId}/guest-list?workspaceId=${ws}`, token);
  const crossProjects = await call(`/api/projects?workspaceId=${otherWs}`, token);

  const expectDraftVisible = role !== 'viewer';
  printResult(
    `${role} list dates includeDrafts`,
    dates.status === 200 && (hasDrafts(dates.body) === expectDraftVisible),
    `status=${dates.status} draftsVisible=${hasDrafts(dates.body)}`,
  );

  const expectedDateStatus = role === 'viewer' ? 404 : 200;
  printResult(
    `${role} get draft date`,
    date.status === expectedDateStatus,
    `status=${date.status}`,
  );

  const expectedGuestStatus = role === 'viewer' ? 404 : 200;
  printResult(
    `${role} get draft date guest-list`,
    guest.status === expectedGuestStatus,
    `status=${guest.status}`,
  );

  printResult(
    `${role} cross-workspace projects denied`,
    crossProjects.status === 403,
    `status=${crossProjects.status}`,
  );
}

(async () => {
  await runRole('viewer', process.env.VIEWER_TOKEN);
  await runRole('editor', process.env.EDITOR_TOKEN);
  await runRole('admin', process.env.ADMIN_TOKEN);
  await runRole('owner', process.env.OWNER_TOKEN);
})();

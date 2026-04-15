import crypto from 'node:crypto';

export type WorkspaceInviteRole = 'admin' | 'editor' | 'viewer';

const INVITE_ALLOWED_ROLES: readonly WorkspaceInviteRole[] = ['admin', 'editor', 'viewer'];
const DEFAULT_EXPIRY_DAYS = 14;

export function normalizeInviteEmail(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase();
}

export function validateInviteRole(role: string | null | undefined): WorkspaceInviteRole {
  const normalized = String(role ?? '').trim().toLowerCase();
  if (!INVITE_ALLOWED_ROLES.includes(normalized as WorkspaceInviteRole)) {
    throw new Error('Invite role must be one of: admin, editor, viewer.');
  }
  return normalized as WorkspaceInviteRole;
}

export function buildInviteExpiry(nowInput = new Date(), days = DEFAULT_EXPIRY_DAYS) {
  const expiresAt = new Date(nowInput);
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt.toISOString();
}

export function generateInviteToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashInviteToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

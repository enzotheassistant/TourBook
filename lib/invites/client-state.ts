const NON_ACTIONABLE_INVITE_ERROR_PATTERNS = [
  'invite token is invalid',
  'invite has been revoked',
  'invite has expired',
  'invite email does not match your authenticated account',
  'invite scope is invalid',
] as const;

export function shouldClearInviteArtifactsOnError(message?: string | null) {
  const normalized = String(message ?? '').trim().toLowerCase();
  if (!normalized) return false;

  return NON_ACTIONABLE_INVITE_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function readInviteTokenFromSearch(search: string | URLSearchParams | null | undefined) {
  const params = typeof search === 'string'
    ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    : search instanceof URLSearchParams
      ? search
      : null;

  return (params?.get('inviteToken') || params?.get('token') || '').trim();
}

export function buildInviteContinuationHref(token: string) {
  const trimmed = token.trim();
  return trimmed ? `/accept-invite?token=${encodeURIComponent(trimmed)}` : '/';
}

export function buildLoginRedirectHref(search: string | URLSearchParams | null | undefined) {
  const inviteToken = readInviteTokenFromSearch(search);
  return inviteToken ? `/login?inviteToken=${encodeURIComponent(inviteToken)}` : '/login';
}

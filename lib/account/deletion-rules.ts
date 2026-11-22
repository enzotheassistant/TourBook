// Plain rules for deleting an account or a workspace. Kept free of imports so
// the node tests can load this file directly.

/** What the person has to type to confirm deleting their account. */
export const ACCOUNT_DELETE_CONFIRM_WORD = 'DELETE';

function squash(value: string) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

/** "DELETE" typed in the confirm box (any capitals, extra spaces ignored). */
export function isAccountDeleteConfirmed(typed: string) {
  return squash(typed).toUpperCase() === ACCOUNT_DELETE_CONFIRM_WORD;
}

/** The workspace name typed in the confirm box (capitals and extra spaces ignored). */
export function workspaceNameMatches(typed: string, actualName: string) {
  const want = squash(actualName).toLowerCase();
  return want.length > 0 && squash(typed).toLowerCase() === want;
}

/**
 * Owners can't delete their account while they own a workspace (handing a
 * workspace over comes later). Returns the message to show, or null if
 * deleting is allowed.
 */
export function accountDeletionBlocker(ownedWorkspaceNames: string[]) {
  const names = ownedWorkspaceNames.map(squash).filter(Boolean);
  if (!names.length) return null;
  const list = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const it = names.length === 1 ? 'that workspace' : 'those workspaces';
  return `You own ${list}. Delete ${it} first (Settings → Workspace), then you can delete your account.`;
}

/** Friendly message for a failed password check. */
export function passwordCheckMessage(rawMessage: string) {
  const text = String(rawMessage ?? '').toLowerCase();
  if (text.includes('for security purposes') || text.includes('rate limit') || text.includes('too many')) {
    return 'Too many tries in a short time. Please wait a minute and try again.';
  }
  return "That password isn't right.";
}

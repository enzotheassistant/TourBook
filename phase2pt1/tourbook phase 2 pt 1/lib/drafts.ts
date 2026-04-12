export const DRAFT_ID_PREFIX = 'draft--';

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function isDraftId(id: string | undefined | null) {
  return Boolean(id && id.startsWith(DRAFT_ID_PREFIX));
}

export function deriveShowStatus(id: string | undefined | null, status?: 'draft' | 'published') {
  if (status) return status;
  return isDraftId(id) ? 'draft' : 'published';
}

export function createDraftId(seed?: string) {
  const suffix = seed ? slugify(seed) : `show-${Date.now()}`;
  const nonce = Math.random().toString(36).slice(2, 8);
  return `${DRAFT_ID_PREFIX}${suffix || 'show'}-${nonce}`;
}

export function createPublishedId(city: string, venueName: string, date: string) {
  const cityPart = slugify(city || 'show');
  const venuePart = slugify(venueName || 'venue');
  return `${cityPart}-${venuePart}-${date || 'date'}`;
}

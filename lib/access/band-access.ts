// Per-band access: what a person can reach in one owner's workspace and at
// which level on each band ("project" in the code).
//
//   allProjects  — every band, including future ones, at one level
//   entries      — otherwise, one entry per band:
//                    { projectId, role, tourIds }   tourIds empty = whole band,
//                    otherwise only those tours.

export type BandRole = 'owner' | 'admin' | 'editor' | 'crew' | 'viewer';

export type BandAccessEntry = { projectId: string; role: BandRole; tourIds: string[] };

export type BandAccess =
  | { allProjects: true; role: BandRole; entries: [] }
  | { allProjects: false; role: BandRole | null; entries: BandAccessEntry[] };

const RANK: Record<BandRole, number> = { viewer: 1, crew: 2, editor: 3, admin: 4, owner: 5 };

export function roleRank(role: string | null | undefined) {
  return role && role in RANK ? RANK[role as BandRole] : 0;
}

export function higherRole(a: BandRole | null | undefined, b: BandRole | null | undefined): BandRole | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return roleRank(b) > roleRank(a) ? b : a;
}

export function highestRole(roles: Array<BandRole | null | undefined>): BandRole | null {
  return roles.reduce<BandRole | null>((best, role) => higherRole(best, role), null);
}

export function isManagerRole(role: string | null | undefined) {
  return role === 'owner' || role === 'admin' || role === 'editor';
}

/** Build a person's per-band access from the stored records. */
export function buildBandAccess(input: {
  scopeType: string | null | undefined;
  memberRole: BandRole;
  projectGrants: Array<{ projectId: string; role?: string | null }>;
  tourGrants: Array<{ projectId: string; tourId: string; role?: string | null }>;
}): BandAccess {
  const scope = String(input.scopeType ?? 'workspace').trim().toLowerCase() || 'workspace';
  if (scope === 'workspace') return { allProjects: true, role: input.memberRole, entries: [] };

  const byProject = new Map<string, BandAccessEntry & { whole: boolean }>();
  for (const grant of input.projectGrants) {
    if (!grant.projectId) continue;
    const role = (grant.role as BandRole | null) || input.memberRole;
    const current = byProject.get(grant.projectId);
    byProject.set(grant.projectId, {
      projectId: grant.projectId,
      role: higherRole(current?.role, role) as BandRole,
      tourIds: [],
      whole: true,
    });
  }
  for (const grant of input.tourGrants) {
    if (!grant.projectId || !grant.tourId) continue;
    const role = (grant.role as BandRole | null) || input.memberRole;
    const current = byProject.get(grant.projectId);
    if (current?.whole) {
      current.role = higherRole(current.role, role) as BandRole;
      continue;
    }
    byProject.set(grant.projectId, {
      projectId: grant.projectId,
      role: higherRole(current?.role, role) as BandRole,
      tourIds: [...new Set([...(current?.tourIds ?? []), grant.tourId])],
      whole: false,
    });
  }
  const entries = [...byProject.values()].map(({ projectId, role, tourIds }) => ({ projectId, role, tourIds }));
  return { allProjects: false, role: highestRole(entries.map((entry) => entry.role)), entries };
}

/** The level on one band, or null when the person can't open it. */
export function roleForProject(access: BandAccess, projectId: string | null | undefined): BandRole | null {
  if (!projectId) return null;
  if (access.allProjects) return access.role;
  return access.entries.find((entry) => entry.projectId === projectId)?.role ?? null;
}

/** Can the person reach a date on this band (and tour, if the date has one)? */
export function canReachDate(access: BandAccess, projectId: string, tourId: string | null | undefined) {
  if (access.allProjects) return true;
  const entry = access.entries.find((item) => item.projectId === projectId);
  if (!entry) return false;
  if (!entry.tourIds.length) return true;
  return !!tourId && entry.tourIds.includes(tourId);
}

/** Clean up an access list from a form: drop empties, one entry per band. */
export function normalizeEntries(entries: Array<{ projectId?: unknown; role?: unknown; tourIds?: unknown }>): BandAccessEntry[] {
  const byProject = new Map<string, BandAccessEntry>();
  for (const raw of entries ?? []) {
    const projectId = String(raw?.projectId ?? '').trim();
    const role = String(raw?.role ?? '').trim() as BandRole;
    if (!projectId || !(role in RANK) || role === 'owner') continue;
    const tourIds = Array.isArray(raw?.tourIds)
      ? [...new Set((raw.tourIds as unknown[]).map((id) => String(id ?? '').trim()).filter(Boolean))]
      : [];
    byProject.set(projectId, { projectId, role, tourIds });
  }
  return [...byProject.values()];
}

/**
 * Combine existing access with newly granted access (e.g. accepting a second
 * invite). Never lowers anything: higher level wins; whole band beats some
 * tours; tour lists are combined.
 */
export function mergeAccess(current: BandAccess | null, granted: BandAccess): BandAccess {
  if (!current) return granted;
  if (current.allProjects || granted.allProjects) {
    // "All projects" can only hold one level, so keep the best one they had
    // anywhere (same as before per-band levels existed): nothing gets lowered.
    return { allProjects: true, role: highestRole([current.role, granted.role]) as BandRole, entries: [] };
  }
  const byProject = new Map(current.entries.map((entry) => [entry.projectId, { ...entry, tourIds: [...entry.tourIds] }]));
  for (const entry of granted.entries) {
    const existing = byProject.get(entry.projectId);
    if (!existing) {
      byProject.set(entry.projectId, { ...entry, tourIds: [...entry.tourIds] });
      continue;
    }
    existing.role = higherRole(existing.role, entry.role) as BandRole;
    if (!existing.tourIds.length || !entry.tourIds.length) existing.tourIds = [];
    else existing.tourIds = [...new Set([...existing.tourIds, ...entry.tourIds])];
  }
  const entries = [...byProject.values()];
  return { allProjects: false, role: highestRole(entries.map((entry) => entry.role)), entries };
}

/**
 * A Manager edits someone's access: only the bands the Manager manages change;
 * every other band the person has is kept exactly as it was.
 */
export function applyManagerEdits(input: {
  current: BandAccess;
  edits: BandAccessEntry[];
  managedProjectIds: string[];
}): BandAccess {
  if (input.current.allProjects) return input.current;
  const managed = new Set(input.managedProjectIds);
  const kept = input.current.entries.filter((entry) => !managed.has(entry.projectId));
  const changed = input.edits.filter((entry) => managed.has(entry.projectId));
  const entries = [...kept, ...changed];
  return { allProjects: false, role: highestRole(entries.map((entry) => entry.role)), entries };
}

/** Bands that appear in `next` but not in `previous` (for "you've been added" emails). */
export function newlyAddedProjects(previous: BandAccess | null, next: BandAccess): string[] {
  if (next.allProjects) return [];
  const before = new Set(previous && !previous.allProjects ? previous.entries.map((entry) => entry.projectId) : []);
  if (previous?.allProjects) return [];
  return next.entries.map((entry) => entry.projectId).filter((projectId) => !before.has(projectId));
}

/** How to store it: member/invite level, scope, and the per-band records. */
export function toStoredAccess(access: BandAccess) {
  if (access.allProjects) {
    return { role: access.role, scopeType: 'workspace' as const, projectRows: [], tourRows: [] };
  }
  const projectRows = access.entries.filter((entry) => !entry.tourIds.length).map((entry) => ({ projectId: entry.projectId, role: entry.role }));
  const tourRows = access.entries.flatMap((entry) => entry.tourIds.map((tourId) => ({ projectId: entry.projectId, tourId, role: entry.role })));
  return {
    role: access.role,
    scopeType: (projectRows.length || !tourRows.length ? 'projects' : 'tours') as 'projects' | 'tours',
    projectRows,
    tourRows,
  };
}

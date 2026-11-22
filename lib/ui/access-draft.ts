// The per-band access list on the invite form and in "Edit access".
// Each band: No access, Viewer, Crew or Manager — and optionally only some
// tours. Or one level for all projects (including future ones).

import type { BandAccess } from '../access/band-access';

export type DraftRole = 'viewer' | 'crew' | 'editor';
export type DraftBand = { role: DraftRole | 'none'; /** null = whole band */ tourIds: string[] | null };
export type AccessDraft = { allProjects: boolean; allRole: DraftRole; bands: Record<string, DraftBand> };

function toDraftRole(role: string | null | undefined): DraftRole {
  if (role === 'editor' || role === 'admin' || role === 'owner') return 'editor';
  if (role === 'crew') return 'crew';
  return 'viewer';
}

/** A fresh invite: Viewer on one band (the one you're on), or nothing picked yet. */
export function draftForProject(projectId: string | null | undefined, role: DraftRole = 'viewer'): AccessDraft {
  return { allProjects: false, allRole: role, bands: projectId ? { [projectId]: { role, tourIds: null } } : {} };
}

/** Start "Edit access" from someone's current access. */
export function draftFromAccess(access: BandAccess | undefined | null): AccessDraft {
  if (!access) return draftForProject(null);
  if (access.allProjects) return { allProjects: true, allRole: toDraftRole(access.role), bands: {} };
  const bands: Record<string, DraftBand> = {};
  for (const entry of access.entries) {
    bands[entry.projectId] = { role: toDraftRole(entry.role), tourIds: entry.tourIds.length ? [...entry.tourIds] : null };
  }
  return { allProjects: false, allRole: toDraftRole(access.role), bands };
}

export function setBandRole(draft: AccessDraft, projectId: string, role: DraftRole | 'none'): AccessDraft {
  const current = draft.bands[projectId] ?? { role: 'none', tourIds: null };
  return { ...draft, bands: { ...draft.bands, [projectId]: { ...current, role } } };
}

export function setBandTours(draft: AccessDraft, projectId: string, tourIds: string[] | null): AccessDraft {
  const current = draft.bands[projectId] ?? { role: 'viewer', tourIds: null };
  return { ...draft, bands: { ...draft.bands, [projectId]: { ...current, tourIds } } };
}

/** What gets sent to the server. */
export function draftToAccessPayload(draft: AccessDraft) {
  if (draft.allProjects) return { allProjects: true as const, role: draft.allRole };
  const entries = Object.entries(draft.bands)
    .filter(([, band]) => band.role !== 'none')
    .map(([projectId, band]) => ({ projectId, role: band.role as DraftRole, tourIds: band.tourIds ?? [] }));
  return { allProjects: false as const, entries };
}

/** A plain-language problem with the choices, or null if it's fine to save. */
export function draftProblem(draft: AccessDraft, projectNameById: Map<string, string>, options: { allowEmpty?: boolean } = {}): string | null {
  if (draft.allProjects) return null;
  const chosen = Object.entries(draft.bands).filter(([, band]) => band.role !== 'none');
  if (!chosen.length && !options.allowEmpty) return 'Choose a level for at least one project.';
  for (const [projectId, band] of chosen) {
    if (band.tourIds && band.tourIds.length === 0) {
      return `Pick at least one tour for ${projectNameById.get(projectId) ?? 'that project'}, or choose the whole project.`;
    }
  }
  return null;
}

const LABEL: Record<string, string> = { owner: 'Owner', admin: 'Manager', editor: 'Manager', crew: 'Crew', viewer: 'Viewer' };

/**
 * One short line for the "All projects" Team view, e.g.
 * "Crew on Texas King · Manager on Test Band", or with many bands
 * "Manager on 1 project · Viewer on 3". Never a long list.
 */
export function summarizeBandAccess(access: BandAccess | undefined | null, projectNameById: Map<string, string>): string {
  if (!access) return '';
  if (access.allProjects) return `All projects · ${LABEL[access.role] ?? ''}`;
  const entries = access.entries;
  if (!entries.length) return 'No projects';
  const withTours = (entry: { tourIds: string[] }) => (entry.tourIds.length ? ` (${entry.tourIds.length} ${entry.tourIds.length === 1 ? 'tour' : 'tours'})` : '');
  if (entries.length <= 2) {
    return entries
      .map((entry) => `${LABEL[entry.role] ?? ''} on ${projectNameById.get(entry.projectId) ?? 'a project'}${withTours(entry)}`)
      .join(' · ');
  }
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const label = LABEL[entry.role] ?? '';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const order = ['Manager', 'Crew', 'Viewer'];
  const parts = order.filter((label) => counts.has(label)).map((label, index) => {
    const count = counts.get(label) as number;
    return index === 0 ? `${label} on ${count} ${count === 1 ? 'project' : 'projects'}` : `${label} on ${count}`;
  });
  return parts.join(' · ');
}

/** Change one band's level, keeping everything else as it is (Team page dropdown). */
export function accessWithBandRole(access: BandAccess | undefined | null, projectId: string, role: DraftRole) {
  if (!access || access.allProjects) return { allProjects: true as const, role };
  return {
    allProjects: false as const,
    entries: access.entries.map((entry) => ({
      projectId: entry.projectId,
      role: entry.projectId === projectId ? role : entry.role,
      tourIds: entry.tourIds,
    })),
  };
}

/** Remove one band, keeping everything else (Team page "Remove from this project"). */
export function accessWithoutBand(access: BandAccess | undefined | null, projectId: string) {
  if (!access || access.allProjects) return null;
  return {
    allProjects: false as const,
    entries: access.entries.filter((entry) => entry.projectId !== projectId).map((entry) => ({ projectId: entry.projectId, role: entry.role, tourIds: entry.tourIds })),
  };
}

'use client';

import type { ProjectSummary, TourSummary } from '@/lib/types/tenant';
import { roleDescription } from '@/lib/roles';
import { setBandRole, setBandTours, type AccessDraft, type DraftRole } from '@/lib/ui/access-draft';

const SELECT_CLASS =
  'h-10 w-[8.75rem] shrink-0 rounded-[10px] border border-white/10 bg-black/20 px-3 pr-7 text-sm text-zinc-100 outline-none transition focus:border-accent/40';

/**
 * Per-band access: a level for each band (No access / Viewer / Crew / Manager),
 * optionally limited to some tours — or one level for all projects.
 * Used by the invite form and "Edit access".
 */
export function AccessEditor({
  draft,
  onChange,
  projects,
  tours,
  allowAllProjects,
  idPrefix,
}: {
  draft: AccessDraft;
  onChange: (next: AccessDraft) => void;
  /** Bands the person editing can hand out (a Manager only sees the ones they manage). */
  projects: ProjectSummary[];
  tours: TourSummary[];
  /** Owners (and all-projects Managers) can give access to every band at once. */
  allowAllProjects: boolean;
  idPrefix: string;
}) {
  return (
    <div className="space-y-3">
      {allowAllProjects ? (
        <div className="flex min-h-10 items-center gap-3 rounded-[10px] border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-200">
          <label htmlFor={`${idPrefix}-all-projects`} className="flex min-w-0 flex-1 items-center gap-3">
            <input
              id={`${idPrefix}-all-projects`}
              type="checkbox"
              checked={draft.allProjects}
              onChange={(event) => onChange({ ...draft, allProjects: event.target.checked })}
              className="h-4 w-4 shrink-0 rounded border-white/20 bg-black/20"
            />
            <span className="min-w-0">
              <span className="block">All projects</span>
              <span className="block text-xs text-zinc-500">Including any you add later</span>
            </span>
          </label>
          {draft.allProjects ? (
            <select
              value={draft.allRole}
              onChange={(event) => onChange({ ...draft, allRole: event.target.value as DraftRole })}
              aria-label="Level on all projects"
              className={SELECT_CLASS}
            >
              <option value="viewer">Viewer</option>
              <option value="crew">Crew</option>
              <option value="editor">Manager</option>
            </select>
          ) : null}
        </div>
      ) : null}

      {!draft.allProjects ? (
        projects.length ? (
          <ul className="divide-y divide-white/[0.06] rounded-[10px] border border-white/10">
            {projects.map((project) => {
              const band = draft.bands[project.id] ?? { role: 'none' as const, tourIds: null };
              const projectTours = tours.filter((tour) => tour.projectId === project.id && !tour.archivedAt);
              const hasAccess = band.role !== 'none';
              const limited = band.tourIds !== null;
              const name = project.name || project.slug || project.id;
              return (
                <li key={project.id} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm ${hasAccess ? 'text-zinc-100' : 'text-zinc-400'}`}>{name}</p>
                      {hasAccess && projectTours.length ? (
                        <button
                          type="button"
                          onClick={() => onChange(setBandTours(draft, project.id, limited ? null : []))}
                          className="text-left text-xs text-accent-light transition hover:text-accent"
                        >
                          {limited ? 'Some tours · Change' : 'Whole project · Change'}
                        </button>
                      ) : null}
                    </div>
                    <select
                      value={band.role}
                      onChange={(event) => onChange(setBandRole(draft, project.id, event.target.value as DraftRole | 'none'))}
                      aria-label={`Level on ${name}`}
                      className={`${SELECT_CLASS} ${hasAccess ? '' : 'text-zinc-400'}`}
                    >
                      <option value="none">No access</option>
                      <option value="viewer">Viewer</option>
                      <option value="crew">Crew</option>
                      <option value="editor">Manager</option>
                    </select>
                  </div>
                  {hasAccess && limited ? (
                    <fieldset className="mt-2 space-y-1 pl-1">
                      <legend className="sr-only">Tours on {name}</legend>
                      {projectTours.map((tour) => {
                        const checked = (band.tourIds ?? []).includes(tour.id);
                        return (
                          <label key={tour.id} htmlFor={`${idPrefix}-${tour.id}`} className="flex min-h-9 items-center gap-2 text-sm text-zinc-300">
                            <input
                              id={`${idPrefix}-${tour.id}`}
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const current = band.tourIds ?? [];
                                onChange(setBandTours(draft, project.id, checked ? current.filter((id) => id !== tour.id) : [...current, tour.id]));
                              }}
                              className="h-4 w-4 rounded border-white/20 bg-black/20"
                            />
                            <span className="truncate">{tour.name || tour.id}</span>
                          </label>
                        );
                      })}
                    </fieldset>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-zinc-400">There are no projects you can give access to yet.</p>
        )
      ) : null}

      <ul className="space-y-0.5 text-xs text-zinc-500">
        <li>Viewer: {roleDescription('viewer')}</li>
        <li>Crew: {roleDescription('crew')}</li>
        <li>Manager: {roleDescription('editor')}</li>
      </ul>
    </div>
  );
}

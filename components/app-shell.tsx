'use client';

import Link from 'next/link';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { LogoutButton } from '@/components/logout-button';
import { useAppContext } from '@/hooks/use-app-context';
import { canSwitchProject, getProjectsForWorkspace, pickNextProjectId } from '@/lib/ui/project-context';

function ghostButtonClassName() {
  return 'inline-flex h-10 items-center rounded-full border border-white/10 bg-transparent px-4 text-sm font-medium text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.05]';
}

function iconButtonClassName() {
  return 'inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-transparent text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.05]';
}

function ProjectSwitchSheet({ open, onClose, projects, activeProjectId, onSelect }: { open: boolean; onClose: () => void; projects: Array<{ id: string; name: string; slug: string | null }>; activeProjectId: string | null; onSelect: (projectId: string) => void; }) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!panelRef.current) return;
      const target = event.target as Node | null;
      if (target && !panelRef.current.contains(target)) {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-start sm:justify-end sm:p-4" role="dialog" aria-modal="true" aria-label="Switch project">
      <button type="button" className="absolute inset-0 bg-black/60" onClick={onClose} aria-label="Close project switcher" />
      <div ref={panelRef} className="relative z-10 w-full max-h-[78dvh] overflow-hidden rounded-t-3xl border border-white/10 bg-zinc-950 px-4 pb-4 pt-3 shadow-2xl sm:mt-16 sm:w-[340px] sm:max-h-[70vh] sm:rounded-2xl">
        <div className="mb-2 h-1.5 w-10 rounded-full bg-white/20 sm:hidden" aria-hidden="true" />
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-zinc-100">Switch project</p>
          <button type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200" aria-label="Close">
            ×
          </button>
        </div>
        <div className="min-h-0 space-y-2 overflow-y-auto pr-1 max-h-[calc(78dvh-120px)] sm:max-h-[calc(70vh-120px)]">
          {projects.map((project) => {
            const active = project.id === activeProjectId;
            return (
              <button
                key={project.id}
                type="button"
                onClick={() => onSelect(project.id)}
                className={`flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left text-sm transition ${active ? 'border-emerald-400/45 bg-emerald-500/12 text-emerald-200' : 'border-white/10 bg-white/[0.02] text-zinc-100 hover:border-white/20 hover:bg-white/[0.05]'}`}
                aria-pressed={active}
              >
                <span className="min-w-0 truncate">{project.name || project.slug || project.id}</span>
                {active ? <span className="ml-2 text-xs font-semibold uppercase tracking-wide">Current</span> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AdminProjectSelector() {
  const { activeWorkspaceId, activeProjectId, projects, setActiveProjectId } = useAppContext();
  const scopedProjects = useMemo(() => getProjectsForWorkspace(projects, activeWorkspaceId), [projects, activeWorkspaceId]);
  const currentProject = scopedProjects.find((project) => project.id === activeProjectId) ?? scopedProjects[0] ?? null;

  if (!currentProject) return null;

  return (
    <div className="pt-1">
      <label htmlFor="admin-project-selector" className="sr-only">Active project</label>
      <select
        id="admin-project-selector"
        value={currentProject.id}
        onChange={(event) => {
          const next = pickNextProjectId(activeProjectId, event.target.value, scopedProjects);
          if (next !== activeProjectId) setActiveProjectId(next);
        }}
        className="h-8 max-w-[260px] rounded-lg border border-white/15 bg-white/[0.03] px-2 text-xs text-zinc-200 outline-none transition hover:border-white/25 focus:border-white/30"
      >
        {scopedProjects.map((project) => (
          <option key={project.id} value={project.id} className="bg-zinc-900 text-zinc-100">
            {project.name || project.slug || project.id}
          </option>
        ))}
      </select>
    </div>
  );
}

function ProjectSwitchControl() {
  const { activeWorkspaceId, activeProjectId, projects, setActiveProjectId } = useAppContext();
  const [open, setOpen] = useState(false);
  const scopedProjects = useMemo(() => getProjectsForWorkspace(projects, activeWorkspaceId), [projects, activeWorkspaceId]);
  const showSwitch = canSwitchProject(projects, activeWorkspaceId);
  const currentProject = scopedProjects.find((project) => project.id === activeProjectId) ?? scopedProjects[0] ?? null;

  function handleSelect(projectId: string) {
    const next = pickNextProjectId(activeProjectId, projectId, scopedProjects);
    if (next !== activeProjectId) setActiveProjectId(next);
    setOpen(false);
  }

  if (!currentProject || !showSwitch) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 max-w-[55vw] items-center gap-1 rounded-full border border-white/10 bg-transparent px-3 text-xs font-medium text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.05] hover:text-zinc-100 sm:h-8 sm:max-w-[220px]"
        aria-label="Switch project"
        title={currentProject.name || currentProject.slug || currentProject.id}
      >
        <span className="truncate">{currentProject.name || currentProject.slug || currentProject.id}</span>
        <span aria-hidden="true" className="text-zinc-500">▾</span>
      </button>
      <ProjectSwitchSheet open={open} onClose={() => setOpen(false)} projects={scopedProjects} activeProjectId={activeProjectId} onSelect={handleSelect} />
    </>
  );
}

function CrewMenu({ activeTab }: { activeTab: 'upcoming' | 'past' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handle(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-transparent text-xl text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.05]" aria-label="Open menu">
        …
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-2 min-w-[180px] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl">
          <Link href={activeTab === 'upcoming' ? '/?tab=past' : '/?tab=upcoming'} className="block border-b border-white/5 px-4 py-3 text-sm text-zinc-100" onClick={() => setOpen(false)}>
            {activeTab === 'upcoming' ? 'Past' : 'Upcoming'}
          </Link>
          <div className="border-b border-white/10" />
          <Link href="/admin" className="block border-b border-white/5 px-4 py-3 text-sm text-zinc-100" onClick={() => setOpen(false)}>
            Admin
          </Link>
          <div className="px-2 py-2">
            <LogoutButton compact />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HeaderActionMenu({ actionHref, actionLabel }: { actionHref: string; actionLabel: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handle(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-transparent text-xl text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.05]"
        aria-label="Open account menu"
      >
        …
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-2 min-w-[180px] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl">
          <Link href={actionHref} className="block border-b border-white/5 px-4 py-3 text-sm text-zinc-100" onClick={() => setOpen(false)}>
            {actionLabel}
          </Link>
          <div className="px-2 py-2">
            <LogoutButton compact />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({
  children,
  activeTab = 'upcoming',
  mode = 'crew',
  title = 'TourBook',
  subtitle = 'Touring crew dashboard',
  showSubtitle = true,
}: {
  children: ReactNode;
  activeTab?: 'upcoming' | 'past';
  mode?: 'crew' | 'admin';
  title?: string;
  subtitle?: string;
  showSubtitle?: boolean;
}) {
  const pathname = usePathname();
  const { activeWorkspaceId, activeProjectId, projects } = useAppContext();
  const actionHref = mode === 'admin' ? '/' : '/admin';
  const actionLabel = mode === 'admin' ? 'Crew View' : 'Admin';
  const isCrewList = mode === 'crew' && pathname === '/';
  const scopedProjects = useMemo(() => getProjectsForWorkspace(projects, activeWorkspaceId), [projects, activeWorkspaceId]);
  const currentProject = scopedProjects.find((project) => project.id === activeProjectId) ?? scopedProjects[0] ?? null;
  const displayTitle = mode === 'crew' ? (currentProject?.name || currentProject?.slug || title) : title;
  const shouldShowSubtitle = mode === 'admin' ? showSubtitle : false;

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-zinc-950 text-zinc-50">
      <header className="sticky top-0 z-20 bg-zinc-950/94 backdrop-blur">
        <div className={`mx-auto flex w-full max-w-5xl flex-col px-4 ${mode === 'admin' ? 'pt-3' : 'pt-4'} sm:px-6`}>
          <div className={`flex items-start justify-between gap-3 ${mode === 'admin' ? 'pb-3' : 'pb-4'}`}>
            <div className="min-w-0 flex-1 space-y-2">
              <Link href={mode === 'admin' ? '/admin' : '/'} className="text-2xl font-semibold tracking-tight text-zinc-50">
                {displayTitle}
              </Link>
              {shouldShowSubtitle ? <p className="mt-1 text-xs text-zinc-500 sm:text-sm">{subtitle}</p> : null}
              {mode === 'admin' ? <AdminProjectSelector /> : null}
            </div>

            {isCrewList ? (
              <div className="flex shrink-0 items-center gap-2">
                {activeTab === 'past' ? (
                  <Link href="/?tab=upcoming" className={iconButtonClassName()} aria-label="Back to upcoming dates">
                    ←
                  </Link>
                ) : null}
                <ProjectSwitchControl />
                <CrewMenu activeTab={activeTab} />
              </div>
            ) : (
              <>
                <div className="flex shrink-0 items-center gap-2 self-start sm:hidden">
                  {mode === 'admin' ? null : <ProjectSwitchControl />}
                  <HeaderActionMenu actionHref={actionHref} actionLabel={actionLabel} />
                </div>
                <div className="hidden shrink-0 items-center gap-2 self-start sm:flex">
                  {mode === 'admin' ? null : <ProjectSwitchControl />}
                  <Link href={actionHref} className={ghostButtonClassName()}>
                    {actionLabel}
                  </Link>
                  <LogoutButton />
                </div>
              </>
            )}
          </div>
          {mode === 'crew' ? <div className="border-t border-white/10" /> : null}
          {mode === 'admin' ? <div className="py-2" /> : null}
        </div>
      </header>

      <main className={`mx-auto flex w-full max-w-5xl flex-col ${mode === 'admin' ? 'gap-3 py-3' : 'gap-4 py-4'} px-4 sm:px-6`}>{children}</main>
    </div>
  );
}

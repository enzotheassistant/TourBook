'use client';

import Link from 'next/link';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { LogoutButton } from '@/components/logout-button';
import { PickerHeading } from '@/components/picker-menu';
import { useAppContext } from '@/hooks/use-app-context';
import { canAccessAdminWorkspace, getWorkspaceRole, hasAnyAdminAccess } from '@/lib/roles';
import { canSwitchProject, getProjectsForWorkspace, pickNextProjectId } from '@/lib/ui/project-context';
import { CalendarIcon, EyeIcon, MoreIcon, SettingsIcon, UsersIcon } from '@/components/icons';
import { AppShellSkeleton } from '@/components/skeleton';

function ghostButtonClassName() {
  return 'inline-flex h-10 items-center rounded-[10px] border border-white/10 bg-transparent px-4 text-sm font-medium text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.05]';
}

/** Admin header: which project you're working in. A picker when there's more than one. */
function AdminProjectSelector() {
  const { activeWorkspaceId, activeProjectId, projects, setActiveProjectId } = useAppContext();
  const scopedProjects = useMemo(() => getProjectsForWorkspace(projects, activeWorkspaceId), [projects, activeWorkspaceId]);
  const currentProject = scopedProjects.find((project) => project.id === activeProjectId) ?? scopedProjects[0] ?? null;

  if (!currentProject) return null;
  const currentName = currentProject.name || currentProject.slug || currentProject.id;

  if (scopedProjects.length < 2) {
    return <p className="truncate text-sm text-zinc-400">{currentName}</p>;
  }

  return (
    <div className="flex min-w-0 flex-1">
      <PickerHeading
        title="Switch project"
        className="text-sm text-zinc-300"
        options={scopedProjects.map((project) => ({ value: project.id, label: project.name || project.slug || project.id }))}
        selected={currentProject.id}
        onSelect={(projectId) => {
          const next = pickNextProjectId(activeProjectId, projectId, scopedProjects);
          if (next !== activeProjectId) setActiveProjectId(next);
        }}
      >
        {currentName}
      </PickerHeading>
    </div>
  );
}

/**
 * The big title on the left of the crew header: the current project's name.
 * With more than one project it becomes the project switcher ("Texas King ▾");
 * with just one it's a plain title.
 */
function ProjectTitle({ fallbackTitle }: { fallbackTitle: string }) {
  const { activeWorkspaceId, activeProjectId, projects, setActiveProjectId } = useAppContext();
  const scopedProjects = useMemo(() => getProjectsForWorkspace(projects, activeWorkspaceId), [projects, activeWorkspaceId]);
  const currentProject = scopedProjects.find((project) => project.id === activeProjectId) ?? scopedProjects[0] ?? null;
  const title = currentProject?.name || currentProject?.slug || fallbackTitle;
  const titleClassName = 'text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl';

  if (!currentProject || !canSwitchProject(projects, activeWorkspaceId)) {
    return <h1 className={`min-w-0 flex-1 truncate ${titleClassName}`}>{title}</h1>;
  }

  return (
    <h1 className="flex min-w-0 flex-1">
      <PickerHeading
        title="Switch project"
        className={titleClassName}
        caretClassName="h-5 w-5 sm:h-6 sm:w-6"
        options={scopedProjects.map((project) => ({ value: project.id, label: project.name || project.slug || project.id }))}
        selected={currentProject.id}
        onSelect={(projectId) => {
          const next = pickNextProjectId(activeProjectId, projectId, scopedProjects);
          if (next !== activeProjectId) setActiveProjectId(next);
        }}
      >
        {title}
      </PickerHeading>
    </h1>
  );
}

function CrewMenu({ showAdminLink }: { showAdminLink: boolean }) {
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
        <MoreIcon />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-2 min-w-[180px] overflow-hidden rounded-xl border border-white/10 bg-zinc-950 shadow-2xl">
          {showAdminLink ? (
            <Link href="/admin" className="block border-b border-white/5 px-4 py-3 text-sm text-zinc-100 transition hover:bg-white/[0.04]" onClick={() => setOpen(false)}>
              Admin
            </Link>
          ) : null}
          <LogoutButton variant="menu" />
        </div>
      ) : null}
    </div>
  );
}

type HeaderMenuItem = { href: string; label: string; active?: boolean };

function HeaderActionMenu({ actionHref, actionLabel, extraItems = [] }: { actionHref: string; actionLabel: string; extraItems?: HeaderMenuItem[] }) {
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
        <MoreIcon />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-2 min-w-[180px] overflow-hidden rounded-xl border border-white/10 bg-zinc-950 shadow-2xl">
          {extraItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={`flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3 text-sm transition hover:bg-white/[0.04] ${item.active ? 'text-accent-light' : 'text-zinc-100'}`}
              onClick={() => setOpen(false)}
            >
              {item.label}
              {item.active ? <span className="h-1.5 w-1.5 rounded-full bg-accent-light" aria-hidden="true" /> : null}
            </Link>
          ))}
          {extraItems.length ? <div className="border-b border-white/10" aria-hidden="true" /> : null}
          <Link href={actionHref} className="block border-b border-white/5 px-4 py-3 text-sm text-zinc-100 transition hover:bg-white/[0.04]" onClick={() => setOpen(false)}>
            {actionLabel}
          </Link>
          <LogoutButton variant="menu" />
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({
  children,
  mode = 'crew',
  title = 'TourBook',
  subtitle = 'Touring crew dashboard',
  showSubtitle = true,
}: {
  children: ReactNode;
  /** No longer used by the header (Upcoming/Past is chosen from the dates heading); still accepted so callers don't change. */
  activeTab?: 'upcoming' | 'past';
  mode?: 'crew' | 'admin';
  title?: string;
  subtitle?: string;
  showSubtitle?: boolean;
}) {
  const pathname = usePathname();
  const { activeWorkspaceId, activeProjectId, projects, memberships, user, isLoading } = useAppContext();
  
  const activeWorkspaceRole = useMemo(() => getWorkspaceRole(memberships, activeWorkspaceId), [memberships, activeWorkspaceId]);
  const showAdminLink = mode === 'admin'
    ? true
    : canAccessAdminWorkspace(activeWorkspaceRole) || hasAnyAdminAccess(memberships);
  const actionHref = mode === 'admin' ? '/' : '/admin';
  const actionLabel = mode === 'admin' ? 'Crew view' : 'Admin';
  const isCrewList = mode === 'crew' && pathname === '/';
  const scopedProjects = useMemo(() => getProjectsForWorkspace(projects, activeWorkspaceId), [projects, activeWorkspaceId]);
  const currentProject = scopedProjects.find((project) => project.id === activeProjectId) ?? scopedProjects[0] ?? null;
  const displayTitle = mode === 'crew' ? (currentProject?.name || currentProject?.slug || title) : title;
  const shouldShowSubtitle = mode === 'admin' ? showSubtitle : false;
  // Admin sections: Dates (with Drafts inside), Team (people and access), Settings
  // (projects, workspace, your account / log out).
  const adminNavItems = [
    { href: '/admin/dates', label: 'Dates', icon: <CalendarIcon />, active: pathname === '/admin/dates' || pathname === '/admin/drafts' || pathname === '/admin/new' || pathname === '/admin' },
    ...(canAccessAdminWorkspace(activeWorkspaceRole) ? [{ href: '/admin/team', label: 'Team', icon: <UsersIcon />, active: pathname === '/admin/team' }] : []),
    { href: '/admin/settings', label: 'Settings', icon: <SettingsIcon />, active: pathname === '/admin/settings' || pathname === '/admin/projects' },
  ];
  const adminEditorOpen = pathname === '/admin/new' || pathname === '/admin';
  const showAdminBottomBar = mode === 'admin' && !adminEditorOpen;
  const headerRef = useRef<HTMLElement | null>(null);
  const isReady = Boolean(user) && !isLoading;

  // Share the header's real height so things that stick below it (like the
  // year dividers on Past dates) line up, whatever the header's height.
  useEffect(() => {
    const header = headerRef.current;
    if (!header || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const update = () => root.style.setProperty('--app-header-h', `${Math.round(header.getBoundingClientRect().height)}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--app-header-h');
    };
  }, [isReady]);

  // Guard: Do not render protected content if user is not authenticated and loading is complete.
  // This prevents the flash of protected UI during logout/session loss.
  // While loading, render nothing to keep the page blank until auth state is determined.
  if (!user && !isLoading) {
    return null;
  }
  // While sign-in is being checked, show placeholder boxes instead of a blank screen.
  // (No account data is shown, so nothing protected can flash.)
  if (isLoading) {
    return <AppShellSkeleton mode={mode} />;
  }

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-zinc-950 text-zinc-50">
      <header ref={headerRef} className="sticky top-0 z-20 bg-zinc-950/94 backdrop-blur">
        <div className={`mx-auto flex w-full max-w-5xl flex-col px-4 ${mode === 'admin' ? 'pt-3' : 'pt-[max(calc(env(safe-area-inset-top)+0.35rem),1.25rem)] sm:pt-4'} sm:px-6`}>
          {mode === 'crew' ? (
            <div className="flex min-h-11 items-center justify-between gap-3 pb-3 sm:pb-4">
              <div className="flex min-w-0 flex-1 items-center">
                <ProjectTitle fallbackTitle={title} />
              </div>
              {isCrewList ? (
                <div className="flex shrink-0 items-center gap-2">
                  <CrewMenu showAdminLink={showAdminLink} />
                </div>
              ) : (
                <>
                  <div className="flex shrink-0 items-center gap-2 sm:hidden">
                    <HeaderActionMenu actionHref={showAdminLink ? actionHref : '/'} actionLabel={showAdminLink ? actionLabel : 'Crew view'} />
                  </div>
                  <div className="hidden shrink-0 items-center gap-2 sm:flex">
                    {showAdminLink ? (
                      <Link href={actionHref} className={ghostButtonClassName()}>
                        {actionLabel}
                      </Link>
                    ) : null}
                    <LogoutButton />
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3 pb-3">
              <div className="min-w-0 flex-1 space-y-1">
                <Link href="/admin" className="text-2xl font-semibold tracking-tight text-zinc-50">
                  {displayTitle}
                </Link>
                {shouldShowSubtitle ? <p className="mt-1 text-xs text-zinc-500 sm:text-sm">{subtitle}</p> : null}
                <AdminProjectSelector />
              </div>
              <div className="flex shrink-0 items-center gap-2 self-start">
                {/* Desktop: the main sections sit in the header. Phones use the bottom bar. */}
                <nav aria-label="Admin sections" className="hidden items-center gap-1 sm:flex">
                  {adminNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={item.active ? 'page' : undefined}
                      className={`inline-flex min-h-10 items-center gap-1.5 rounded-[10px] px-3 text-sm transition ${item.active ? 'bg-accent-soft font-medium text-accent-light' : 'text-zinc-300 hover:bg-white/[0.05] hover:text-zinc-100'}`}
                    >
                      {item.icon}
                      {item.label}
                    </Link>
                  ))}
                </nav>
                {/* Crew view: a quick switch to see exactly what the crew sees. */}
                <Link href="/" className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] border border-white/10 px-3 text-sm text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.05] sm:ml-2">
                  <EyeIcon className="h-[18px] w-[18px]" />
                  Crew view
                </Link>
              </div>
            </div>
          )}
          {mode === 'crew' ? <div className="border-t border-white/10" /> : null}
          {/* Admin: no extra spacer under the header (was 16px) — the header's own
              padding plus the page's top padding leave a comfortable gap (per Phil). */}
        </div>
      </header>

      <main className={`mx-auto flex w-full max-w-5xl flex-col ${mode === 'admin' ? `gap-3 py-3 ${showAdminBottomBar ? 'pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:pb-3' : 'pb-[max(calc(env(safe-area-inset-bottom)+0.75rem),0.75rem)]'}` : 'gap-4 py-4 pb-[max(calc(env(safe-area-inset-bottom)+1rem),1rem)]'} px-4 sm:px-6`}>{children}</main>

      {/* Phones (admin only): bottom tab bar. Hidden while a date is open in the
          editor so the Save / Create bar has the bottom of the screen. */}
      {showAdminBottomBar ? (
        <nav aria-label="Admin sections" className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
          <div className="mx-auto flex max-w-5xl">
            {adminNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={item.active ? 'page' : undefined}
                className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition ${item.active ? 'text-accent-light' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      ) : null}
    </div>
  );
}

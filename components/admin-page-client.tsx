'use client';

import Link from 'next/link';
import { ChangeEvent, DragEvent, FormEvent, ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { ActivationEmptyState } from '@/components/activation-empty-state';
import { AddressAutocompleteField } from '@/components/address-autocomplete-field';
import { useAppContext } from '@/hooks/use-app-context';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { createArtist, createWorkspaceInvite, deleteArtist, deleteShow, exportGuestListCsv, listShows, listWorkspaceInvites, listWorkspaceMembers, removeWorkspaceMember, renameArtist, revokeWorkspaceInvite, updateWorkspaceMember, upsertShow } from '@/lib/data-client';
import { formatShowDate, isPastShow, isValidStoredDate, yearFromDate } from '@/lib/date';
import { createEmptyScheduleItems, emptyShowForm } from '@/lib/defaults';
import { Show, ShowFormValues, ShowStatus } from '@/lib/types';
import { trackActivationEvent } from '@/lib/activation-telemetry';
import { trackInviteEvent } from '@/lib/invite-telemetry';
import { canCreateArtists, canManageInvites, getWorkspaceRole } from '@/lib/roles';
import { getAdminNoArtistsGuardrail } from '@/lib/activation/first-run';
import type { IntakeRow } from '@/lib/ai/intake-types';
import type { ProjectSummary, TourSummary, WorkspaceInviteRole, WorkspaceInviteSummary, WorkspaceMemberDirectoryEntry } from '@/lib/types/tenant';
import { getBrowserSupabaseClient } from '@/lib/supabase/client';
import { describeTeamScope, getContextLabel, matchesProjectContext, splitInvitesByStatus } from '@/lib/ui/team-directory';

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function bubbleClassName() {
  return 'rounded-[28px] border border-white/10 bg-black/20 p-4';
}

function primaryButtonClassName() {
  return 'inline-flex h-11 items-center justify-center rounded-full bg-emerald-500 px-4 text-sm font-medium text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-60';
}

function secondaryButtonClassName() {
  return 'inline-flex h-11 items-center justify-center rounded-full border border-white/10 bg-transparent px-4 text-sm font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.05]';
}

function dangerButtonClassName() {
  return 'inline-flex h-11 items-center justify-center rounded-full border border-red-500/35 bg-transparent px-4 text-sm font-medium text-red-200 transition hover:border-red-400/40 hover:bg-red-500/10';
}

function filterShows(shows: Show[], search: string, selectedTour: string) {
  const normalizedSearch = search.trim().toLowerCase();
  return shows.filter((show) => {
    const normalizedTour = show.tour_name.trim();
    const matchesTour = selectedTour === 'All' || selectedTour === 'Hide drafts' || normalizedTour === selectedTour;
    const matchesStatus = selectedTour !== 'Hide drafts' || show.status !== 'draft';
    const haystack = [show.city, show.venue_name, formatShowDate(show.date), show.date, show.tour_name].join(' ').toLowerCase();
    const matchesSearch = !normalizedSearch || haystack.includes(normalizedSearch);
    return matchesTour && matchesStatus && matchesSearch;
  });
}

function sortTourNamesForUpcoming(shows: Show[]) {
  const map = new Map<string, string>();
  for (const show of shows) {
    const tour = show.tour_name.trim();
    if (!tour) continue;
    const current = map.get(tour);
    if (!current || show.date < current) map.set(tour, show.date);
  }
  return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0])).map(([tour]) => tour);
}

function sortTourNamesForPast(shows: Show[]) {
  const map = new Map<string, string>();
  for (const show of shows) {
    const tour = show.tour_name.trim();
    if (!tour) continue;
    const current = map.get(tour);
    if (!current || show.date > current) map.set(tour, show.date);
  }
  return Array.from(map.entries()).sort((a, b) => b[1].localeCompare(a[1]) || a[0].localeCompare(b[0])).map(([tour]) => tour);
}

function adminTabClassName(active: boolean) {
  return `inline-flex min-h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-4 py-2 text-sm transition sm:min-h-0 sm:px-3 sm:py-2 ${active ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-white/10 text-zinc-200 hover:border-white/20 hover:bg-white/5'}`;
}


function fieldClassName() {
  return 'h-12 w-full rounded-full border border-white/10 bg-black/20 px-4 text-sm outline-none placeholder:text-zinc-500 focus:border-emerald-400/40';
}

function filterFieldClassName() {
  return 'h-11 w-full rounded-full border border-white/10 bg-black/20 px-4 pr-10 text-sm outline-none placeholder:text-zinc-500 focus:border-emerald-400/40';
}

function inlineFilterButtonClassName() {
  return 'inline-flex h-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-transparent px-4 text-sm font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.05]';
}

type SectionKey = 'basics' | 'venue' | 'parking' | 'schedule' | 'dos' | 'accommodation' | 'notes' | 'guestListNotes';
type VisibilityKey = keyof ShowFormValues['visibility'];
type VisibilityModeMap = Record<VisibilityKey, 'auto' | 'manual'>;
type ExpandedSections = Record<SectionKey, boolean>;
type EditableWorkspaceMemberRole = Exclude<WorkspaceMemberDirectoryEntry['role'], 'owner'>;

const EXPANDED_SECTIONS_STORAGE_KEY = 'tourbook:new-date-expanded-sections';

const defaultExpandedSections: ExpandedSections = {
  basics: true,
  venue: true,
  parking: false,
  schedule: true,
  dos: false,
  accommodation: false,
  notes: false,
  guestListNotes: false,
};

const visibilityKeyBySection: Partial<Record<SectionKey, VisibilityKey>> = {
  venue: 'show_venue',
  parking: 'show_parking_load_info',
  schedule: 'show_schedule',
  dos: 'show_dos_contact',
  accommodation: 'show_accommodation',
  notes: 'show_notes',
  guestListNotes: 'show_guest_list_notes',
};

function defaultVisibilityModes(mode: 'auto' | 'manual' = 'auto'): VisibilityModeMap {
  return {
    show_venue: mode,
    show_parking_load_info: mode,
    show_schedule: mode,
    show_dos_contact: mode,
    show_accommodation: mode,
    show_notes: mode,
    show_guest_list_notes: mode,
  };
}

function visibilityModesForLoadedForm(form: ShowFormValues): VisibilityModeMap {
  const nextModes = defaultVisibilityModes('manual');

  (Object.entries(visibilityKeyBySection) as Array<[SectionKey, VisibilityKey]>).forEach(([section, key]) => {
    const hasContent = sectionHasContent(section, form);
    if (!form.visibility[key] && !hasContent) {
      nextModes[key] = 'auto';
    }
  });

  return nextModes;
}

function hasScheduleContent(form: ShowFormValues) {
  return form.schedule_items.some((item) => item.label.trim() || item.time.trim());
}

function sectionHasContent(section: SectionKey, form: ShowFormValues) {
  switch (section) {
    case 'basics':
      return Boolean(form.date || form.city || form.tour_name);
    case 'venue':
      return Boolean(form.venue_name || form.venue_address || form.venue_maps_url);
    case 'parking':
      return Boolean(form.parking_load_info.trim());
    case 'schedule':
      return hasScheduleContent(form);
    case 'dos':
      return Boolean(form.dos_name || form.dos_phone);
    case 'accommodation':
      return Boolean(form.hotel_name || form.hotel_address || form.hotel_maps_url || form.hotel_notes);
    case 'notes':
      return Boolean(form.notes.trim());
    case 'guestListNotes':
      return Boolean(form.guest_list_notes.trim());
    default:
      return false;
  }
}

function getExpandedSectionsForPopulatedForm(form: ShowFormValues): ExpandedSections {
  return {
    basics: true,
    venue: sectionHasContent('venue', form),
    parking: sectionHasContent('parking', form),
    schedule: true,
    dos: sectionHasContent('dos', form),
    accommodation: sectionHasContent('accommodation', form),
    notes: sectionHasContent('notes', form),
    guestListNotes: sectionHasContent('guestListNotes', form),
  };
}

function applyAutoVisibility(form: ShowFormValues, visibilityModes: VisibilityModeMap): ShowFormValues {
  const nextVisibility = { ...form.visibility };

  (Object.entries(visibilityKeyBySection) as Array<[SectionKey, VisibilityKey]>).forEach(([section, key]) => {
    if (visibilityModes[key] === 'auto') {
      nextVisibility[key] = sectionHasContent(section, form);
    }
  });

  return {
    ...form,
    visibility: nextVisibility,
  };
}

function readExpandedSectionsPreference() {
  if (typeof window === 'undefined') return defaultExpandedSections;

  try {
    const raw = window.localStorage.getItem(EXPANDED_SECTIONS_STORAGE_KEY);
    if (!raw) return defaultExpandedSections;
    const parsed = JSON.parse(raw) as Partial<ExpandedSections>;
    return { ...defaultExpandedSections, ...parsed };
  } catch {
    return defaultExpandedSections;
  }
}


function formatDateForStorage(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseFlexibleDateInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const normalized = trimmed.replace(/[./]/g, '-').replace(/\s+/g, ' ');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const finalizeCandidate = (candidate: Date, inferredYear: boolean) => {
    if (Number.isNaN(candidate.getTime())) return '';
    const normalizedCandidate = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate());
    if (inferredYear && normalizedCandidate < today) {
      normalizedCandidate.setFullYear(normalizedCandidate.getFullYear() + 1);
    }
    return formatDateForStorage(normalizedCandidate);
  };

  const tryParts = (year: number, month: number, day: number, inferredYear = false) => {
    const candidate = new Date(year, month - 1, day);
    if (candidate.getFullYear() === year && candidate.getMonth() === month - 1 && candidate.getDate() === day) {
      return finalizeCandidate(candidate, inferredYear);
    }
    return '';
  };

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) {
    const [year, month, day] = normalized.split('-').map(Number);
    return tryParts(year, month, day);
  }

  const currentYear = today.getFullYear();

  if (/^\d{1,2}-\d{1,2}$/.test(normalized)) {
    const [month, day] = normalized.split('-').map(Number);
    return tryParts(currentYear, month, day, true);
  }

  if (/^\d{1,2}-\d{1,2}-\d{2,4}$/.test(normalized)) {
    let [month, day, year] = normalized.split('-').map(Number);
    if (year < 100) year += 2000;
    return tryParts(year, month, day);
  }

  const hasExplicitYear = /\b\d{4}\b/.test(trimmed);
  const parseTarget = hasExplicitYear ? trimmed : `${trimmed} ${currentYear}`;
  const parsed = new Date(parseTarget);
  if (!Number.isNaN(parsed.getTime())) {
    return finalizeCandidate(parsed, !hasExplicitYear);
  }

  return '';
}

type ParsedImportRow = Omit<IntakeRow, 'schedule_items'> & {
  id: string;
  include: boolean;
  warning?: string;
  schedule_items: Array<{ id: string; label: string; time: string }>;
};

function buildImportRowWarning(row: IntakeRow) {
  const flags = Array.isArray(row.flags) ? row.flags.filter(Boolean) : [];
  const normalizedDate = parseFlexibleDateInput(row.date || '');
  const warnings: string[] = [...flags];
  if (!row.date || (!normalizedDate && row.date.trim())) warnings.push('Check date');
  if (!row.city.trim()) warnings.push('Check city');
  if (!row.venue_name.trim()) warnings.push('Check venue');
  return Array.from(new Set(warnings)).join(' • ');
}

function buildImportRows(rows: IntakeRow[]) {
  return rows.map((row) => ({
    id: crypto.randomUUID(),
    date: row.date ?? '',
    city: row.city ?? '',
    region: row.region ?? '',
    venue_name: row.venue_name ?? '',
    tour_name: row.tour_name ?? '',
    venue_address: row.venue_address ?? '',
    dos_name: row.dos_name ?? '',
    dos_phone: row.dos_phone ?? '',
    parking_load_info: row.parking_load_info ?? '',
    schedule_items: Array.isArray(row.schedule_items) && row.schedule_items.length ? row.schedule_items.map((item) => ({ id: crypto.randomUUID(), label: item.label ?? '', time: item.time ?? '' })) : createEmptyScheduleItems(),
    hotel_name: row.hotel_name ?? '',
    hotel_address: row.hotel_address ?? '',
    hotel_notes: row.hotel_notes ?? '',
    notes: row.notes ?? '',
    confidence: typeof row.confidence === 'number' ? row.confidence : undefined,
    flags: Array.isArray(row.flags) ? row.flags : [],
    include: true,
    warning: buildImportRowWarning(row),
  }));
}

function filterImportFiles(files: File[]) {
  return files.filter((file) => file.size > 0);
}

function readFilesFromInput(event: ChangeEvent<HTMLInputElement>) {
  return filterImportFiles(Array.from(event.target.files || []));
}

function mergeImportFiles(currentFiles: File[], nextFiles: File[]) {
  const merged = new Map<string, File>();
  [...currentFiles, ...filterImportFiles(nextFiles)].forEach((file) => {
    merged.set(`${file.name}-${file.size}-${file.lastModified}`, file);
  });
  return Array.from(merged.values());
}

function isImportableTextFile(file: File) {
  return Boolean(file.type.startsWith('text/') || /\.(csv|tsv|txt|md|json|eml)$/i.test(file.name));
}

async function buildImportTextFromFiles(files: File[]) {
  const textChunks = await Promise.all(
    files.filter(isImportableTextFile).map(async (file) => {
      const content = await file.text();
      const trimmed = content.trim();
      return trimmed ? `File: ${file.name}\n${trimmed}` : '';
    }),
  );

  return textChunks.filter(Boolean).join('\n\n');
}

export function AdminPageClient({ mode = 'new' }: { mode?: 'new' | 'dates' | 'drafts' | 'team' | 'projects' }) {
  const {
    activeWorkspaceId,
    activeProjectId,
    activeTourId,
    isLoading: contextLoading,
    workspaces,
    projects,
    tours,
    setActiveWorkspaceId,
    setActiveProjectId,
    memberships,
    refreshContext,
  } = useAppContext();
  const searchParams = useSearchParams();
  const datesTab = searchParams.get('tab') === 'past' ? 'past' : 'upcoming';
  const isDraftsMode = mode === 'drafts';
  const isTeamMode = mode === 'team';
  const isProjectsMode = mode === 'projects';
  const statusMessage = searchParams.get('message');
  const contextProjectId = searchParams.get('contextProjectId');
  const [shows, setShows] = useState<Show[]>([]);
  const [expandedSections, setExpandedSections] = useState<ExpandedSections>(defaultExpandedSections);
  const [visibilityModes, setVisibilityModes] = useState<VisibilityModeMap>(() => defaultVisibilityModes());
  const [form, setForm] = useState<ShowFormValues>(() => applyAutoVisibility({ ...emptyShowForm, schedule_items: createEmptyScheduleItems() }, defaultVisibilityModes()));
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<WorkspaceInviteRole>('viewer');
  const [inviteScopeType, setInviteScopeType] = useState<'workspace' | 'projects' | 'tours'>('workspace');
  const [inviteProjectIds, setInviteProjectIds] = useState<string[]>([]);
  const [inviteTourIds, setInviteTourIds] = useState<string[]>([]);
  const [members, setMembers] = useState<WorkspaceMemberDirectoryEntry[]>([]);
  const [editingMember, setEditingMember] = useState<WorkspaceMemberDirectoryEntry | null>(null);
  const [editingMemberRole, setEditingMemberRole] = useState<EditableWorkspaceMemberRole>('viewer');
  const [editingMemberScopeType, setEditingMemberScopeType] = useState<'workspace' | 'projects' | 'tours'>('workspace');
  const [editingMemberProjectIds, setEditingMemberProjectIds] = useState<string[]>([]);
  const [editingMemberTourIds, setEditingMemberTourIds] = useState<string[]>([]);
  const [savingMemberEdit, setSavingMemberEdit] = useState(false);
  const [invites, setInvites] = useState<WorkspaceInviteSummary[]>([]);
  const [inviteMessage, setInviteMessage] = useState('');
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [lastInviteShare, setLastInviteShare] = useState<{ token: string; link: string } | null>(null);
  const [upcomingSearch, setUpcomingSearch] = useState('');
  const [pastSearch, setPastSearch] = useState('');
  const [upcomingTour, setUpcomingTour] = useState('All');
  const [pastTour, setPastTour] = useState('All');
  const [draftSearch, setDraftSearch] = useState('');
  const [draftTour, setDraftTour] = useState('All');
  const [returnToUrl, setReturnToUrl] = useState('/admin/dates');
  const [returnLabel, setReturnLabel] = useState('Existing Dates');
  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; description: string; confirmLabel?: string; tone?: 'default' | 'danger' }>({ open: false, title: '', description: '' });
  const [importOpen, setImportOpen] = useState(false);
  const [newArtistName, setNewArtistName] = useState('');
  const [creatingArtist, setCreatingArtist] = useState(false);
  const [renamingArtist, setRenamingArtist] = useState(false);
  const [showManualInviteShare, setShowManualInviteShare] = useState(false);
  const [importSourceText, setImportSourceText] = useState('');
  const [importRows, setImportRows] = useState<ParsedImportRow[]>([]);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [reviewingImport, setReviewingImport] = useState(false);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importError, setImportError] = useState('');
  const [isDraggingImportFiles, setIsDraggingImportFiles] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);
  const handledLoadRef = useRef<string | null>(null);
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);
  const contextInvitePrefillRef = useRef<string | null>(null);

  const activeWorkspaceRole = useMemo(() => getWorkspaceRole(memberships, activeWorkspaceId), [memberships, activeWorkspaceId]);
  const workspaceProjects = useMemo(
    () => projects.filter((project) => project.workspaceId === activeWorkspaceId),
    [projects, activeWorkspaceId],
  );
  const workspaceTours = useMemo(
    () => tours.filter((tour) => tour.workspaceId === activeWorkspaceId),
    [tours, activeWorkspaceId],
  );
  const inviteAvailableTours = useMemo(() => {
    if (inviteScopeType !== 'tours') return workspaceTours;
    if (inviteProjectIds.length === 0) return workspaceTours;
    const allowedProjects = new Set(inviteProjectIds);
    return workspaceTours.filter((tour) => allowedProjects.has(tour.projectId));
  }, [inviteProjectIds, inviteScopeType, workspaceTours]);
  const editAvailableTours = useMemo(() => {
    if (editingMemberScopeType !== 'tours') return workspaceTours;
    if (editingMemberProjectIds.length === 0) return workspaceTours;
    const allowedProjects = new Set(editingMemberProjectIds);
    return workspaceTours.filter((tour) => allowedProjects.has(tour.projectId));
  }, [editingMemberProjectIds, editingMemberScopeType, workspaceTours]);
  const canCreateArtistInWorkspace = canCreateArtists(activeWorkspaceRole);
  const isWorkspaceOwner = activeWorkspaceRole === 'owner';
  const canManageProjectActions = activeWorkspaceRole === 'owner' || activeWorkspaceRole === 'admin';
  const canManageInvitesInWorkspace = canManageInvites(activeWorkspaceRole);

  const loadShows = useCallback(async () => {
    if (!activeWorkspaceId || !activeProjectId) return;
    const nextShows = await listShows(true, { workspaceId: activeWorkspaceId, projectId: activeProjectId });
    setShows(nextShows);
  }, [activeProjectId, activeWorkspaceId]);

  const loadInvites = useCallback(async () => {
    if (!activeWorkspaceId || !canManageInvitesInWorkspace) {
      setInvites([]);
      return;
    }

    setInvitesLoading(true);
    try {
      const nextInvites = await listWorkspaceInvites(activeWorkspaceId);
      setInvites(nextInvites);
    } catch (error) {
      setInviteMessage(error instanceof Error ? error.message : 'Unable to load invites.');
    } finally {
      setInvitesLoading(false);
    }
  }, [activeWorkspaceId, canManageInvitesInWorkspace]);

  const loadMembers = useCallback(async () => {
    if (!activeWorkspaceId || !canManageInvitesInWorkspace) {
      setMembers([]);
      return;
    }

    setMembersLoading(true);
    try {
      const nextMembers = await listWorkspaceMembers(activeWorkspaceId);
      setMembers(nextMembers);
    } catch (error) {
      setInviteMessage(error instanceof Error ? error.message : 'Unable to load team members.');
    } finally {
      setMembersLoading(false);
    }
  }, [activeWorkspaceId, canManageInvitesInWorkspace]);

  useEffect(() => {
    setInviteProjectIds((current) => current.filter((id) => workspaceProjects.some((project) => project.id === id)));
  }, [workspaceProjects]);

  useEffect(() => {
    setInviteTourIds((current) => current.filter((id) => inviteAvailableTours.some((tour) => tour.id === id)));
  }, [inviteAvailableTours]);

  useEffect(() => {
    setEditingMemberProjectIds((current) => current.filter((id) => workspaceProjects.some((project) => project.id === id)));
  }, [workspaceProjects]);

  useEffect(() => {
    setEditingMemberTourIds((current) => current.filter((id) => editAvailableTours.some((tour) => tour.id === id)));
  }, [editAvailableTours]);

  useEffect(() => {
    if (contextLoading || !activeWorkspaceId || !activeProjectId) return;
    void loadShows();
  }, [activeProjectId, activeWorkspaceId, contextLoading, loadShows]);

  useEffect(() => {
    if (contextLoading) return;
    void loadInvites();
    void loadMembers();
  }, [contextLoading, loadInvites, loadMembers]);

  useEffect(() => {
    if (!isTeamMode || !contextProjectId || contextInvitePrefillRef.current === contextProjectId) return;
    if (!workspaceProjects.some((project) => project.id === contextProjectId)) return;
    contextInvitePrefillRef.current = contextProjectId;
    setInviteScopeType('projects');
    setInviteProjectIds([contextProjectId]);
    setInviteMessage('Project context loaded. Review scope and create invite when ready.');
  }, [contextProjectId, isTeamMode, workspaceProjects]);

  useEffect(() => {
    if (mode !== 'new') return;
    const stored = readExpandedSectionsPreference();
    setExpandedSections(stored);
    setForm((current) => applyAutoVisibility(current, visibilityModes));
  }, [mode, visibilityModes]);

  useEffect(() => {
    if (mode !== 'new' || typeof window === 'undefined') return;
    window.localStorage.setItem(EXPANDED_SECTIONS_STORAGE_KEY, JSON.stringify(expandedSections));
  }, [expandedSections, mode]);

  useEffect(() => {
    if (!importOpen || typeof document === 'undefined') return;

    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPaddingRight = body.style.paddingRight;
    const previousHtmlOverflow = documentElement.style.overflow;
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;

    body.style.overflow = 'hidden';
    documentElement.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      body.style.overflow = previousBodyOverflow;
      body.style.paddingRight = previousBodyPaddingRight;
      documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [importOpen]);

  const isEditing = useMemo(() => shows.some((show) => show.id === form.id), [form.id, shows]);
  const draftShows = useMemo(() => shows.filter((show) => show.status === 'draft').sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')), [shows]);
  const upcomingShows = useMemo(() => shows.filter((show) => !isPastShow(show.date)).sort((a,b)=>a.date.localeCompare(b.date)), [shows]);
  const pastShows = useMemo(() => shows.filter((show) => isPastShow(show.date)).sort((a, b) => b.date.localeCompare(a.date)), [shows]);
  const upcomingTours = useMemo(() => ['All', 'Hide drafts', ...sortTourNamesForUpcoming(upcomingShows)], [upcomingShows]);
  const pastTours = useMemo(() => ['All', 'Hide drafts', ...sortTourNamesForPast(pastShows)], [pastShows]);
  const filteredUpcomingShows = useMemo(() => filterShows(upcomingShows, upcomingSearch, upcomingTour), [upcomingSearch, upcomingTour, upcomingShows]);
  const filteredPastShows = useMemo(() => filterShows(pastShows, pastSearch, pastTour), [pastSearch, pastTour, pastShows]);
  const availableTours = useMemo(() => Array.from(new Set(shows.map((show) => show.tour_name.trim()).filter(Boolean))).sort(), [shows]);
  const draftTours = useMemo(() => ['All', ...Array.from(new Set(draftShows.map((show) => show.tour_name.trim()).filter(Boolean))).sort()], [draftShows]);

  const filteredDraftShows = useMemo(() => filterShows(draftShows, draftSearch, draftTour), [draftSearch, draftTour, draftShows]);
  const includedImportCount = useMemo(() => importRows.filter((row) => row.include).length, [importRows]);

  const pastShowsByYear = useMemo(() => {
    const groups = new Map<string, Show[]>();
    for (const show of filteredPastShows) {
      const year = String(yearFromDate(show.date) ?? 'Unknown');
      groups.set(year, [...(groups.get(year) ?? []), show]);
    }
    return Array.from(groups.entries()).sort((a, b) => {
      if (a[0] === 'Unknown') return 1;
      if (b[0] === 'Unknown') return -1;
      return Number(b[0]) - Number(a[0]);
    });
  }, [filteredPastShows]);

  useEffect(() => {
    if (!upcomingTours.includes(upcomingTour)) setUpcomingTour('All');
  }, [upcomingTour, upcomingTours]);

  useEffect(() => {
    if (!pastTours.includes(pastTour)) setPastTour('All');
  }, [pastTour, pastTours]);

  useEffect(() => {
    if (!draftTours.includes(draftTour)) setDraftTour('All');
  }, [draftTour, draftTours]);

  useEffect(() => {
    if ((mode !== 'dates' && mode !== 'drafts') || !statusMessage) return;
    setMessage(statusMessage);
  }, [mode, statusMessage]);

  useEffect(() => {
    if (mode !== 'new' || !shows.length) return;

    const editId = searchParams.get('edit');
    const duplicateId = searchParams.get('duplicate');
    const returnTo = searchParams.get('returnTo');
    const returnTab = searchParams.get('returnTab') === 'past' ? 'past' : 'upcoming';
    const nextAction = duplicateId ? `duplicate:${duplicateId}` : editId ? `edit:${editId}` : null;

    if (returnTo && returnTo !== 'dates' && (editId || duplicateId)) {
      setReturnToUrl(returnTo);
      setReturnLabel(returnTo === '/admin/drafts' ? 'Drafts' : 'Existing Dates');
    } else if (returnTo === 'show' && (editId || duplicateId)) {
      const targetId = editId ?? duplicateId;
      setReturnToUrl(`/shows/${encodeURIComponent(targetId ?? '')}?admin=1`);
      setReturnLabel('Date');
    } else {
      setReturnToUrl(`/admin/dates?tab=${returnTab}`);
      setReturnLabel('Existing Dates');
    }

    if (!nextAction || handledLoadRef.current === nextAction) return;

    if (duplicateId) {
      const source = shows.find((show) => show.id === duplicateId);
      if (source) {
        const duplicated = {
          ...source,
          id: '',
          date: '',
          created_at: undefined,
          schedule_items: source.schedule_items.map((item) => ({ ...item, id: crypto.randomUUID() })),
        };
        setVisibilityModes(visibilityModesForLoadedForm(duplicated));
        setForm(duplicated);
        setExpandedSections(getExpandedSectionsForPopulatedForm(duplicated));
        setMessage('Date duplicated');
        setDirty(false);
      }
    } else if (editId) {
      const source = shows.find((show) => show.id === editId);
      if (source) {
        setVisibilityModes(visibilityModesForLoadedForm(source));
        setForm(source);
        setExpandedSections(getExpandedSectionsForPopulatedForm(source));
        setMessage('Loaded into editor');
        setDirty(false);
      }
    }

    handledLoadRef.current = nextAction;
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/admin');
    }
  }, [mode, searchParams, shows]);

  function handleWorkspaceSelection(workspaceId: string | null) {
    setActiveWorkspaceId(workspaceId);
    void trackActivationEvent({
      event: 'activation.create_cta_clicked',
      stateType: 'admin.select_workspace',
      cta: 'select_workspace',
      entity: 'workspace',
      workspaceId,
      role: getWorkspaceRole(memberships, workspaceId),
    });
  }

  function handleArtistSelection(projectId: string | null) {
    setActiveProjectId(projectId);
    void trackActivationEvent({
      event: 'activation.create_cta_clicked',
      stateType: 'admin.select_artist',
      cta: 'select_artist',
      entity: 'artist',
      workspaceId: activeWorkspaceId,
      projectId,
      role: activeWorkspaceRole,
    });
  }

  async function handleCreateArtist() {
    if (!activeWorkspaceId || !canManageProjectActions) return;
    if (!newArtistName.trim()) {
      setMessage('Enter an artist name to continue.');
      return;
    }

    setCreatingArtist(true);
    void trackActivationEvent({
      event: 'activation.create_cta_clicked',
      stateType: 'admin.no_artists',
      cta: 'create_first_artist',
      entity: 'artist',
      workspaceId: activeWorkspaceId,
      role: activeWorkspaceRole,
    });

    try {
      const created = await createArtist({ workspaceId: activeWorkspaceId, name: newArtistName.trim(), slug: slugify(newArtistName) });
      await refreshContext();
      setActiveProjectId(created.id);
      setNewArtistName('');
      setMessage('Artist created. You can now create your first date.');
      void trackActivationEvent({
        event: 'activation.create_success',
        stateType: 'admin.no_artists',
        entity: 'artist',
        workspaceId: activeWorkspaceId,
        projectId: created.id,
        role: activeWorkspaceRole,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unable to create artist.';
      setMessage(reason);
      void trackActivationEvent({
        event: 'activation.create_failure',
        stateType: 'admin.no_artists',
        entity: 'artist',
        workspaceId: activeWorkspaceId,
        role: activeWorkspaceRole,
        reason,
      });
    } finally {
      setCreatingArtist(false);
    }
  }

  async function handleRenameArtist(projectId: string, nextNameRaw: string) {
    if (!activeWorkspaceId || !projectId || !canManageProjectActions) return;
    const nextName = nextNameRaw.trim();
    if (!nextName) {
      setMessage('Enter a new artist name.');
      return;
    }

    setRenamingArtist(true);
    try {
      const renamed = await renameArtist({ workspaceId: activeWorkspaceId, projectId, name: nextName });
      await refreshContext();
      setActiveProjectId(renamed.id);
      setMessage('Artist renamed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to rename artist.');
    } finally {
      setRenamingArtist(false);
    }
  }

  async function handleDeleteArtist(project: ProjectSummary) {
    if (!activeWorkspaceId || !isWorkspaceOwner) return;
    const projectName = project.name || project.slug || project.id;
    const confirmed = await requestConfirmation({
      title: 'Delete artist?',
      description: `Are you sure you want to delete ${projectName}? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      await deleteArtist({ workspaceId: activeWorkspaceId, projectId: project.id });
      await refreshContext();
      if (activeProjectId === project.id) {
        const remaining = workspaceProjects.filter((item) => item.id !== project.id);
        setActiveProjectId(remaining[0]?.id ?? null);
      }
      setMessage('Artist deleted.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to delete artist.');
    }
  }

  async function handleCreateInvite() {
    if (!activeWorkspaceId || !canManageInvitesInWorkspace) return;
    if (!inviteEmail.trim()) {
      setInviteMessage('Enter an email to invite.');
      return;
    }

    if (inviteRole === 'admin' && inviteScopeType !== 'workspace') {
      setInviteMessage('Admins must have full workspace access.');
      return;
    }

    if (inviteScopeType === 'projects' && inviteProjectIds.length === 0) {
      setInviteMessage('Select at least one artist for project-limited access.');
      return;
    }

    if (inviteScopeType === 'tours' && inviteTourIds.length === 0) {
      setInviteMessage('Select at least one tour for tour-limited access.');
      return;
    }

    setCreatingInvite(true);
    setInviteMessage('');
    setLastInviteShare(null);
    setShowManualInviteShare(false);

    try {
      const created = await createWorkspaceInvite({
        workspaceId: activeWorkspaceId,
        name: inviteName.trim() || null,
        email: inviteEmail.trim(),
        role: inviteRole,
        scopeType: inviteScopeType,
        projectIds: inviteScopeType === 'projects' ? inviteProjectIds : [],
        tourIds: inviteScopeType === 'tours' ? inviteTourIds : [],
      });
      const inviteLink = `${window.location.origin}/?inviteToken=${encodeURIComponent(created.acceptToken)}`;
      setLastInviteShare({ token: created.acceptToken, link: inviteLink });
      setInviteName('');
      setInviteEmail('');
      setInviteProjectIds([]);
      setInviteTourIds([]);
      setInviteScopeType('workspace');
      setInvites((current) => [created.invite, ...current]);
      setInviteMessage('An email invite has been sent to your recipient(s).');
      await trackInviteEvent({ event: 'invite.created', workspaceId: created.invite.workspaceId, inviteId: created.invite.id, role: created.invite.role });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unable to create invite.';
      setInviteMessage(reason);
      await trackInviteEvent({ event: 'invite.failed', workspaceId: activeWorkspaceId, reason });
    } finally {
      setCreatingInvite(false);
    }
  }

  async function handleRevokeInvite(invite: WorkspaceInviteSummary) {
    if (!activeWorkspaceId || !canManageInvitesInWorkspace) return;
    const confirmed = await requestConfirmation({ title: 'Revoke invite?', description: `Revoke invite for ${invite.name || invite.email}?`, confirmLabel: 'Revoke', tone: 'danger' });
    if (!confirmed) return;

    try {
      const revoked = await revokeWorkspaceInvite({ workspaceId: activeWorkspaceId, inviteId: invite.id });
      setInvites((current) => current.map((item) => (item.id === revoked.id ? revoked : item)));
      setInviteMessage('Invite revoked.');
      await trackInviteEvent({ event: 'invite.revoked', workspaceId: revoked.workspaceId, inviteId: revoked.id, role: revoked.role });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unable to revoke invite.';
      setInviteMessage(reason);
      await trackInviteEvent({ event: 'invite.failed', workspaceId: activeWorkspaceId, inviteId: invite.id, reason });
    }
  }

  function handleStartEditMember(member: WorkspaceMemberDirectoryEntry) {
    if (member.role === 'owner') return;
    setEditingMember(member);
    setEditingMemberRole(member.role);
    setEditingMemberScopeType(member.role === 'admin' ? 'workspace' : member.scopeType);
    setEditingMemberProjectIds(member.projectIds);
    setEditingMemberTourIds(member.tourIds);
    setInviteMessage('');
  }

  function closeMemberEditor() {
    setEditingMember(null);
    setEditingMemberRole('viewer');
    setEditingMemberScopeType('workspace');
    setEditingMemberProjectIds([]);
    setEditingMemberTourIds([]);
    setSavingMemberEdit(false);
  }

  async function handleSaveMemberEdit() {
    if (!activeWorkspaceId || !editingMember || !canManageInvitesInWorkspace) return;
    if (editingMemberRole === 'admin' && editingMemberScopeType !== 'workspace') {
      setInviteMessage('Admins must have full workspace access.');
      return;
    }
    if (editingMemberScopeType === 'projects' && editingMemberProjectIds.length === 0) {
      setInviteMessage('Select at least one artist for project-scoped access.');
      return;
    }
    if (editingMemberScopeType === 'tours' && editingMemberTourIds.length === 0) {
      setInviteMessage('Select at least one tour for tour-scoped access.');
      return;
    }

    setSavingMemberEdit(true);
    try {
      const updated = await updateWorkspaceMember({
        workspaceId: activeWorkspaceId,
        memberId: editingMember.id,
        role: editingMemberRole,
        scopeType: editingMemberScopeType,
        projectIds: editingMemberScopeType === 'projects' ? editingMemberProjectIds : editingMemberScopeType === 'tours' ? editingMemberProjectIds : [],
        tourIds: editingMemberScopeType === 'tours' ? editingMemberTourIds : [],
      });
      setMembers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setInviteMessage('Member access updated.');
      closeMemberEditor();
    } catch (error) {
      setInviteMessage(error instanceof Error ? error.message : 'Unable to update member.');
      setSavingMemberEdit(false);
    }
  }

  async function handleRemoveMember(member: WorkspaceMemberDirectoryEntry) {
    if (!activeWorkspaceId || !canManageInvitesInWorkspace) return;
    const label = member.name || member.email || member.userId;
    const confirmed = await requestConfirmation({ title: 'Remove member?', description: `Remove ${label} from this workspace?`, confirmLabel: 'Remove', tone: 'danger' });
    if (!confirmed) return;

    try {
      await removeWorkspaceMember({ workspaceId: activeWorkspaceId, memberId: member.id });
      setMembers((current) => current.filter((item) => item.id !== member.id));
      if (editingMember?.id === member.id) closeMemberEditor();
      setInviteMessage('Member removed.');
    } catch (error) {
      setInviteMessage(error instanceof Error ? error.message : 'Unable to remove member.');
    }
  }

  async function copyToClipboard(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value);
      setInviteMessage(successMessage);
    } catch {
      setInviteMessage('Copy failed. You can still select and copy manually.');
    }
  }

  function requestConfirmation(options: { title: string; description: string; confirmLabel?: string; tone?: 'default' | 'danger' }) {
    return new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmState({ open: true, ...options });
    });
  }

  function closeConfirmation(result: boolean) {
    confirmResolverRef.current?.(result);
    confirmResolverRef.current = null;
    setConfirmState((current) => ({ ...current, open: false }));
  }

  function updateForm(mutator: (current: ShowFormValues) => ShowFormValues) {
    setDirty(true);
    setForm((current) => applyAutoVisibility(mutator(current), visibilityModes));
  }

  function updateField<K extends keyof ShowFormValues>(key: K, value: ShowFormValues[K]) {
    updateForm((current) => ({ ...current, [key]: value }));
  }

  function updateVisibility(key: VisibilityKey, value: boolean) {
    setVisibilityModes((current) => ({ ...current, [key]: 'manual' }));
    setForm((current) => ({ ...current, visibility: { ...current.visibility, [key]: value } }));
  }

  function resetForm(nextMessage = 'Ready to create') {
    const nextModes = defaultVisibilityModes();
    setVisibilityModes(nextModes);
    setExpandedSections(readExpandedSectionsPreference());
    setForm(applyAutoVisibility({ ...emptyShowForm, schedule_items: createEmptyScheduleItems() }, nextModes));
    handledLoadRef.current = null;
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/admin');
    }
    setMessage(nextMessage);
    setDirty(false);
  }

  function updateScheduleItem(id: string, field: 'label' | 'time', value: string) {
    updateForm((current) => ({
      ...current,
      schedule_items: current.schedule_items.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    }));
  }

  function addScheduleRow() {
    updateForm((current) => ({
      ...current,
      schedule_items: [...current.schedule_items, { id: crypto.randomUUID(), label: '', time: '' }],
    }));
  }

  function removeScheduleRow(id: string) {
    updateForm((current) => ({
      ...current,
      schedule_items: current.schedule_items.filter((item) => item.id !== id),
    }));
  }

  function setSectionExpanded(section: SectionKey, expanded: boolean) {
    setExpandedSections((current) => ({ ...current, [section]: expanded }));
  }

  function expandAllSections() {
    setExpandedSections({
      basics: true,
      venue: true,
      parking: true,
      schedule: true,
      dos: true,
      accommodation: true,
      notes: true,
      guestListNotes: true,
    });
  }

  function collapseAllSections() {
    setExpandedSections({
      basics: false,
      venue: false,
      parking: false,
      schedule: false,
      dos: false,
      accommodation: false,
      notes: false,
      guestListNotes: false,
    });
  }

  async function saveShow(requestedStatus: ShowStatus) {
    if (!isValidStoredDate(form.date)) {
      setMessage(
        requestedStatus === 'draft'
          ? 'Enter a valid date before saving a draft. Use the date picker or YYYY-MM-DD.'
          : 'Enter a valid date before publishing. Use the date picker or YYYY-MM-DD.',
      );
      return;
    }

    setSaving(true);

    try {
      if (!activeWorkspaceId || !activeProjectId) throw new Error('No active workspace or artist selected.');
      const show = await upsertShow({
        ...form,
        id: form.id,
        status: requestedStatus,
        tour_name: form.tour_name.trim(),
        region: form.region.trim().toUpperCase(),
      }, { workspaceId: activeWorkspaceId, projectId: activeProjectId });
      await loadShows();
      setDirty(false);
      setForm(show);
      window.dispatchEvent(new Event('tourbook:shows-updated'));

      if (requestedStatus === 'draft') {
        if (isEditing) {
          setMessage('Draft saved.');
        } else {
          resetForm('Draft saved. Form cleared for the next date.');
        }
        return;
      }

      if (isEditing) {
        if (form.status === 'draft') {
          window.location.href = `/admin/dates/${encodeURIComponent(show.id)}?tab=${isPastShow(show.date) ? 'past' : 'upcoming'}&message=${encodeURIComponent('Draft published.')}`;
          return;
        }
        const nextTab = isPastShow(show.date) ? 'past' : 'upcoming';
        const target = (returnToUrl.startsWith('/shows/') || returnToUrl.startsWith('/admin/dates/')) ? `${returnToUrl}${returnToUrl.includes('?') ? '&' : '?'}message=${encodeURIComponent('Show updated.')}` : `/admin/dates?tab=${nextTab}&message=${encodeURIComponent('Show updated.')}`;
        window.location.href = target;
        return;
      }

      resetForm('Show created. Form cleared for the next date.');
      void trackActivationEvent({
        event: 'activation.create_success',
        stateType: 'admin.new_date',
        entity: 'date',
        workspaceId: activeWorkspaceId,
        projectId: activeProjectId,
        role: activeWorkspaceRole,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unable to save show.';
      setMessage(reason);
      if (!isEditing) {
        void trackActivationEvent({
          event: 'activation.create_failure',
          stateType: 'admin.new_date',
          entity: 'date',
          workspaceId: activeWorkspaceId,
          projectId: activeProjectId,
          role: activeWorkspaceRole,
          reason,
        });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isEditing) {
      void trackActivationEvent({
        event: 'activation.create_cta_clicked',
        stateType: 'admin.new_date',
        cta: form.status === 'draft' ? 'save_first_date_draft' : 'create_first_date',
        entity: 'date',
        workspaceId: activeWorkspaceId,
        projectId: activeProjectId,
        role: activeWorkspaceRole,
      });
    }
    await saveShow(form.status === 'draft' ? 'draft' : 'published');
  }

  function loadShow(show: Show) {

    if (mode === 'dates') {
      window.location.href = `/admin?edit=${encodeURIComponent(show.id)}&returnTo=dates&returnTab=${datesTab}`;
      return;
    }

    if (mode === 'drafts') {
      window.location.href = `/admin?edit=${encodeURIComponent(show.id)}&returnTo=${encodeURIComponent('/admin/drafts')}`;
      return;
    }

    setVisibilityModes(visibilityModesForLoadedForm(show));
    setForm(show);
    setExpandedSections(getExpandedSectionsForPopulatedForm(show));
    setMessage('Loaded into editor');
    setDirty(false);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function duplicateShow(show: Show) {

    if (mode === 'dates') {
      window.location.href = `/admin?duplicate=${encodeURIComponent(show.id)}&returnTo=dates&returnTab=${datesTab}`;
      return;
    }

    const duplicated = {
      ...show,
      id: '',
      date: '',
      created_at: undefined,
      schedule_items: show.schedule_items.map((item) => ({ ...item, id: crypto.randomUUID() })),
    };

    setVisibilityModes(visibilityModesForLoadedForm(duplicated));
    setForm(duplicated);
    setExpandedSections(getExpandedSectionsForPopulatedForm(duplicated));
    setMessage('Date duplicated');
    setDirty(false);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleDelete(showId: string) {
    const confirmed = await requestConfirmation({ title: 'Delete date?', description: 'Delete this show and its guest list?', confirmLabel: 'Delete', tone: 'danger' });
    if (!confirmed) return;

    if (!activeWorkspaceId) throw new Error('No active workspace selected.');
    await deleteShow(showId, { workspaceId: activeWorkspaceId });
    await loadShows();
    if (form.id === showId) {
      resetForm();
    }
    setMessage('Show deleted.');
    window.dispatchEvent(new Event('tourbook:shows-updated'));
  }


  async function publishShow(show: Show) {
    try {
      if (!isValidStoredDate(show.date)) {
        setMessage('Draft needs a valid date before it can be published.');
        return;
      }
      if (!activeWorkspaceId || !activeProjectId) throw new Error('No active workspace or artist selected.');
      await upsertShow({ ...show, status: 'published', region: show.region.trim().toUpperCase(), tour_name: show.tour_name.trim() }, { workspaceId: activeWorkspaceId, projectId: activeProjectId });
      await loadShows();
      setMessage('Draft published.');
      window.dispatchEvent(new Event('tourbook:shows-updated'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to publish draft.');
    }
  }

  async function exportGuestList(showId: string) {
    if (!activeWorkspaceId) throw new Error('No active workspace selected.');
    const csv = await exportGuestListCsv(showId, { workspaceId: activeWorkspaceId });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${showId}-guest-list.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function openImportModal() {
    setImportOpen(true);
    setImportRows([]);
    setImportSourceText('');
    setImportFiles([]);
    setImportWarnings([]);
    if (importFileInputRef.current) {
      importFileInputRef.current.value = '';
    }
  }

  function closeImportModal() {
    if (importing || reviewingImport) return;
    setImportOpen(false);
    setImportRows([]);
    setImportSourceText('');
    setImportFiles([]);
    setImportWarnings([]);
    if (importFileInputRef.current) {
      importFileInputRef.current.value = '';
    }
  }

  function handleImportFileSelection(files: File[]) {
    setImportFiles((current) => mergeImportFiles(current, files));
    setImportError('');
  }

  function removeImportFile(fileToRemove: File) {
    setImportFiles((current) => current.filter((file) => !(file.name === fileToRemove.name && file.size === fileToRemove.size && file.lastModified === fileToRemove.lastModified)));
    if (importFileInputRef.current) {
      importFileInputRef.current.value = '';
    }
  }

  function handleImportDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) return;
    setIsDraggingImportFiles(true);
  }

  function handleImportDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDraggingImportFiles(false);
  }

  function handleImportDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingImportFiles(false);
    handleImportFileSelection(Array.from(event.dataTransfer.files || []));
  }

  async function reviewImportWithAi() {
    if (!importSourceText.trim() && importFiles.length === 0) {
      setImportError('Add text or at least one file to review.');
      return;
    }

    setReviewingImport(true);
    setImportError('');
    try {
      const body = new FormData();
      const imageFiles = importFiles.filter((file) => file.type.startsWith('image/'));
      const textFromFiles = await buildImportTextFromFiles(importFiles);
      const combinedText = [importSourceText.trim(), textFromFiles].filter(Boolean).join('\n\n');
      if (!activeWorkspaceId || !activeProjectId) {
        throw new Error('No active workspace or artist selected.');
      }

      body.append('text', combinedText);
      body.append('workspaceId', activeWorkspaceId);
      body.append('projectId', activeProjectId);
      if (activeTourId) {
        body.append('tourId', activeTourId);
      }
      body.append('previewOnly', '1');
      imageFiles.forEach((file) => body.append('images', file));

      const supabase = getBrowserSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch('/api/dates/ai-intake', {
        method: 'POST',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        body,
        credentials: 'same-origin',
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to review AI intake.');
      }

      const rows = Array.isArray(payload?.rows) ? buildImportRows(payload.rows as IntakeRow[]) : [];
      setImportRows(rows);
      setImportWarnings(Array.isArray(payload?.warnings) ? payload.warnings.filter(Boolean) : []);
      if (!rows.length) {
        setImportError('AI Intake did not find any usable date rows.');
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Unable to review AI intake.');
    } finally {
      setReviewingImport(false);
    }
  }

  function updateImportRow(rowId: string, patch: Partial<ParsedImportRow>) {
    setImportRows((current) =>
      current.map((row) => {
        if (row.id !== rowId) return row;
        const next = { ...row, ...patch };
        return { ...next, warning: buildImportRowWarning(next) };
      }),
    );
  }

  function updateImportScheduleItem(rowId: string, itemId: string, patch: { label?: string; time?: string }) {
    setImportRows((current) =>
      current.map((row) => {
        if (row.id !== rowId) return row;
        const nextItems = row.schedule_items.map((item) => (item.id === itemId ? { ...item, ...patch } : item));
        const next = { ...row, schedule_items: nextItems };
        return { ...next, warning: buildImportRowWarning(next) };
      }),
    );
  }

  function addImportScheduleItem(rowId: string) {
    setImportRows((current) =>
      current.map((row) => {
        if (row.id !== rowId) return row;
        return { ...row, schedule_items: [...row.schedule_items, { id: crypto.randomUUID(), label: '', time: '' }] };
      }),
    );
  }

  async function confirmImportRows() {
    const selectedRows = importRows.filter((row) => row.include);
    if (!selectedRows.length) {
      setImportError('Select at least one imported row.');
      return;
    }

    setImporting(true);
    void trackActivationEvent({
      event: 'activation.create_cta_clicked',
      stateType: 'admin.import_dates',
      cta: 'create_draft_dates',
      entity: 'date',
      workspaceId: activeWorkspaceId,
      projectId: activeProjectId,
      role: activeWorkspaceRole,
    });

    try {
      for (const row of selectedRows) {
        if (!activeWorkspaceId || !activeProjectId) throw new Error('No active workspace or artist selected.');
        await upsertShow({
          ...emptyShowForm,
          date: parseFlexibleDateInput(row.date) || row.date.trim(),
          city: row.city.trim(),
          region: row.region.trim().toUpperCase(),
          venue_name: row.venue_name.trim(),
          tour_name: row.tour_name?.trim() || '',
          venue_address: row.venue_address?.trim() || '',
          dos_name: row.dos_name?.trim() || '',
          dos_phone: row.dos_phone?.trim() || '',
          parking_load_info: row.parking_load_info?.trim() || '',
          schedule_items: row.schedule_items.filter((item) => item.label.trim() || item.time.trim()),
          hotel_name: row.hotel_name?.trim() || '',
          hotel_address: row.hotel_address?.trim() || '',
          hotel_notes: row.hotel_notes?.trim() || '',
          notes: row.notes?.trim() || '',
          status: 'draft',
        }, { workspaceId: activeWorkspaceId, projectId: activeProjectId });
      }
      await loadShows();
      setImportOpen(false);
      setImportRows([]);
      setImportSourceText('');
      setImportFiles([]);
      setImportWarnings([]);
      setImportError('');
      setMessage(`${selectedRows.length} draft date${selectedRows.length === 1 ? '' : 's'} created.`);
      window.dispatchEvent(new Event('tourbook:shows-updated'));
      void trackActivationEvent({
        event: 'activation.create_success',
        stateType: 'admin.import_dates',
        entity: 'date',
        workspaceId: activeWorkspaceId,
        projectId: activeProjectId,
        role: activeWorkspaceRole,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unable to import dates.';
      setImportError(reason);
      void trackActivationEvent({
        event: 'activation.create_failure',
        stateType: 'admin.import_dates',
        entity: 'date',
        workspaceId: activeWorkspaceId,
        projectId: activeProjectId,
        role: activeWorkspaceRole,
        reason,
      });
    } finally {
      setImporting(false);
    }
  }

  const isEditingDraft = isEditing && form.status === 'draft';
  const primaryActionLabel = saving ? 'Saving...' : form.status === 'draft' ? 'Save Draft' : isEditing ? 'Update' : 'Create Date';

  if (contextLoading) {
    return <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">Loading dates...</div>;
  }

  if (!activeWorkspaceId) {
    return (
      <ActivationEmptyState
        title={workspaces.length ? 'No workspace selected.' : 'No workspace access yet.'}
        body={workspaces.length
          ? 'Choose a workspace to continue with date management.'
          : 'You are signed in, but no workspace memberships were found. Ask an owner to invite you first.'}
        actions={[{ label: 'Crew View', href: '/', tone: 'ghost', ctaId: 'go_crew_view' }]}
        telemetry={{
          stateType: workspaces.length ? 'admin.no_workspace_selected' : 'admin.no_workspace_access',
        }}
      />
    );
  }

  if (!activeProjectId) {
    const projectsForActiveWorkspace = projects.filter((project) => project.workspaceId === activeWorkspaceId);
    const noArtistGuardrail = getAdminNoArtistsGuardrail(activeWorkspaceRole);

    return (
      <div className="space-y-3">
        <ActivationEmptyState
          title={projectsForActiveWorkspace.length ? 'No artist selected.' : 'No artists found in this workspace.'}
          body={projectsForActiveWorkspace.length
            ? 'Pick an artist below to activate the admin workflow for this workspace.'
            : noArtistGuardrail.emptyBody}
          actions={[{ label: 'Go to Crew View', href: '/', tone: 'ghost', ctaId: 'go_crew_view' }]}
          telemetry={{
            stateType: projectsForActiveWorkspace.length ? 'admin.no_active_artist' : 'admin.no_artists',
            workspaceId: activeWorkspaceId,
            role: activeWorkspaceRole,
          }}
        />

        <div className="grid gap-3 rounded-3xl border border-white/10 bg-white/5 p-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm text-zinc-300">
            <span className="text-xs uppercase tracking-[0.14em] text-zinc-500">Workspace</span>
            <select
              value={activeWorkspaceId}
              onChange={(event) => handleWorkspaceSelection(event.target.value || null)}
              className="h-11 rounded-full border border-white/10 bg-black/20 px-4 text-sm text-zinc-100 outline-none focus:border-emerald-400/40"
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>{workspace.name || workspace.slug || workspace.id}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm text-zinc-300">
            <span className="text-xs uppercase tracking-[0.14em] text-zinc-500">Artist</span>
            <select
              value=""
              onChange={(event) => handleArtistSelection(event.target.value || null)}
              className="h-11 rounded-full border border-white/10 bg-black/20 px-4 text-sm text-zinc-100 outline-none focus:border-emerald-400/40"
            >
              <option value="">Select artist…</option>
              {projectsForActiveWorkspace.map((project) => (
                <option key={project.id} value={project.id}>{project.name || project.slug || project.id}</option>
              ))}
            </select>
          </label>
        </div>

        {isTeamMode && canManageInvitesInWorkspace ? (
          <InviteManagementSection
            invites={invites}
            loading={invitesLoading}
            email={inviteEmail}
            role={inviteRole}
            scopeType={inviteScopeType}
            scopeProjectIds={inviteProjectIds}
            scopeTourIds={inviteTourIds}
            availableProjects={workspaceProjects}
            availableTours={inviteAvailableTours}
            message={inviteMessage}
            creating={creatingInvite}
            lastInviteShare={lastInviteShare}
            showManualShare={showManualInviteShare}
            onToggleManualShare={() => setShowManualInviteShare((current) => !current)}
            onEmailChange={setInviteEmail}
            onRoleChange={setInviteRole}
            onScopeTypeChange={setInviteScopeType}
            onScopeProjectIdsChange={setInviteProjectIds}
            onScopeTourIdsChange={setInviteTourIds}
            contextProjectId={contextProjectId || activeProjectId}
            onCreateInvite={() => void handleCreateInvite()}
            onRevokeInvite={(invite) => void handleRevokeInvite(invite)}
            onCopyValue={(value, successMessage) => void copyToClipboard(value, successMessage)}
          />
        ) : null}

        {canManageProjectActions && isProjectsMode ? (
          <ProjectManagementSection
            projects={workspaceProjects}
            activeProjectId={activeProjectId}
            newArtistName={newArtistName}
            creatingArtist={creatingArtist}
            renamingArtist={renamingArtist}
            onNewArtistNameChange={setNewArtistName}
            onSelectProject={handleArtistSelection}
            onCreateArtist={() => void handleCreateArtist()}
            onRenameArtist={(projectId, name) => handleRenameArtist(projectId, name)}
            canDeleteArtist={isWorkspaceOwner}
            onDeleteArtist={(project) => void handleDeleteArtist(project)}
          />
        ) : null}

        {!projectsForActiveWorkspace.length ? (
          canManageProjectActions ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="mb-2 text-xs uppercase tracking-[0.14em] text-zinc-500">Create first artist</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={newArtistName}
                  onChange={(event) => setNewArtistName(event.target.value)}
                  placeholder="Artist name"
                  className="h-11 min-w-0 flex-1 rounded-full border border-white/10 bg-black/20 px-4 text-sm text-zinc-100 outline-none focus:border-emerald-400/40"
                />
                <button type="button" onClick={() => void handleCreateArtist()} disabled={creatingArtist || !newArtistName.trim()} className={primaryButtonClassName()}>
                  {creatingArtist ? 'Creating…' : 'Create Artist'}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
              {noArtistGuardrail.helperText}
            </div>
          )
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <EditMemberDialog
        open={Boolean(editingMember)}
        member={editingMember}
        role={editingMemberRole}
        scopeType={editingMemberScopeType}
        projectIds={editingMemberProjectIds}
        tourIds={editingMemberTourIds}
        availableProjects={workspaceProjects}
        availableTours={editAvailableTours}
        canAssignAdmin={isWorkspaceOwner}
        saving={savingMemberEdit}
        onClose={closeMemberEditor}
        onRoleChange={setEditingMemberRole}
        onScopeTypeChange={setEditingMemberScopeType}
        onProjectIdsChange={setEditingMemberProjectIds}
        onTourIdsChange={setEditingMemberTourIds}
        onSave={() => void handleSaveMemberEdit()}
      />
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel={confirmState.confirmLabel}
        tone={confirmState.tone}
        onConfirm={() => closeConfirmation(true)}
        onCancel={() => closeConfirmation(false)}
      />
      {importOpen ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 px-4 py-4 backdrop-blur-sm sm:flex sm:items-start sm:justify-center sm:py-6">
          <div className="mx-auto mt-[max(env(safe-area-inset-top),0.5rem)] max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl overflow-y-auto rounded-[28px] border border-white/10 bg-zinc-950 p-4 shadow-2xl shadow-black/80 sm:mt-0 sm:max-h-[calc(100vh-3rem)] sm:p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">AI Intake</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-zinc-100 sm:text-2xl">Insert text, spreadsheets or images</h2>
                <p className="mt-1 text-sm text-zinc-400">AI creates reviewable draft rows only. Nothing is saved until you approve it.</p>
              </div>
              <button type="button" onClick={closeImportModal} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.05]" aria-label="Close import">×</button>
            </div>

            <div className="grid gap-4 xl:max-h-[calc(100vh-10rem)] xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
              <div className="space-y-4 overflow-y-auto pr-1">
                <label className="block text-sm text-zinc-300">
                  <span className="mb-2 block">Source text</span>
                  <textarea
                    value={importSourceText}
                    onChange={(event) => setImportSourceText(event.target.value)}
                    className="min-h-[240px] w-full rounded-[24px] border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-emerald-400/40"
                  />
                </label>

                <div>
                  <span className="mb-2 block text-sm text-zinc-300">Files / images</span>
                  <div
                    className={`rounded-[24px] border border-dashed p-6 transition ${isDraggingImportFiles ? 'border-emerald-400/50 bg-emerald-500/10' : 'border-white/10 bg-black/10 hover:border-white/20'}`}
                    onDragOver={handleImportDragOver}
                    onDragLeave={handleImportDragLeave}
                    onDrop={handleImportDrop}
                  >
                    <input
                      ref={importFileInputRef}
                      type="file"
                      accept="image/*,.csv,.tsv,.txt,.md,.json,.eml"
                      multiple
                      onChange={(event) => handleImportFileSelection(readFilesFromInput(event))}
                      className="hidden"
                    />
                    {importFiles.length ? (
                      <div className="space-y-2">
                        {importFiles.map((file) => (
                          <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-100">
                            <span className="truncate">{file.name}</span>
                            <button
                              type="button"
                              onClick={() => removeImportFile(file)}
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 text-sm text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.05] hover:text-zinc-100"
                              aria-label={`Remove ${file.name}`}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex min-h-[144px] flex-col items-center justify-center gap-4 text-center">
                        <p className="text-sm text-zinc-500">Drag and drop files here</p>
                        <button
                          type="button"
                          onClick={() => importFileInputRef.current?.click()}
                          className="inline-flex h-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] px-3.5 text-[13px] font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.09]"
                        >
                          Choose file
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={reviewImportWithAi} disabled={reviewingImport || importing} className={primaryButtonClassName()}>
                    {reviewingImport ? 'Reviewing…' : 'Review AI draft'}
                  </button>
                </div>
              </div>

              <div className="flex min-h-0 flex-col rounded-[24px] border border-white/10 bg-black/20 p-3">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-zinc-200">Review</h3>
                    <p className="text-xs text-zinc-500">Edit, skip weak rows, then create drafts.</p>
                  </div>
                  <p className="text-xs text-zinc-400">{includedImportCount} selected</p>
                </div>

                {importError ? (
                  <div className="mb-3 rounded-2xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-100">{importError}</div>
                ) : null}

                {importWarnings.length ? (
                  <div className="mb-3 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    {importWarnings.map((warning, index) => (
                      <p key={`${warning}-${index}`}>{warning}</p>
                    ))}
                  </div>
                ) : null}

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                  {importRows.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-zinc-500">No results yet</div>
                  ) : (
                    importRows.map((row, index) => (
                      <div key={row.id} className="rounded-2xl border border-white/10 bg-zinc-950/90 p-3">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Row {index + 1}</p>
                            {typeof row.confidence === 'number' ? <p className="mt-1 text-[11px] text-zinc-500">Confidence {Math.round(row.confidence * 100)}%</p> : null}
                          </div>
                          <label className="inline-flex items-center gap-2 text-xs text-zinc-300">
                            <input type="checkbox" checked={row.include} onChange={(event) => updateImportRow(row.id, { include: event.target.checked })} className="h-4 w-4 rounded border-white/10 bg-black/20" />
                            Include
                          </label>
                        </div>

                        <div className="grid gap-2 lg:grid-cols-3">
                          <Input label="Date" value={row.date} onChange={(value) => updateImportRow(row.id, { date: value })} inputClassName={fieldClassName()} />
                          <Input label="City" value={row.city} onChange={(value) => updateImportRow(row.id, { city: value })} inputClassName={fieldClassName()} />
                          <Input label="Region" value={row.region} onChange={(value) => updateImportRow(row.id, { region: value.toUpperCase() })} inputClassName={fieldClassName()} />
                        </div>

                        <div className="mt-2 grid gap-2 lg:grid-cols-3">
                          <Input label="Venue" value={row.venue_name} onChange={(value) => updateImportRow(row.id, { venue_name: value })} inputClassName={fieldClassName()} />
                          <Input label="Venue address" value={row.venue_address || ''} onChange={(value) => updateImportRow(row.id, { venue_address: value })} inputClassName={fieldClassName()} />
                          <Input label="Tour" value={row.tour_name || ''} onChange={(value) => updateImportRow(row.id, { tour_name: value })} inputClassName={fieldClassName()} />
                        </div>

                        <div className="mt-2 grid gap-2 lg:grid-cols-2">
                          <Input label="DOS contact" value={row.dos_name || ''} onChange={(value) => updateImportRow(row.id, { dos_name: value })} inputClassName={fieldClassName()} />
                          <Input label="DOS phone" value={row.dos_phone || ''} onChange={(value) => updateImportRow(row.id, { dos_phone: value })} inputClassName={fieldClassName()} />
                        </div>

                        <div className="mt-2 grid gap-2">
                          <Textarea label="Parking / load" value={row.parking_load_info || ''} onChange={(value) => updateImportRow(row.id, { parking_load_info: value })} ariaLabel="Parking or load info" />
                        </div>

                        <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Schedule</p>
                            <button type="button" onClick={() => addImportScheduleItem(row.id)} className="text-xs text-zinc-300 transition hover:text-zinc-100">+ Add line</button>
                          </div>
                          <div className="space-y-2">
                            {row.schedule_items.map((item) => (
                              <div key={item.id} className="flex flex-col gap-2 sm:flex-row">
                                <input
                                  value={item.label}
                                  onChange={(event) => updateImportScheduleItem(row.id, item.id, { label: event.target.value })}
                                  placeholder="Label"
                                  className={`${fieldClassName()} min-w-0 flex-1`}
                                />
                                <input
                                  value={item.time}
                                  onChange={(event) => updateImportScheduleItem(row.id, item.id, { time: event.target.value })}
                                  placeholder="Time"
                                  className="h-12 w-full rounded-full border border-white/10 bg-black/20 px-4 text-sm outline-none placeholder:text-zinc-500 focus:border-emerald-400/40 sm:w-44"
                                />
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="mt-2 grid gap-2 lg:grid-cols-2">
                          <Input label="Hotel" value={row.hotel_name || ''} onChange={(value) => updateImportRow(row.id, { hotel_name: value })} inputClassName={fieldClassName()} />
                          <Input label="Hotel address" value={row.hotel_address || ''} onChange={(value) => updateImportRow(row.id, { hotel_address: value })} inputClassName={fieldClassName()} />
                        </div>

                        <div className="mt-2 grid gap-2">
                          <Textarea label="Hotel notes" value={row.hotel_notes || ''} onChange={(value) => updateImportRow(row.id, { hotel_notes: value })} ariaLabel="Hotel notes" />
                          <Textarea label="Notes" value={row.notes || ''} onChange={(value) => updateImportRow(row.id, { notes: value })} ariaLabel="Import notes" />
                        </div>

                        {row.warning ? <p className="mt-2 text-xs text-amber-300">{row.warning}</p> : null}
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                  <button type="button" onClick={closeImportModal} className={secondaryButtonClassName()}>
                    Cancel
                  </button>
                  <button type="button" onClick={confirmImportRows} disabled={importing || reviewingImport || includedImportCount === 0} className={primaryButtonClassName()}>
                    {importing ? 'Creating drafts…' : 'Create draft dates'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {mode === 'new' && isEditing ? (
        <div className="mb-2">
          <button
            type="button"
            onClick={async () => {
              if (dirty) {
                const confirmed = await requestConfirmation({ title: 'Discard edits?', description: `Discard current edits and return to ${returnLabel}?`, confirmLabel: 'Discard' });
                if (!confirmed) return;
              }
              window.location.href = returnToUrl;
            }}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-lg text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.05]"
            aria-label={`Back to ${returnLabel}`}
          >
            ←
          </button>
        </div>
      ) : null}

      <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className="hidden px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 sm:inline">Operations</span>
        <button
          type="button"
          onClick={async () => {
            if (mode === 'new') {
              if (dirty) {
                const confirmed = await requestConfirmation({
                  title: 'Discard edits?',
                  description: isEditing
                    ? 'You have unsaved edits. Start a new date instead?'
                    : 'You have unsaved changes. Start a fresh new date?',
                  confirmLabel: 'Discard',
                });
                if (!confirmed) return;
              }
              resetForm('Ready to create');
              return;
            }
            window.location.href = '/admin';
          }}
          className={adminTabClassName(mode === 'new' && !isEditing)}
        >
          New Date
        </button>
        <button
          type="button"
          onClick={async () => {
            if (mode === 'new') {
              if (dirty) {
                const confirmed = await requestConfirmation({ title: 'Discard edits?', description: 'You have unsaved edits. Return to Existing Dates instead?', confirmLabel: 'Discard' });
                if (!confirmed) return;
              }
              window.location.href = '/admin/dates';
              return;
            }
            window.location.href = '/admin/dates';
          }}
          className={adminTabClassName(mode === 'dates' || (isEditing && form.status !== 'draft'))}
        >
          Existing Dates
        </button>
        <button
          type="button"
          onClick={async () => {
            if (mode === 'new') {
              if (dirty) {
                const confirmed = await requestConfirmation({ title: 'Discard edits?', description: 'You have unsaved edits. Return to Drafts instead?', confirmLabel: 'Discard' });
                if (!confirmed) return;
              }
              window.location.href = '/admin/drafts';
              return;
            }
            window.location.href = '/admin/drafts';
          }}
          className={adminTabClassName(mode === 'drafts' || isEditingDraft)}
        >
          Drafts
        </button>

        <span className="mx-1 hidden h-5 w-px bg-white/10 sm:inline" aria-hidden="true" />
        <span className="hidden px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 sm:inline">Workspace</span>
        <Link href="/admin/team" className={adminTabClassName(isTeamMode)}>
          Team
        </Link>
        <Link href="/admin/projects" className={adminTabClassName(isProjectsMode)}>
          Projects
        </Link>
      </div>

      {canManageProjectActions && isProjectsMode ? (
        <ProjectManagementSection
          projects={workspaceProjects}
          activeProjectId={activeProjectId}
          newArtistName={newArtistName}
          creatingArtist={creatingArtist}
          renamingArtist={renamingArtist}
          onNewArtistNameChange={setNewArtistName}
          onSelectProject={handleArtistSelection}
          onCreateArtist={() => void handleCreateArtist()}
          onRenameArtist={(projectId, name) => handleRenameArtist(projectId, name)}
          canDeleteArtist={isWorkspaceOwner}
          onDeleteArtist={(project) => void handleDeleteArtist(project)}
        />
      ) : null}

      {isTeamMode && canManageInvitesInWorkspace ? (
        <TeamMembersSection
          members={members}
          loading={membersLoading}
          projects={workspaceProjects}
          tours={workspaceTours}
          onEditMember={handleStartEditMember}
          onRemoveMember={(member) => void handleRemoveMember(member)}
          contextProjectId={contextProjectId || activeProjectId}
        />
      ) : null}

      {isTeamMode && canManageInvitesInWorkspace ? (
        <InviteManagementSection
          invites={invites}
          loading={invitesLoading}
          name={inviteName}
          email={inviteEmail}
          role={inviteRole}
          scopeType={inviteScopeType}
          scopeProjectIds={inviteProjectIds}
          scopeTourIds={inviteTourIds}
          availableProjects={workspaceProjects}
          availableTours={inviteAvailableTours}
          message={inviteMessage}
          creating={creatingInvite}
          lastInviteShare={lastInviteShare}
          showManualShare={showManualInviteShare}
          onToggleManualShare={() => setShowManualInviteShare((current) => !current)}
          onNameChange={setInviteName}
          onEmailChange={setInviteEmail}
          onRoleChange={setInviteRole}
          onScopeTypeChange={setInviteScopeType}
          onScopeProjectIdsChange={setInviteProjectIds}
          onScopeTourIdsChange={setInviteTourIds}
          contextProjectId={contextProjectId || activeProjectId}
          onCreateInvite={() => void handleCreateInvite()}
          onRevokeInvite={(invite) => void handleRevokeInvite(invite)}
          onCopyValue={(value, successMessage) => void copyToClipboard(value, successMessage)}
        />
      ) : null}

      {mode === 'new' ? (
        <div ref={formRef} className="space-y-3">

        <section className="rounded-[28px] border border-white/10 bg-white/[0.045] p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            {isEditing ? (
              <div className="pt-1">
                <h1 className="text-lg font-medium tracking-tight text-zinc-300">Edit Date</h1>
              </div>
            ) : <div />}
            <div className="flex w-full flex-wrap items-center justify-end gap-2">
              <div className="flex w-full items-center justify-start gap-2 overflow-x-auto pb-1 sm:w-auto sm:justify-end sm:flex-wrap sm:overflow-visible sm:pb-0">
                {isEditingDraft ? (
                  <>
                    <button type="button" onClick={() => handleDelete(form.id)} className={dangerButtonClassName()}>
                      Delete
                    </button>
                    <button type="button" onClick={() => void saveShow('draft')} disabled={saving} className={`${secondaryButtonClassName()} h-10 px-3 text-[13px] sm:h-11 sm:px-4 sm:text-sm`}>
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button type="button" onClick={() => void saveShow('published')} disabled={saving} className={primaryButtonClassName()}>
                      {saving ? 'Publishing...' : 'Publish'}
                    </button>
                  </>
                ) : isEditing ? (
                  <button type="submit" form="admin-show-form" disabled={saving} className={primaryButtonClassName()}>
                    {primaryActionLabel}
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={openImportModal} className={`${secondaryButtonClassName()} h-10 min-w-[5.5rem] shrink-0 px-3 text-[13px] sm:h-11 sm:min-w-0 sm:px-4 sm:text-sm`}>
                      Import
                    </button>
                    <button type="button" onClick={() => void saveShow('draft')} disabled={saving} className={`${secondaryButtonClassName()} h-10 min-w-[7rem] shrink-0 px-3 text-[13px] sm:h-11 sm:min-w-0 sm:px-4 sm:text-sm`}>
                      {saving ? 'Saving...' : 'Save Draft'}
                    </button>
                    <button type="submit" form="admin-show-form" disabled={saving} className={`${primaryButtonClassName()} h-10 min-w-[7rem] shrink-0 px-3 text-[13px] sm:h-11 sm:min-w-0 sm:px-4 sm:text-sm`}>
                      {saving ? 'Saving...' : 'Create Date'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
            <div className="min-h-[1rem] text-emerald-300/90">{message || ''}</div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={expandAllSections} className="transition hover:text-zinc-300">
                Expand all
              </button>
              <span className="text-zinc-700">•</span>
              <button type="button" onClick={collapseAllSections} className="transition hover:text-zinc-300">
                Collapse all
              </button>
            </div>
          </div>

          <form id="admin-show-form" onSubmit={handleSubmit} className="grid gap-3">
            <CollapsibleSection
              title="Basics"
              expanded={expandedSections.basics}
              onExpandedChange={(value) => setSectionExpanded('basics', value)}
              hasContent={sectionHasContent('basics', form)}
            >
              <div className="grid gap-3">
                <div className="grid gap-3 lg:grid-cols-2">
                  <FlexibleDateInput label="Date" value={form.date} onChange={(value) => updateField('date', value)} labelWidthClassName="w-[72px]" />
                  <InlineInput label="City" value={form.city} onChange={(value) => updateField('city', value)} labelWidthClassName="w-[72px]" />
                  <InlineInput label="Region" value={form.region} onChange={(value) => updateField('region', value.toUpperCase())} labelWidthClassName="w-[72px]" />
                  <InlineInput label="Country" value={form.country} onChange={(value) => updateField('country', value.toUpperCase())} labelWidthClassName="w-[72px]" />
                </div>
                <InlineTourInput value={form.tour_name} onChange={(value) => updateField('tour_name', value)} options={availableTours} labelWidthClassName="w-[72px]" />
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Venue"
              expanded={expandedSections.venue}
              onExpandedChange={(value) => setSectionExpanded('venue', value)}
              hasContent={sectionHasContent('venue', form)}
              visibilityState={form.visibility.show_venue}
              onVisibilityToggle={(value) => updateVisibility('show_venue', value)}
            >
              <div className="grid gap-3">
                <Input label="Venue name" value={form.venue_name} onChange={(value) => updateField('venue_name', value)} />
                <AddressAutocompleteField
                  label="Venue address"
                  value={form.venue_address}
                  mapsUrl={form.venue_maps_url}
                  city={form.city}
                  region={form.region}
                  onAddressChange={(value) => updateField('venue_address', value)}
                  onMapsUrlChange={(value) => updateField('venue_maps_url', value)}
                  onRegionDetected={(value) => updateField('region', value.toUpperCase())}
                  onCountryDetected={(value) => updateField('country', value.toUpperCase())}
                />
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Load / parking info"
              expanded={expandedSections.parking}
              onExpandedChange={(value) => setSectionExpanded('parking', value)}
              hasContent={sectionHasContent('parking', form)}
              visibilityState={form.visibility.show_parking_load_info}
              onVisibilityToggle={(value) => updateVisibility('show_parking_load_info', value)}
            >
              <Textarea label="Details" value={form.parking_load_info} onChange={(value) => updateField('parking_load_info', value)} />
            </CollapsibleSection>

            <CollapsibleSection
              title="Schedule"
              expanded={expandedSections.schedule}
              onExpandedChange={(value) => setSectionExpanded('schedule', value)}
              hasContent={sectionHasContent('schedule', form)}
              visibilityState={form.visibility.show_schedule}
              onVisibilityToggle={(value) => updateVisibility('show_schedule', value)}
            >
              <div className="space-y-3">
                {form.schedule_items.map((item, index) => (
                  <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Line {index + 1}</p>
                      <button type="button" onClick={() => removeScheduleRow(item.id)} className={dangerButtonClassName()}>
                        Delete
                      </button>
                    </div>
                    <div className="grid gap-3 md:hidden">
                      <InlineInput label="Label" value={item.label} onChange={(value) => updateScheduleItem(item.id, 'label', value)} labelWidthClassName="w-[56px]" />
                      <InlineInput label="Time" value={item.time} onChange={(value) => updateScheduleItem(item.id, 'time', value)} labelWidthClassName="w-[56px]" />
                    </div>
                    <div className="hidden gap-3 md:grid md:grid-cols-[minmax(0,2fr)_minmax(220px,1fr)]">
                      <Input label="Label" value={item.label} onChange={(value) => updateScheduleItem(item.id, 'label', value)} />
                      <Input label="Time" value={item.time} onChange={(value) => updateScheduleItem(item.id, 'time', value)} />
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addScheduleRow} className={secondaryButtonClassName()}>
                  Add line
                </button>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="DOS contact"
              expanded={expandedSections.dos}
              onExpandedChange={(value) => setSectionExpanded('dos', value)}
              hasContent={sectionHasContent('dos', form)}
              visibilityState={form.visibility.show_dos_contact}
              onVisibilityToggle={(value) => updateVisibility('show_dos_contact', value)}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Name" value={form.dos_name} onChange={(value) => updateField('dos_name', value)} />
                <Input label="Phone number" value={form.dos_phone} onChange={(value) => updateField('dos_phone', value)} />
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Accommodation"
              expanded={expandedSections.accommodation}
              onExpandedChange={(value) => setSectionExpanded('accommodation', value)}
              hasContent={sectionHasContent('accommodation', form)}
              visibilityState={form.visibility.show_accommodation}
              onVisibilityToggle={(value) => updateVisibility('show_accommodation', value)}
            >
              <div className="grid gap-3">
                <Input label="Hotel name" value={form.hotel_name} onChange={(value) => updateField('hotel_name', value)} />
                <AddressAutocompleteField
                  label="Hotel address"
                  value={form.hotel_address}
                  mapsUrl={form.hotel_maps_url}
                  city={form.city}
                  region={form.region}
                  onAddressChange={(value) => updateField('hotel_address', value)}
                  onMapsUrlChange={(value) => updateField('hotel_maps_url', value)}
                  onRegionDetected={(value) => updateField('region', value.toUpperCase())}
                  onCountryDetected={(value) => updateField('country', value.toUpperCase())}
                />
                <Textarea label="Hotel notes" value={form.hotel_notes} onChange={(value) => updateField('hotel_notes', value)} />
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Notes"
              expanded={expandedSections.notes}
              onExpandedChange={(value) => setSectionExpanded('notes', value)}
              hasContent={sectionHasContent('notes', form)}
              visibilityState={form.visibility.show_notes}
              onVisibilityToggle={(value) => updateVisibility('show_notes', value)}
            >
              <Textarea value={form.notes} onChange={(value) => updateField('notes', value)} ariaLabel="Notes" />
            </CollapsibleSection>

            <CollapsibleSection
              title="Guest List Notes"
              expanded={expandedSections.guestListNotes}
              onExpandedChange={(value) => setSectionExpanded('guestListNotes', value)}
              hasContent={sectionHasContent('guestListNotes', form)}
              visibilityState={form.visibility.show_guest_list_notes}
              onVisibilityToggle={(value) => updateVisibility('show_guest_list_notes', value)}
            >
              <Textarea value={form.guest_list_notes} onChange={(value) => updateField('guest_list_notes', value)} ariaLabel="Guest list notes" />
            </CollapsibleSection>

          </form>
        </section>
        </div>
      ) : mode === 'dates' || mode === 'drafts' ? (
        <section className="rounded-[28px] border border-white/10 bg-white/[0.045] p-4 sm:p-5">
          {message ? <div className="mb-3 text-xs text-emerald-300/90">{message}</div> : null}
          {isDraftsMode ? (
            <ShowListSection
              title="Drafts"
              search={draftSearch}
              onSearchChange={setDraftSearch}
              selectedTour={draftTour}
              onTourChange={setDraftTour}
              tours={draftTours}
              shows={filteredDraftShows}
              totalCount={draftShows.length}
              onEdit={loadShow}
              onExport={exportGuestList}
              onDelete={handleDelete}
              onDuplicate={duplicateShow}
              mode="drafts"
              onPublish={publishShow}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-end gap-3">
                <div className="flex gap-2">
                  <Link href="/admin/dates?tab=upcoming" className={adminTabClassName(datesTab === 'upcoming')}>
                    Upcoming
                  </Link>
                  <Link href="/admin/dates?tab=past" className={adminTabClassName(datesTab === 'past')}>
                    Past
                  </Link>
                </div>
              </div>

              <div className="mt-3">
                {datesTab === 'past' ? (
                  <ShowListSection
                    title="Past dates"
                    search={pastSearch}
                    onSearchChange={setPastSearch}
                    selectedTour={pastTour}
                    onTourChange={setPastTour}
                    tours={pastTours}
                    shows={filteredPastShows}
                    totalCount={pastShows.length}
                    groupedShows={pastShowsByYear}
                    stickyYears
                    onEdit={loadShow}
                    onExport={exportGuestList}
                    onDelete={handleDelete}
                    onDuplicate={duplicateShow}
                    onPublish={publishShow}
                  />
                ) : (
                  <ShowListSection
                    title="Upcoming dates"
                    search={upcomingSearch}
                    onSearchChange={setUpcomingSearch}
                    selectedTour={upcomingTour}
                    onTourChange={setUpcomingTour}
                    tours={upcomingTours}
                    shows={filteredUpcomingShows}
                    totalCount={upcomingShows.length}
                    onEdit={loadShow}
                    onExport={exportGuestList}
                    onDelete={handleDelete}
                    onDuplicate={duplicateShow}
                    onPublish={publishShow}
                  />
                )}
              </div>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}

function formatInviteDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function ProjectManagementSection({
  projects,
  activeProjectId,
  newArtistName,
  creatingArtist,
  renamingArtist,
  onNewArtistNameChange,
  onSelectProject,
  onCreateArtist,
  onRenameArtist,
  canDeleteArtist,
  onDeleteArtist,
}: {
  projects: ProjectSummary[];
  activeProjectId: string | null;
  newArtistName: string;
  creatingArtist: boolean;
  renamingArtist: boolean;
  onNewArtistNameChange: (value: string) => void;
  onSelectProject: (projectId: string | null) => void;
  onCreateArtist: () => void;
  onRenameArtist: (projectId: string, name: string) => Promise<void>;
  canDeleteArtist: boolean;
  onDeleteArtist: (project: ProjectSummary) => void;
}) {
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const menuRootRef = useRef<HTMLDivElement | null>(null);

  const renameTarget = projects.find((project) => project.id === renameTargetId) ?? null;

  useEffect(() => {
    if (!menuProjectId) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!menuRootRef.current?.contains(event.target as Node)) {
        setMenuProjectId(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuProjectId(null);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuProjectId]);
  const canUseDom = typeof document !== 'undefined';

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.045] p-4 sm:p-5">
      <div className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Project management</p>
          <h2 className="mt-1 text-base font-semibold text-zinc-100">Manage artists</h2>
        </div>

        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input
            value={newArtistName}
            onChange={(event) => onNewArtistNameChange(event.target.value)}
            placeholder="New artist name"
            className="h-11 w-full rounded-full border border-white/10 bg-black/20 px-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-400/40"
          />
          <button type="button" onClick={onCreateArtist} disabled={creatingArtist || !newArtistName.trim()} className={primaryButtonClassName()}>
            {creatingArtist ? 'Creating…' : 'Create artist'}
          </button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <p className="mb-2 text-xs uppercase tracking-[0.14em] text-zinc-500">Artists in workspace</p>
          {projects.length === 0 ? (
            <p className="text-sm text-zinc-400">No artists yet. Create your first artist above.</p>
          ) : (
            <div ref={menuRootRef} className="space-y-2">
              {projects.map((project) => {
                const isActive = project.id === activeProjectId;
                return (
                  <div key={project.id} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <button type="button" onClick={() => onSelectProject(project.id)} className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm text-zinc-100">{project.name || project.slug || project.id}</p>
                        {isActive ? <p className="text-xs text-zinc-400">Currently selected</p> : null}
                      </button>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setMenuProjectId((current) => (current === project.id ? null : project.id))}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.05]"
                          aria-label={`Project options for ${project.name || project.slug || project.id}`}
                        >
                          ⋯
                        </button>
                        {menuProjectId === project.id ? (
                          <div className="absolute right-0 z-10 mt-2 min-w-44 rounded-xl border border-white/10 bg-zinc-950 p-1 shadow-lg shadow-black/60">
                            <button
                              type="button"
                              onClick={() => {
                                setRenameTargetId(project.id);
                                setRenameValue(project.name || project.slug || '');
                                setMenuProjectId(null);
                              }}
                              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-200 transition hover:bg-white/[0.06]"
>
                              Rename
                            </button>
                            <Link
                              href={`/admin/team?contextProjectId=${encodeURIComponent(project.id)}`}
                              className="block rounded-lg px-3 py-2 text-left text-sm text-zinc-200 transition hover:bg-white/[0.06]"
                              onClick={() => setMenuProjectId(null)}
                            >
                              Invite
                            </Link>
                            {canDeleteArtist ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setMenuProjectId(null);
                                  onDeleteArtist(project);
                                }}
                                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-200 transition hover:bg-red-500/10"
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {renameTarget && canUseDom
          ? createPortal(
              <div
                className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 px-4"
                role="dialog"
                aria-modal="true"
                aria-label="Rename artist"
                onClick={() => {
                  setRenameTargetId(null);
                  setRenameValue('');
                }}
              >
                <div className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950 p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                  <div className="mb-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Rename artist</p>
                    <h3 className="mt-1 text-base font-semibold text-zinc-100">Update artist name</h3>
                  </div>
                  <input
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    placeholder="Artist name"
                    className="h-11 w-full rounded-full border border-white/10 bg-black/20 px-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-400/40"
                    autoFocus
                  />
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await onRenameArtist(renameTarget.id, renameValue);
                        setRenameTargetId(null);
                        setRenameValue('');
                      }}
                      disabled={renamingArtist || !renameValue.trim()}
                      className={primaryButtonClassName()}
                    >
                      {renamingArtist ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" onClick={() => { setRenameTargetId(null); setRenameValue(''); }} className={secondaryButtonClassName()}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>,
              document.body,
            )
          : null}
      </div>
    </section>
  );
}

function roleBadgeClassName(role: 'owner' | 'admin' | 'editor' | 'viewer') {
  if (role === 'owner') return 'border-amber-400/30 bg-amber-500/10 text-amber-100';
  if (role === 'admin') return 'border-sky-400/30 bg-sky-500/10 text-sky-100';
  if (role === 'editor') return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100';
  return 'border-white/10 bg-white/[0.06] text-zinc-200';
}

function inviteStatusBadgeClassName(status: WorkspaceInviteSummary['status']) {
  if (status === 'pending') return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100';
  if (status === 'accepted') return 'border-sky-400/30 bg-sky-500/10 text-sky-100';
  if (status === 'revoked') return 'border-red-400/30 bg-red-500/10 text-red-100';
  return 'border-white/10 bg-white/[0.06] text-zinc-300';
}

function directoryViewButtonClassName(active: boolean) {
  return `inline-flex h-9 items-center justify-center rounded-full border px-3 text-xs font-medium transition ${active ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100' : 'border-white/10 bg-transparent text-zinc-300 hover:border-white/20 hover:bg-white/[0.05]'}`;
}

function TeamDirectoryCard({
  title,
  secondary,
  subtitle,
  detail,
  role,
  status,
  contextLabel,
  action,
}: {
  title: string;
  secondary?: string | null;
  subtitle: string;
  detail?: string | null;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  status?: WorkspaceInviteSummary['status'] | null;
  contextLabel?: string | null;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-zinc-100">{title}</p>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${roleBadgeClassName(role)}`}>{role}</span>
            {status ? <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${inviteStatusBadgeClassName(status)}`}>{status}</span> : null}
            {contextLabel ? <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-zinc-300">{contextLabel}</span> : null}
          </div>
          {secondary ? <p className="mt-1 text-xs text-zinc-500">{secondary}</p> : null}
          <p className="mt-1 text-sm text-zinc-300">{subtitle}</p>
          {detail ? <p className="mt-1 text-xs text-zinc-500">{detail}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

function InviteManagementSection({
  invites,
  loading,
  name,
  email,
  role,
  scopeType,
  scopeProjectIds,
  scopeTourIds,
  availableProjects,
  availableTours,
  message,
  creating,
  lastInviteShare,
  showManualShare,
  onToggleManualShare,
  onNameChange,
  onEmailChange,
  onRoleChange,
  onScopeTypeChange,
  onScopeProjectIdsChange,
  onScopeTourIdsChange,
  onCreateInvite,
  onRevokeInvite,
  onCopyValue,
  contextProjectId,
}: {
  invites: WorkspaceInviteSummary[];
  loading: boolean;
  name: string;
  email: string;
  role: WorkspaceInviteRole;
  scopeType: 'workspace' | 'projects' | 'tours';
  scopeProjectIds: string[];
  scopeTourIds: string[];
  availableProjects: ProjectSummary[];
  availableTours: TourSummary[];
  message: string;
  creating: boolean;
  lastInviteShare: { token: string; link: string } | null;
  showManualShare: boolean;
  onToggleManualShare: () => void;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onRoleChange: (value: WorkspaceInviteRole) => void;
  onScopeTypeChange: (value: 'workspace' | 'projects' | 'tours') => void;
  onScopeProjectIdsChange: (value: string[]) => void;
  onScopeTourIdsChange: (value: string[]) => void;
  onCreateInvite: () => void;
  onRevokeInvite: (invite: WorkspaceInviteSummary) => void;
  onCopyValue: (value: string, successMessage: string) => void;
  contextProjectId?: string | null;
}) {
  const recentInvites = invites.slice(0, 12);
  const inviteGroups = splitInvitesByStatus(recentInvites);
  const projectNameById = new Map(availableProjects.map((project) => [project.id, project.name || project.slug || project.id]));
  const toursById = new Map(availableTours.map((tour) => [tour.id, { id: tour.id, name: tour.name || tour.id, projectId: tour.projectId }]));
  const contextProjectName = contextProjectId ? (projectNameById.get(contextProjectId) ?? null) : null;
  const [viewMode, setViewMode] = useState<'context' | 'workspace'>(contextProjectName ? 'context' : 'workspace');

  useEffect(() => {
    if (!contextProjectName) setViewMode('workspace');
  }, [contextProjectName]);

  const visiblePendingInvites = useMemo(
    () => viewMode === 'workspace' || !contextProjectId ? inviteGroups.pending : inviteGroups.pending.filter((invite) => matchesProjectContext(invite, contextProjectId, toursById)),
    [contextProjectId, inviteGroups.pending, toursById, viewMode],
  );
  const visibleHistoryInvites = useMemo(
    () => viewMode === 'workspace' || !contextProjectId ? inviteGroups.history : inviteGroups.history.filter((invite) => matchesProjectContext(invite, contextProjectId, toursById)),
    [contextProjectId, inviteGroups.history, toursById, viewMode],
  );

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.045] p-4 sm:p-5">
      <div className="space-y-3">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Workspace invites</p>
          <h2 className="mt-1 text-base font-semibold text-zinc-100">Invite team members</h2>
          <p className="mt-1 text-sm text-zinc-400">Pending invites now use the same access language as accepted members, so the whole team reads like one directory instead of two different systems.</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_160px_auto]">
          <input
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            type="text"
            placeholder="Name"
            className="h-11 w-full rounded-full border border-white/10 bg-black/20 px-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-400/40"
          />
          <input
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            type="email"
            placeholder="teammate@example.com"
            className="h-11 w-full rounded-full border border-white/10 bg-black/20 px-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-400/40"
          />
          <select
            value={role}
            onChange={(event) => {
              const nextRole = event.target.value as WorkspaceInviteRole;
              onRoleChange(nextRole);
              if (nextRole === 'admin') {
                onScopeTypeChange('workspace');
                onScopeProjectIdsChange([]);
                onScopeTourIdsChange([]);
              }
            }}
            className="h-11 rounded-full border border-white/10 bg-black/20 px-4 text-sm text-zinc-100 outline-none focus:border-emerald-400/40"
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
          <button type="button" onClick={onCreateInvite} disabled={creating} className={primaryButtonClassName()}>
            {creating ? 'Creating…' : 'Create invite'}
          </button>
        </div>

        <TeamScopeEditor
          prefix="invite"
          scopeType={scopeType}
          scopeProjectIds={scopeProjectIds}
          scopeTourIds={scopeTourIds}
          availableProjects={availableProjects}
          availableTours={availableTours}
          disableScopedAccess={role === 'admin'}
          disabledReason={role === 'admin' ? 'Admins always get full workspace access. Use editor or viewer for artist/tour-scoped access.' : undefined}
          onScopeTypeChange={onScopeTypeChange}
          onScopeProjectIdsChange={onScopeProjectIdsChange}
          onScopeTourIdsChange={onScopeTourIdsChange}
        />

        {message ? <p className="text-sm text-zinc-300">{message}</p> : null}

        {lastInviteShare ? (
          <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-sm text-emerald-100">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>Invite sent.</p>
              <button type="button" onClick={onToggleManualShare} className={secondaryButtonClassName()}>{showManualShare ? 'Hide manual invite link' : 'Show manual invite link'}</button>
            </div>
            {showManualShare ? (
              <div className="mt-3 space-y-2">
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 break-all">{lastInviteShare.link}</div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => onCopyValue(lastInviteShare.link, 'Invite link copied.')} className={secondaryButtonClassName()}>Copy link</button>
                  <button type="button" onClick={() => onCopyValue(lastInviteShare.token, 'Invite token copied.')} className={secondaryButtonClassName()}>Copy token</button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Invite directory</p>
              <p className="text-sm text-zinc-300">Pending invites are separated from historical invite activity for easier scanning.</p>
            </div>
            <div className="text-xs text-zinc-500">{visiblePendingInvites.length} pending · {visibleHistoryInvites.length} recent</div>
          </div>
          {contextProjectName ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-black/20 p-2">
              <p className="px-2 text-xs text-zinc-400">Viewing {viewMode === 'context' ? `current artist: ${contextProjectName}` : 'full workspace'} invites.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setViewMode('context')} className={directoryViewButtonClassName(viewMode === 'context')}>Current artist</button>
                <button type="button" onClick={() => setViewMode('workspace')} className={directoryViewButtonClassName(viewMode === 'workspace')}>Full workspace</button>
              </div>
            </div>
          ) : null}
          {loading ? (
            <p className="mt-3 text-sm text-zinc-400">Loading invites…</p>
          ) : recentInvites.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-400">No invites yet.</p>
          ) : visiblePendingInvites.length === 0 && visibleHistoryInvites.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-400">No invites match this view yet.</p>
          ) : (
            <div className="mt-3 space-y-4">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Pending invites</p>
                {visiblePendingInvites.length === 0 ? (
                  <p className="text-sm text-zinc-400">No pending invites.</p>
                ) : (
                  visiblePendingInvites.map((invite) => {
                    const scope = describeTeamScope(invite, { projectNameById, toursById });
                    const inContext = matchesProjectContext(invite, contextProjectId, toursById);
                    return (
                      <TeamDirectoryCard
                        key={invite.id}
                        title={invite.name || invite.email}
                        secondary={invite.name ? invite.email : null}
                        role={invite.role}
                        status={invite.status}
                        subtitle={`${scope.label} · expires ${formatInviteDate(invite.expiresAt)}`}
                        detail={scope.detail}
                        contextLabel={getContextLabel(invite.scopeType, inContext, contextProjectName)}
                        action={<button type="button" onClick={() => onRevokeInvite(invite)} className={dangerButtonClassName()}>Revoke</button>}
                      />
                    );
                  })
                )}
              </div>
              {visibleHistoryInvites.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Recent invite activity</p>
                  {visibleHistoryInvites.map((invite) => {
                    const scope = describeTeamScope(invite, { projectNameById, toursById });
                    const inContext = matchesProjectContext(invite, contextProjectId, toursById);
                    return (
                      <TeamDirectoryCard
                        key={invite.id}
                        title={invite.name || invite.email}
                        secondary={invite.name ? invite.email : null}
                        role={invite.role}
                        status={invite.status}
                        subtitle={`${scope.label} · updated ${formatInviteDate(invite.updatedAt)}`}
                        detail={scope.detail}
                        contextLabel={getContextLabel(invite.scopeType, inContext, contextProjectName)}
                      />
                    );
                  })}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function TeamScopeEditor({
  prefix,
  scopeType,
  scopeProjectIds,
  scopeTourIds,
  availableProjects,
  availableTours,
  disableScopedAccess = false,
  disabledReason,
  onScopeTypeChange,
  onScopeProjectIdsChange,
  onScopeTourIdsChange,
}: {
  prefix: string;
  scopeType: 'workspace' | 'projects' | 'tours';
  scopeProjectIds: string[];
  scopeTourIds: string[];
  availableProjects: ProjectSummary[];
  availableTours: TourSummary[];
  disableScopedAccess?: boolean;
  disabledReason?: string;
  onScopeTypeChange: (value: 'workspace' | 'projects' | 'tours') => void;
  onScopeProjectIdsChange: (value: string[]) => void;
  onScopeTourIdsChange: (value: string[]) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Access scope</p>
      <div className="mt-2 space-y-2">
        <label className="flex items-start gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-200">
          <input type="radio" name={`${prefix}-scope`} checked={scopeType === 'workspace'} onChange={() => onScopeTypeChange('workspace')} className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/20" />
          <span><span className="block font-medium">Full workspace</span><span className="text-xs text-zinc-500">All artists and tours in this workspace.</span></span>
        </label>
        <label className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${disableScopedAccess ? 'border-white/5 bg-black/10 text-zinc-500' : 'border-white/10 bg-black/20 text-zinc-200'}`}>
          <input
            type="radio"
            name={`${prefix}-scope`}
            checked={scopeType === 'projects'}
            disabled={disableScopedAccess}
            onChange={() => {
              if (scopeType !== 'projects') {
                onScopeProjectIdsChange([]);
                onScopeTourIdsChange([]);
              }
              onScopeTypeChange('projects');
            }}
            className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/20"
          />
          <span><span className="block font-medium">Selected artists</span><span className="text-xs text-zinc-500">Access only the artists checked below.</span></span>
        </label>
        <label className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${disableScopedAccess ? 'border-white/5 bg-black/10 text-zinc-500' : 'border-white/10 bg-black/20 text-zinc-200'}`}>
          <input
            type="radio"
            name={`${prefix}-scope`}
            checked={scopeType === 'tours'}
            disabled={disableScopedAccess}
            onChange={() => {
              if (scopeType !== 'tours') {
                onScopeProjectIdsChange([]);
                onScopeTourIdsChange([]);
              }
              onScopeTypeChange('tours');
            }}
            className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/20"
          />
          <span><span className="block font-medium">Selected tours</span><span className="text-xs text-zinc-500">Restrict access to specific tours only.</span></span>
        </label>
      </div>

      {disableScopedAccess && disabledReason ? <p className="mt-3 text-sm text-zinc-500">{disabledReason}</p> : null}

      <div className="mt-3 space-y-2">
        <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Artists</p>
        {availableProjects.length === 0 ? (
          <p className="text-sm text-zinc-400">No artists available in this workspace.</p>
        ) : (
          availableProjects.map((project) => {
            const checked = scopeProjectIds.includes(project.id);
            return (
              <label key={project.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${scopeType === 'projects' || scopeType === 'tours' ? 'border-white/10 bg-black/20 text-zinc-200' : 'border-white/5 bg-black/10 text-zinc-500'}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={scopeType === 'workspace'}
                  onChange={(event) => {
                    const next = event.target.checked ? [...scopeProjectIds, project.id] : scopeProjectIds.filter((id) => id !== project.id);
                    if (!event.target.checked && scopeType === 'tours') {
                      onScopeTourIdsChange(scopeTourIds.filter((id) => availableTours.some((tour) => tour.id === id && tour.projectId !== project.id)));
                    }
                    if (scopeType === 'workspace') onScopeTypeChange('projects');
                    onScopeProjectIdsChange([...new Set(next)]);
                  }}
                  className="h-4 w-4 rounded border-white/20 bg-black/20"
                />
                <span>{project.name || project.slug || project.id}</span>
              </label>
            );
          })
        )}
      </div>

      {scopeType === 'tours' ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Tours</p>
          {availableTours.length === 0 ? (
            <p className="text-sm text-zinc-400">No tours available for the selected artist scope yet.</p>
          ) : (
            availableTours.map((tour) => {
              const checked = scopeTourIds.includes(tour.id);
              return (
                <label key={tour.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-200">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      const next = event.target.checked ? [...scopeTourIds, tour.id] : scopeTourIds.filter((id) => id !== tour.id);
                      onScopeTypeChange('tours');
                      onScopeTourIdsChange([...new Set(next)]);
                      if (!scopeProjectIds.includes(tour.projectId)) {
                        onScopeProjectIdsChange([...new Set([...scopeProjectIds, tour.projectId])]);
                      }
                    }}
                    className="h-4 w-4 rounded border-white/20 bg-black/20"
                  />
                  <span>{tour.name || tour.id}</span>
                </label>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

function EditMemberDialog({
  open,
  member,
  role,
  scopeType,
  projectIds,
  tourIds,
  availableProjects,
  availableTours,
  canAssignAdmin,
  saving,
  onClose,
  onRoleChange,
  onScopeTypeChange,
  onProjectIdsChange,
  onTourIdsChange,
  onSave,
}: {
  open: boolean;
  member: WorkspaceMemberDirectoryEntry | null;
  role: EditableWorkspaceMemberRole;
  scopeType: 'workspace' | 'projects' | 'tours';
  projectIds: string[];
  tourIds: string[];
  availableProjects: ProjectSummary[];
  availableTours: TourSummary[];
  canAssignAdmin: boolean;
  saving: boolean;
  onClose: () => void;
  onRoleChange: (value: EditableWorkspaceMemberRole) => void;
  onScopeTypeChange: (value: 'workspace' | 'projects' | 'tours') => void;
  onProjectIdsChange: (value: string[]) => void;
  onTourIdsChange: (value: string[]) => void;
  onSave: () => void;
}) {
  if (!open || !member || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/70 px-4 pb-6 pt-12 sm:items-center" role="dialog" aria-modal="true" aria-label="Edit team member" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-zinc-950 p-4 shadow-2xl sm:p-5" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Edit member</p>
            <h3 className="mt-1 text-base font-semibold text-zinc-100">{member.name || member.email || member.userId}</h3>
            {member.name && member.email ? <p className="mt-1 text-xs text-zinc-500">{member.email}</p> : null}
            <p className="mt-1 text-sm text-zinc-400">Update role and access scope without resending an invite.</p>
          </div>
          <button type="button" onClick={onClose} className={secondaryButtonClassName()}>Close</button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center">
          <label className="text-sm font-medium text-zinc-200">Role</label>
          <select value={role} onChange={(event) => {
            const nextRole = event.target.value as EditableWorkspaceMemberRole;
            onRoleChange(nextRole);
            if (nextRole === 'admin') {
              onScopeTypeChange('workspace');
              onProjectIdsChange([]);
              onTourIdsChange([]);
            }
          }} className="h-11 rounded-full border border-white/10 bg-black/20 px-4 text-sm text-zinc-100 outline-none focus:border-emerald-400/40">
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
            {canAssignAdmin ? <option value="admin">Admin</option> : null}
          </select>
        </div>

        <div className="mt-4">
          <TeamScopeEditor
            prefix="edit-member"
            scopeType={scopeType}
            scopeProjectIds={projectIds}
            scopeTourIds={tourIds}
            availableProjects={availableProjects}
            availableTours={availableTours}
            disableScopedAccess={role === 'admin'}
            disabledReason={role === 'admin' ? 'Admins always get full workspace access. Use editor or viewer for artist/tour-scoped access.' : undefined}
            onScopeTypeChange={onScopeTypeChange}
            onScopeProjectIdsChange={onProjectIdsChange}
            onScopeTourIdsChange={onTourIdsChange}
          />
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onSave} disabled={saving} className={primaryButtonClassName()}>{saving ? 'Saving…' : 'Save changes'}</button>
          <button type="button" onClick={onClose} className={secondaryButtonClassName()}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TeamMembersSection({
  members,
  loading,
  projects,
  tours,
  onEditMember,
  onRemoveMember,
  contextProjectId,
}: {
  members: WorkspaceMemberDirectoryEntry[];
  loading: boolean;
  projects: ProjectSummary[];
  tours: TourSummary[];
  onEditMember: (member: WorkspaceMemberDirectoryEntry) => void;
  onRemoveMember: (member: WorkspaceMemberDirectoryEntry) => void;
  contextProjectId?: string | null;
}) {
  const projectNameById = new Map(projects.map((project) => [project.id, project.name || project.slug || project.id]));
  const toursById = new Map(tours.map((tour) => [tour.id, { id: tour.id, name: tour.name || tour.id, projectId: tour.projectId }]));
  const contextProjectName = contextProjectId ? (projectNameById.get(contextProjectId) ?? null) : null;
  const [viewMode, setViewMode] = useState<'context' | 'workspace'>(contextProjectName ? 'context' : 'workspace');

  useEffect(() => {
    if (!contextProjectName) setViewMode('workspace');
  }, [contextProjectName]);

  const sortedMembers = [...members].sort((a, b) => {
    const aInContext = matchesProjectContext(a, contextProjectId, toursById) ? 1 : 0;
    const bInContext = matchesProjectContext(b, contextProjectId, toursById) ? 1 : 0;
    if (aInContext !== bInContext) return bInContext - aInContext;
    return (a.email || a.userId).localeCompare(b.email || b.userId);
  });
  const visibleMembers = viewMode === 'workspace' || !contextProjectId
    ? sortedMembers
    : sortedMembers.filter((member) => matchesProjectContext(member, contextProjectId, toursById));

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.045] p-4 sm:p-5">
      <div className="space-y-3">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Members</p>
          <h2 className="mt-1 text-base font-semibold text-zinc-100">Accepted team members</h2>
          <p className="mt-1 text-sm text-zinc-400">Same access labels as invites, with a cleaner switch between current artist and full workspace views.</p>
        </div>

        {contextProjectName ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-black/20 p-2">
            <p className="px-2 text-xs text-zinc-400">Viewing {viewMode === 'context' ? `current artist: ${contextProjectName}` : 'full workspace'} members.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setViewMode('context')} className={directoryViewButtonClassName(viewMode === 'context')}>Current artist</button>
              <button type="button" onClick={() => setViewMode('workspace')} className={directoryViewButtonClassName(viewMode === 'workspace')}>Full workspace</button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-zinc-400">Loading members…</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-zinc-400">No team members found yet.</p>
        ) : visibleMembers.length === 0 ? (
          <p className="text-sm text-zinc-400">No accepted members match this view yet.</p>
        ) : (
          <div className="space-y-2">
            {visibleMembers.map((member) => {
              const scope = describeTeamScope(member, { projectNameById, toursById });
              const inContext = matchesProjectContext(member, contextProjectId, toursById);
              return (
                <TeamDirectoryCard
                  key={member.id}
                  title={member.name || member.email || member.userId}
                  secondary={member.name && member.email ? member.email : null}
                  role={member.role}
                  subtitle={`${scope.label}${member.createdAt ? ` · joined ${formatInviteDate(member.createdAt)}` : ''}`}
                  detail={scope.detail}
                  contextLabel={getContextLabel(member.scopeType, inContext, contextProjectName)}
                  action={member.role !== 'owner' ? (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => onEditMember(member)} className={secondaryButtonClassName()}>Edit</button>
                      <button type="button" onClick={() => onRemoveMember(member)} className={dangerButtonClassName()}>Remove</button>
                    </div>
                  ) : null}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function CollapsibleSection({
  title,
  expanded,
  onExpandedChange,
  hasContent,
  visibilityState,
  onVisibilityToggle,
  children,
}: {
  title: string;
  expanded: boolean;
  onExpandedChange: (value: boolean) => void;
  hasContent: boolean;
  visibilityState?: boolean;
  onVisibilityToggle?: (value: boolean) => void;
  children: ReactNode;
}) {
  return (
    <section className={bubbleClassName()}>
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => onExpandedChange(!expanded)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <h2 className="truncate text-base font-semibold">{title}</h2>
          {!expanded && hasContent ? (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
              {typeof visibilityState === 'boolean' ? <span className="text-xs font-medium text-zinc-400">{visibilityState ? 'Visible' : 'Hidden'}</span> : null}
            </>
          ) : null}
        </button>
        <div className="flex items-center gap-2">
          {expanded && typeof visibilityState === 'boolean' && onVisibilityToggle ? <Toggle enabled={visibilityState} onToggle={onVisibilityToggle} /> : null}
          <button
            type="button"
            onClick={() => onExpandedChange(!expanded)}
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300"
            aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`}
          >
            <span className={`inline-block transition-transform ${expanded ? 'rotate-90' : 'rotate-0'}`}>›</span>
          </button>
        </div>
      </div>
      {expanded ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}


function ShowListSection({
  title,
  search,
  onSearchChange,
  selectedTour,
  onTourChange,
  tours,
  shows,
  totalCount,
  groupedShows,
  stickyYears = false,
  onEdit,
  onExport,
  onDelete,
  onDuplicate,
  mode = 'dates',
  onPublish,
}: {
  title: string;
  search: string;
  onSearchChange: (value: string) => void;
  selectedTour: string;
  onTourChange: (value: string) => void;
  tours: string[];
  shows: Show[];
  totalCount: number;
  groupedShows?: Array<[string, Show[]]>;
  stickyYears?: boolean;
  onEdit: (show: Show) => void;
  onExport: (showId: string) => void;
  onDelete: (showId: string) => void;
  onDuplicate: (show: Show) => void;
  mode?: 'dates' | 'drafts';
  onPublish?: (show: Show) => void;
}) {
  const [menuState, setMenuState] = useState<{ show: Show; top: number; left: number } | null>(null);
  const hasActiveFilters = Boolean(search.trim()) || selectedTour !== 'All';

  useEffect(() => {
    if (!menuState) return;

    function closeMenuOnViewportChange() {
      setMenuState(null);
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-admin-menu-portal="true"]') || target?.closest('[data-admin-menu-trigger="true"]')) return;
      setMenuState(null);
    }

    window.addEventListener('scroll', closeMenuOnViewportChange, true);
    window.addEventListener('resize', closeMenuOnViewportChange);
    document.addEventListener('mousedown', handlePointerDown);

    return () => {
      window.removeEventListener('scroll', closeMenuOnViewportChange, true);
      window.removeEventListener('resize', closeMenuOnViewportChange);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [menuState]);

  function openMenuForShow(show: Show, trigger: HTMLButtonElement) {
    const rect = trigger.getBoundingClientRect();
    const menuWidth = 220;
    const menuHeight = mode === 'drafts' ? 116 : show.status === 'draft' ? 168 : 168;
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : rect.right;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : rect.bottom;
    const left = Math.max(16, Math.min(rect.left, viewportWidth - menuWidth - 16));
    const top = Math.max(16, Math.min(rect.bottom + 8, viewportHeight - menuHeight - 16));
    setMenuState({ show, top, left });
  }

  function runMenuAction(action: () => void) {
    setMenuState(null);
    action();
  }

  function renderMenuActions(show: Show) {
    if (mode === 'drafts') {
      return (
        <>
          <MenuButton label="Publish" onClick={() => runMenuAction(() => onPublish?.(show))} />
          <MenuButton label="Delete" destructive onClick={() => runMenuAction(() => onDelete(show.id))} />
        </>
      );
    }

    if (show.status === 'draft') {
      return (
        <>
          <MenuButton label="Publish" onClick={() => runMenuAction(() => onPublish?.(show))} />
          <MenuButton label="Duplicate date" onClick={() => runMenuAction(() => onDuplicate(show))} />
          <MenuButton label="Delete" destructive onClick={() => runMenuAction(() => onDelete(show.id))} />
        </>
      );
    }

    return (
      <>
        <MenuButton label="Export guest list" onClick={() => runMenuAction(() => onExport(show.id))} />
        <MenuButton label="Duplicate date" onClick={() => runMenuAction(() => onDuplicate(show))} />
        <MenuButton label="Delete" destructive onClick={() => runMenuAction(() => onDelete(show.id))} />
      </>
    );
  }

  function renderShowListItem(show: Show) {
    const menuOpen = menuState?.show.id === show.id;
    const href = mode === 'drafts'
      ? `/admin?edit=${encodeURIComponent(show.id)}&returnTo=${encodeURIComponent('/admin/drafts')}`
      : show.status === 'draft'
        ? `/admin?edit=${encodeURIComponent(show.id)}&returnTo=${encodeURIComponent(`/admin/dates?tab=${title.toLowerCase().includes('past') ? 'past' : 'upcoming'}`)}`
        : `/admin/dates/${show.id}?tab=${title.toLowerCase().includes('past') ? 'past' : 'upcoming'}`;

    return (
      <div key={show.id} className="relative rounded-2xl border border-white/8 bg-black/20 p-3">
        <div className="flex items-start justify-between gap-3">
          <Link href={href} className="min-w-0 flex-1 rounded-xl outline-none transition hover:opacity-95">
            <p className="text-xs uppercase tracking-wide text-zinc-400">{formatShowDate(show.date)}</p>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-sm font-medium">{show.city}{show.region ? `, ${show.region}` : ''}</p>
              {show.status === 'draft' ? <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-300">Draft</span> : null}
            </div>
            <p className="text-sm text-zinc-300">{show.venue_name}</p>
          </Link>

          <div className="flex shrink-0 items-center gap-2 self-start" onClick={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}>
            <button
              type="button"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); onEdit(show); }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-transparent text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.05]"
              aria-label="Edit date"
            >
              <PencilIcon />
            </button>
            <button
              type="button"
              data-admin-menu-trigger="true"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                if (menuOpen) {
                  setMenuState(null);
                  return;
                }
                openMenuForShow(show, event.currentTarget);
              }}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-zinc-200 transition ${menuOpen ? "border-sky-300 bg-sky-500/10" : "border-white/10 bg-transparent hover:border-white/20 hover:bg-white/[0.05]"}` }
              aria-label="More actions"
            >
              …
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.045] p-4">
      <div className="space-y-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <SearchInput value={search} onChange={onSearchChange} />
          </div>
          <div className="w-[132px] shrink-0 sm:w-[180px]">
            <SelectField label="Tour" value={selectedTour} onChange={onTourChange} options={tours} compact hideLabel selectClassName={filterFieldClassName()} />
          </div>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={() => {
                onSearchChange('');
                onTourChange('All');
              }}
              className={inlineFilterButtonClassName()}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {shows.length === 0 ? (
          <div className="rounded-2xl bg-black/20 p-3 text-sm text-zinc-400">
            {totalCount === 0 ? `No ${mode === 'drafts' ? 'drafts' : 'dates'} yet.` : 'No shows match this filter.'}
          </div>
        ) : groupedShows && groupedShows.length > 0 ? (
          groupedShows.map(([year, items]) => (
            <section key={year} className="space-y-3">
              <div className={`border-b border-white/10 px-4 py-2 text-sm font-medium tracking-wide text-zinc-400 backdrop-blur ${stickyYears ? 'sticky top-[96px] z-10 bg-zinc-950/95' : ''}`}>{year}</div>
              <div className="space-y-3">{items.map((show) => renderShowListItem(show))}</div>
            </section>
          ))
        ) : (
          shows.map((show) => renderShowListItem(show))
        )}
      </div>

      {menuState && typeof document !== 'undefined'
        ? createPortal(
            <div
              data-admin-menu-portal="true"
              className="fixed z-[260] min-w-[220px] overflow-hidden rounded-2xl border border-zinc-700/90 bg-black shadow-[0_28px_80px_rgba(0,0,0,0.92)] ring-1 ring-white/10"
              style={{ top: menuState.top, left: menuState.left }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              {renderMenuActions(menuState.show)}
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}


function SearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <Input label="Search" value={value} onChange={onChange} placeholder="Search" compact hideLabel inputClassName={filterFieldClassName()} />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
          aria-label="Clear search"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

function MenuButton({ label, onClick, destructive = false }: { label: string; onClick: () => void; destructive?: boolean }) {
  return (
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      className={`block w-full border-b border-white/10 bg-black px-4 py-3 text-left text-sm transition hover:bg-white/[0.06] last:border-b-0 ${destructive ? 'text-red-200' : 'text-zinc-100'}`}
    >
      {label}
    </button>
  );
}

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: (value: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!enabled)}
      className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium ${enabled ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-white/10 text-zinc-300'}`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${enabled ? 'bg-emerald-300' : 'bg-zinc-500'}`} />
      {enabled ? 'Show' : 'Hide'}
    </button>
  );
}

function ChevronDownIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PencilIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M12 20H21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M16.5 3.5C17.3284 2.67157 18.6716 2.67157 19.5 3.5C20.3284 4.32843 20.3284 5.67157 19.5 6.5L8 18L4 19L5 15L16.5 3.5Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CalendarIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M8 2V5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M16 2V5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M3 9H21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <rect x="3" y="4" width="18" height="17" rx="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function Input({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  compact = false,
  hideLabel = false,
  inputClassName,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  compact?: boolean;
  hideLabel?: boolean;
  inputClassName?: string;
}) {
  return (
    <label className="block text-sm text-zinc-300">
      {!hideLabel ? <span className={`block ${compact ? 'mb-1 text-sm' : 'mb-1'}`}>{label}</span> : null}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        className={inputClassName ?? fieldClassName()}
      />
    </label>
  );
}


function InlineInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  labelWidthClassName,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  labelWidthClassName?: string;
}) {
  return (
    <label className="flex items-center gap-3 text-sm text-zinc-300">
      <span className={`${labelWidthClassName ?? 'w-[72px]'} shrink-0 text-zinc-300`}>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        className={`${fieldClassName()} min-w-0 flex-1`}
      />
    </label>
  );
}

function FlexibleDateInput({
  label,
  value,
  onChange,
  labelWidthClassName,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  labelWidthClassName?: string;
}) {
  const textInputId = useId();
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const pickerInputRef = useRef<HTMLInputElement | null>(null);

  function commitNextValue(rawValue: string) {
    const normalized = parseFlexibleDateInput(rawValue);
    onChange(normalized || rawValue.trim());
  }

  function openPicker() {
    const picker = pickerInputRef.current;
    if (!picker) return;
    const normalizedValue = parseFlexibleDateInput(value);
    if (normalizedValue) {
      picker.value = normalizedValue;
    }
    const pickerWithShow = picker as HTMLInputElement & { showPicker?: () => void };
    if (typeof pickerWithShow.showPicker === 'function') {
      pickerWithShow.showPicker();
      return;
    }
    picker.focus();
    picker.click();
  }

  return (
    <div className="flex items-center gap-3 text-sm text-zinc-300">
      <label htmlFor={textInputId} className={`${labelWidthClassName ?? 'w-[72px]'} shrink-0 text-zinc-300`}>
        {label}
      </label>
      <div className="relative min-w-0 flex-1">
        <input
          ref={textInputRef}
          id={textInputId}
          type="text"
          value={value}
          aria-label={label}
          inputMode="numeric"
          placeholder="YYYY-MM-DD"
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => commitNextValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitNextValue((event.target as HTMLInputElement).value);
            }
          }}
          className={`${fieldClassName()} min-w-0 flex-1 pr-12`}
        />
        <div className="absolute inset-y-0 right-2 flex items-center">
          <button
            type="button"
            aria-label={`Choose ${label.toLowerCase()}`}
            onClick={openPicker}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.05] hover:text-zinc-200"
          >
            <CalendarIcon />
            <input
              ref={pickerInputRef}
              type="date"
              aria-label={`${label} picker`}
              className="absolute inset-0 cursor-pointer opacity-0"
              value={parseFlexibleDateInput(value)}
              onChange={(event) => onChange(event.target.value)}
              onFocus={() => textInputRef.current?.blur()}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  compact = false,
  emptyLabel,
  hideLabel = false,
  selectClassName,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  compact?: boolean;
  emptyLabel?: string;
  hideLabel?: boolean;
  selectClassName?: string;
}) {
  return (
    <label className="block text-sm text-zinc-300">
      {!hideLabel ? <span className={`block ${compact ? 'mb-1 text-sm' : 'mb-1'}`}>{label}</span> : null}
      <div className="relative">
        <select
          value={value}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
          className={`${selectClassName ?? fieldClassName()} appearance-none pr-11`}
        >
          {emptyLabel ? <option value="">{emptyLabel}</option> : null}
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-zinc-400">
          <ChevronDownIcon className="h-4 w-4" />
        </span>
      </div>
    </label>
  );
}


function InlineTourInput({ value, onChange, options, labelWidthClassName }: { value: string; onChange: (value: string) => void; options: string[]; labelWidthClassName?: string }) {
  const [forceCreatingNew, setForceCreatingNew] = useState(false);
  const inferredCreatingNew = !options.includes(value) && value.trim().length > 0;
  const creatingNew = forceCreatingNew || inferredCreatingNew;
  const selectedValue = creatingNew ? '__new__' : value;

  return (
    <div className="space-y-2 text-sm text-zinc-300">
      <label className="flex items-center gap-3 text-sm text-zinc-300">
        <span className={`${labelWidthClassName ?? 'w-[56px]'} shrink-0 text-zinc-300`}>Tour</span>
        <div className="relative min-w-0 flex-1">
          <select
            value={selectedValue}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (nextValue === '__new__') {
                setForceCreatingNew(true);
                onChange('');
                return;
              }
              setForceCreatingNew(false);
              onChange(nextValue);
            }}
            className={`${fieldClassName()} min-w-0 flex-1 appearance-none pr-11`}
          >
            <option value="">No tour assigned</option>
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            <option value="__new__">Create new tour…</option>
          </select>
          <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-zinc-400">
            <ChevronDownIcon />
          </span>
        </div>
      </label>

      {creatingNew ? (
        <label className="flex items-center gap-3 text-sm text-zinc-300">
          <span className={`${labelWidthClassName ?? 'w-[56px]'} shrink-0 text-zinc-300`}>New tour</span>
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={`${fieldClassName()} min-w-0 flex-1`}
            placeholder="Type a new tour name"
          />
        </label>
      ) : null}
    </div>
  );
}

function TourInput({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  const [forceCreatingNew, setForceCreatingNew] = useState(false);
  const inferredCreatingNew = !options.includes(value) && value.trim().length > 0;
  const creatingNew = forceCreatingNew || inferredCreatingNew;
  const selectedValue = creatingNew ? '__new__' : value;

  return (
    <div className="space-y-2 text-sm text-zinc-300">
      <label className="block">
        <span className="mb-1 block">Tour</span>
        <div className="relative">
          <select
            value={selectedValue}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (nextValue === '__new__') {
                setForceCreatingNew(true);
                onChange('');
                return;
              }
              setForceCreatingNew(false);
              onChange(nextValue);
            }}
            className={`${fieldClassName()} min-w-0 flex-1 appearance-none pr-11`}
          >
            <option value="">No tour assigned</option>
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            <option value="__new__">Create new tour…</option>
          </select>
          <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-zinc-400">
            <ChevronDownIcon />
          </span>
        </div>
      </label>

      {creatingNew ? (
        <label className="block">
          <span className="mb-1 block">New tour name</span>
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={fieldClassName()}
            placeholder="Type a new tour name"
          />
        </label>
      ) : null}
    </div>
  );
}

function Textarea({ label, value, onChange, ariaLabel, placeholder }: { label?: string; value: string; onChange: (value: string) => void; ariaLabel?: string; placeholder?: string }) {
  return (
    <label className="block text-sm text-zinc-300">
      {label ? <span className="mb-1 block">{label}</span> : null}
      <textarea
        aria-label={ariaLabel ?? label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={4}
        className="w-full rounded-[24px] border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-emerald-400/40"
      />
    </label>
  );
}

'use client';

import Link from 'next/link';
import { ChangeEvent, DragEvent, FormEvent, ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { ActivationEmptyState } from '@/components/activation-empty-state';
import { AddressAutocompleteField } from '@/components/address-autocomplete-field';
import { AttachmentsManager } from '@/components/attachments-manager';
import { PendingAttachmentsPicker, getPendingDisplayName } from '@/components/pending-attachments-picker';
import { UploadDropzoneContent, uploadDropzoneClassName } from '@/components/upload-dropzone';
import { useAppContext } from '@/hooks/use-app-context';
import { FIELD_CLASS_NAME } from '@/lib/ui/field-styles';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { createArtist, createWorkspace, createWorkspaceInvite, deleteArtist, deleteShow, exportGuestListCsv, getShow, listShows, listWorkspaceInvites, listWorkspaceMembers, removeWorkspaceMember, renameArtist, resendWorkspaceInvite, revokeWorkspaceInvite, updateWorkspaceMember, uploadAttachment, upsertShow } from '@/lib/data-client';
import { formatShowDate, isPastShow, isValidStoredDate, yearFromDate } from '@/lib/date';
import { createEmptyScheduleItems, emptyShowForm } from '@/lib/defaults';
import { mapDateRecordToShow } from '@/lib/adapters/date-show';
import { ensureMinimumScheduleItems } from '@/lib/normalize';
import { Show, ShowFormValues, ShowStatus, TourDayType } from '@/lib/types';
import { trackActivationEvent } from '@/lib/activation-telemetry';
import { trackInviteEvent } from '@/lib/invite-telemetry';
import { canAccessAdminWorkspace, canCreateArtists, canManageInvites, canManageProjects, getFirstAdminWorkspaceId, getWorkspaceRole, hasAnyAdminAccess, roleDescription, roleLabel, type AssignableRole } from '@/lib/roles';
import { getAdminNoArtistsGuardrail } from '@/lib/activation/first-run';
import type { IntakeRow } from '@/lib/ai/intake-types';
import type { ProjectSummary, TourSummary, WorkspaceInviteRole, WorkspaceInviteSummary, WorkspaceMemberDirectoryEntry, WorkspaceRole, WorkspaceSummary } from '@/lib/types/tenant';
import { getBrowserSupabaseClient } from '@/lib/supabase/client';
import { buildAcceptedTeamDirectory, matchesProjectContext, splitInvitesByStatus, summarizeTeamAccess } from '@/lib/ui/team-directory';
import { getRelevantSectionsForDayType, isSectionRelevantForDayType, sanitizeShowFormForDayType, type TourDaySectionKey } from '@/lib/tour-day';
import { ChevronIcon, EyeIcon, EyeOffIcon, MoreIcon, PlusIcon } from '@/components/icons';
import { ListSkeleton, SkeletonBlock } from '@/components/skeleton';
import { LogoutButton } from '@/components/logout-button';

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function bubbleClassName() {
  return 'rounded-xl border border-white/10 bg-black/20 p-4';
}

function primaryButtonClassName() {
  return 'inline-flex h-11 items-center justify-center rounded-[10px] bg-accent px-4 text-sm font-medium text-zinc-950 transition hover:bg-accent-hover disabled:opacity-60';
}

function secondaryButtonClassName() {
  return 'inline-flex h-11 items-center justify-center rounded-[10px] border border-white/10 bg-transparent px-4 text-sm font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.05]';
}

function dangerButtonClassName() {
  return 'inline-flex h-11 items-center justify-center rounded-[10px] border border-red-500/35 bg-transparent px-4 text-sm font-medium text-red-200 transition hover:border-red-400/40 hover:bg-red-500/10';
}

function onboardingWorkspaceSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function filterShows(shows: Show[], search: string, selectedTour: string) {
  const normalizedSearch = search.trim().toLowerCase();
  return shows.filter((show) => {
    const normalizedTour = show.tour_name.trim();
    const matchesTour = selectedTour === 'All' || selectedTour === 'Hide drafts' || normalizedTour === selectedTour;
    const matchesStatus = selectedTour !== 'Hide drafts' || show.status !== 'draft';
    const haystack = [show.city, show.region, show.venue_name, show.label, show.day_type, formatShowDate(show.date), show.date, show.tour_name].join(' ').toLowerCase();
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
  return `inline-flex min-h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-[10px] border px-4 py-2 text-sm transition sm:min-h-0 sm:px-3 sm:py-2 ${active ? 'border-accent/40 bg-accent-soft text-accent-light' : 'border-white/10 text-zinc-200 hover:border-white/20 hover:bg-white/5'}`;
}


function fieldClassName() {
  return FIELD_CLASS_NAME;
}

function filterFieldClassName() {
  return 'h-11 w-full rounded-[10px] border border-white/10 bg-black/20 px-4 pr-10 text-sm outline-none placeholder:text-zinc-500 focus:border-accent/40';
}

function inlineFilterButtonClassName() {
  return 'inline-flex h-11 shrink-0 items-center justify-center rounded-[10px] border border-white/10 bg-transparent px-4 text-sm font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.05]';
}

type SectionKey = TourDaySectionKey;
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

function ensureEditorScheduleRows(form: ShowFormValues, minimumCount = 3): ShowFormValues {
  return {
    ...form,
    schedule_items: ensureMinimumScheduleItems(form.schedule_items, minimumCount),
  };
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

function getExpandedSectionsForDayType(dayType: TourDayType, current: ExpandedSections, form: ShowFormValues): ExpandedSections {
  const relevantSections = new Set(getRelevantSectionsForDayType(dayType));

  return {
    basics: true,
    venue: relevantSections.has('venue') ? current.venue || sectionHasContent('venue', form) : false,
    parking: relevantSections.has('parking') ? current.parking || sectionHasContent('parking', form) : false,
    schedule: relevantSections.has('schedule') ? true : false,
    dos: relevantSections.has('dos') ? current.dos || sectionHasContent('dos', form) : false,
    accommodation: relevantSections.has('accommodation') ? current.accommodation || sectionHasContent('accommodation', form) : false,
    notes: relevantSections.has('notes') ? current.notes || sectionHasContent('notes', form) : false,
    guestListNotes: relevantSections.has('guestListNotes') ? current.guestListNotes || sectionHasContent('guestListNotes', form) : false,
  };
}

function shouldRenderSection(section: SectionKey, form: ShowFormValues) {
  return isSectionRelevantForDayType(section, form.day_type) || sectionHasContent(section, form);
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


function getAdminListPrimaryLabel(show: Show): string {
  if (show.day_type === 'off') {
    const loc = show.city || show.venue_name;
    return loc ? `Off day \u2014 ${loc}` : 'Off day';
  }
  if (show.day_type === 'travel') {
    return 'Travel day';
  }
  return `${show.city}${show.region ? `, ${show.region}` : ''}`;
}

function getAdminListSubLabel(show: Show): string | null {
  if (show.day_type === 'travel') {
    return show.venue_name || show.city || null;
  }
  if (show.day_type === 'off') {
    if (show.venue_name && show.venue_name !== show.city) return show.venue_name;
    return null;
  }
  return show.venue_name || null;
}

function initialEditTabFromParams(mode: string, params: { get(name: string): string | null }) {
  return mode === 'new' && Boolean(params.get('edit'));
}

function getDayTypeBadge(dayType: TourDayType) {
  if (dayType === 'travel') return 'Travel day';
  if (dayType === 'off') return 'Off day';
  return 'Show day';
}

function getDayTypeNoun(dayType: TourDayType) {
  return dayType === 'show' ? 'show' : 'day';
}

function getEditorCopy(dayType: TourDayType) {
  if (dayType === 'travel') {
    return {
      title: 'New date',
      subtitle: 'Travel day',
      venueTitle: 'Travel / destination',
      venueNameLabel: 'Travel title',
      venueAddressLabel: 'Destination / address',
      parkingTitle: 'Travel notes',
      parkingLabel: 'Routing / parking / transit notes',
      scheduleTitle: 'Travel timeline',
      dosTitle: 'Travel contact',
      accommodationTitle: 'Accommodation',
      notesTitle: 'Notes',
    };
  }

  if (dayType === 'off') {
    return {
      title: 'New date',
      subtitle: 'Off day',
      venueTitle: 'Location',
      venueNameLabel: 'Location name',
      venueAddressLabel: 'Address',
      parkingTitle: 'Local notes',
      parkingLabel: 'Parking / local notes',
      scheduleTitle: 'Day timeline',
      dosTitle: 'Day contact',
      accommodationTitle: 'Accommodation',
      notesTitle: 'Notes',
    };
  }

  return {
    title: 'New date',
    subtitle: 'Show day',
    venueTitle: 'Venue',
    venueNameLabel: 'Venue name',
    venueAddressLabel: 'Venue address',
    parkingTitle: 'Load / parking info',
    parkingLabel: 'Details',
    scheduleTitle: 'Schedule',
    dosTitle: 'DOS contact',
    accommodationTitle: 'Accommodation',
    notesTitle: 'Notes',
  };
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
  const warnings: string[] = [];

  if (flags.includes('ambiguous_contact_details') || flags.includes('partial_contact_details')) warnings.push('Check contact');
  if (flags.includes('date_requires_review') || flags.includes('duplicate_date_in_import')) warnings.push('Check date');
  if ((row.schedule_items ?? []).some((item) => item.time.trim() && !item.label.trim())) warnings.push('Check schedule');

  const normalizedDate = parseFlexibleDateInput(row.date || '');
  if (!row.date || (!normalizedDate && row.date.trim())) warnings.push('Check date');

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

// Shared by handleCreateInvite and handleSaveMemberEdit, which previously
// repeated this same scope-selection validation near-verbatim with slightly
// different wording -- a future rule change risked being applied to only
// one of the two.
function validateScopeSelection(input: {
  role: WorkspaceInviteRole | EditableWorkspaceMemberRole;
  scopeType: 'workspace' | 'projects' | 'tours';
  projectIds: string[];
  tourIds: string[];
}): string | null {
  if (input.role === 'admin' && input.scopeType !== 'workspace') {
    return 'Admins must have full workspace access.';
  }
  if (input.scopeType === 'projects' && input.projectIds.length === 0) {
    return 'Select at least one project for project-scoped access.';
  }
  if (input.scopeType === 'tours' && input.tourIds.length === 0) {
    return 'Select at least one tour for tour-scoped access.';
  }
  return null;
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
    user,
  } = useAppContext();
  const router = useRouter();
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const searchParams = useSearchParams();
  const datesTab = searchParams.get('tab') === 'past' ? 'past' : 'upcoming';
  const isDraftsMode = mode === 'drafts';
  const isTeamMode = mode === 'team';
  // Opening a date to edit (?edit=…): remember which list it came from so the
  // right tab (Dates or Drafts) is highlighted from the first moment, before
  // the date has finished loading.
  const [initialEditTab] = useState<'dates' | 'drafts' | null>(() =>
    mode === 'new' && searchParams.get('edit') ? (searchParams.get('returnTo') === '/admin/drafts' ? 'drafts' : 'dates') : null,
  );
  const [editLinkActive, setEditLinkActive] = useState(() => initialEditTabFromParams(mode, searchParams));
  const isProjectsMode = mode === 'projects';
  const statusMessage = searchParams.get('message');
  const contextProjectId = searchParams.get('contextProjectId');
  const [shows, setShows] = useState<Show[]>([]);
  const [showsLoading, setShowsLoading] = useState(false);
  const [showsHasLoadedOnce, setShowsHasLoadedOnce] = useState(false);
  const [expandedSections, setExpandedSections] = useState<ExpandedSections>(defaultExpandedSections);
  const [attachmentsExpanded, setAttachmentsExpanded] = useState(true);
  const [attachmentCount, setAttachmentCount] = useState(0);
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
  // Last deleted schedule line, kept for a few seconds so it can be undone.
  const [deletedLine, setDeletedLine] = useState<{ item: ShowFormValues['schedule_items'][number]; index: number } | null>(null);
  const deletedLineTimerRef = useRef<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [scheduleMenuId, setScheduleMenuId] = useState<string | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
  }, []);
  useEffect(() => () => {
    if (deletedLineTimerRef.current) window.clearTimeout(deletedLineTimerRef.current);
  }, []);
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
  const [inviteFormOpen, setInviteFormOpen] = useState(false);
  const [inviteTourIds, setInviteTourIds] = useState<string[]>([]);
  const [members, setMembers] = useState<WorkspaceMemberDirectoryEntry[]>([]);
  const [editingMember, setEditingMember] = useState<WorkspaceMemberDirectoryEntry | null>(null);
  const [editingMemberRole, setEditingMemberRole] = useState<EditableWorkspaceMemberRole>('viewer');
  const [editingMemberScopeType, setEditingMemberScopeType] = useState<'workspace' | 'projects' | 'tours'>('workspace');
  const [editingMemberProjectIds, setEditingMemberProjectIds] = useState<string[]>([]);
  const [editingMemberTourIds, setEditingMemberTourIds] = useState<string[]>([]);
  const [savingMemberEdit, setSavingMemberEdit] = useState(false);
  const [quickRoleMemberId, setQuickRoleMemberId] = useState<string | null>(null);
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
  const [returnLabel, setReturnLabel] = useState('Dates');
  const [editorBootstrapLoading, setEditorBootstrapLoading] = useState(false);
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
  const deletedShowIdsRef = useRef<Set<string>>(new Set());
  const showsRequestIdRef = useRef(0);
  const invitesRequestIdRef = useRef(0);
  const membersRequestIdRef = useRef(0);

  const activeWorkspaceRole = useMemo(() => getWorkspaceRole(memberships, activeWorkspaceId), [memberships, activeWorkspaceId]);
  const workspaceProjects = useMemo(
    () => projects.filter((project) => project.workspaceId === activeWorkspaceId),
    [projects, activeWorkspaceId],
  );
  const workspaceTours = useMemo(
    () => tours.filter((tour) => tour.workspaceId === activeWorkspaceId),
    [tours, activeWorkspaceId],
  );
  // When inviting or changing people, a Manager limited to some bands only
  // sees those bands' projects and tours. (The server refuses anything else
  // too; this keeps the choices honest.)
  const activeMembership = memberships.find((membership) => membership.workspaceId === activeWorkspaceId) ?? null;
  const canInviteToAllProjects = canManageProjects(activeWorkspaceRole) || activeMembership?.scopeType === 'workspace';
  const teamProjects = useMemo(() => {
    if (canInviteToAllProjects) return workspaceProjects;
    const allowed = new Set(activeMembership?.projectIds ?? []);
    return workspaceProjects.filter((project) => allowed.has(project.id));
  }, [activeMembership, canInviteToAllProjects, workspaceProjects]);
  const teamTours = useMemo(() => {
    if (canInviteToAllProjects) return workspaceTours;
    if (activeMembership?.scopeType === 'tours') {
      const allowedTours = new Set(activeMembership.tourIds);
      return workspaceTours.filter((tour) => allowedTours.has(tour.id));
    }
    const allowedProjects = new Set(activeMembership?.projectIds ?? []);
    return workspaceTours.filter((tour) => allowedProjects.has(tour.projectId));
  }, [activeMembership, canInviteToAllProjects, workspaceTours]);
  const inviteAvailableTours = useMemo(() => {
    if (inviteScopeType !== 'tours') return teamTours;
    if (inviteProjectIds.length === 0) return teamTours;
    const allowedProjects = new Set(inviteProjectIds);
    return teamTours.filter((tour) => allowedProjects.has(tour.projectId));
  }, [inviteProjectIds, inviteScopeType, teamTours]);
  const editAvailableTours = useMemo(() => {
    if (editingMemberScopeType !== 'tours') return teamTours;
    if (editingMemberProjectIds.length === 0) return teamTours;
    const allowedProjects = new Set(editingMemberProjectIds);
    return teamTours.filter((tour) => allowedProjects.has(tour.projectId));
  }, [editingMemberProjectIds, editingMemberScopeType, teamTours]);
  const canCreateArtistInWorkspace = canCreateArtists(activeWorkspaceRole);
  const isWorkspaceOwner = activeWorkspaceRole === 'owner';
  const canManageProjectActions = canManageProjects(activeWorkspaceRole);
  const canManageInvitesInWorkspace = canManageInvites(activeWorkspaceRole);
  const hasAdminAnywhere = useMemo(() => hasAnyAdminAccess(memberships), [memberships]);
  const firstAdminWorkspaceId = useMemo(() => getFirstAdminWorkspaceId(memberships), [memberships]);

  // Every mutation both awaits this directly and dispatches
  // 'tourbook:shows-updated' (which other components -- dashboard-client,
  // show-page-client -- also listen for, so the dispatch itself must stay).
  // That means this fires twice per action in this component. The request-id
  // guard below makes the redundant fetch harmless instead of a race: if a
  // second call starts before the first resolves, only the response for the
  // most recently started call is ever applied to state.
  const loadShows = useCallback(async () => {
    if (!activeWorkspaceId || !activeProjectId) {
      showsRequestIdRef.current += 1;
      setShows([]);
      setShowsLoading(false);
      return;
    }

    const requestId = ++showsRequestIdRef.current;
    setShowsLoading(true);
    try {
      const result = await listShows(true, { workspaceId: activeWorkspaceId, projectId: activeProjectId, tourId: activeTourId });
      if (showsRequestIdRef.current !== requestId) return;
      const deletedShowIds = deletedShowIdsRef.current;
      const nextShows = deletedShowIds.size > 0
        ? result.shows.filter((show) => !deletedShowIds.has(show.id))
        : result.shows;
      setShows(nextShows);
      setShowsHasLoadedOnce(true);
    } finally {
      if (showsRequestIdRef.current === requestId) {
        setShowsLoading(false);
      }
    }
  }, [activeProjectId, activeTourId, activeWorkspaceId]);

  const loadInvites = useCallback(async () => {
    if (!activeWorkspaceId || !canManageInvitesInWorkspace) {
      invitesRequestIdRef.current += 1;
      setInvites([]);
      return;
    }

    const requestId = ++invitesRequestIdRef.current;
    setInvitesLoading(true);
    try {
      const nextInvites = await listWorkspaceInvites(activeWorkspaceId);
      if (invitesRequestIdRef.current !== requestId) return;
      setInvites(nextInvites);
    } catch (error) {
      if (invitesRequestIdRef.current === requestId) {
        setInviteMessage(error instanceof Error ? error.message : 'Unable to load invites.');
      }
    } finally {
      if (invitesRequestIdRef.current === requestId) {
        setInvitesLoading(false);
      }
    }
  }, [activeWorkspaceId, canManageInvitesInWorkspace]);

  const loadMembers = useCallback(async () => {
    if (!activeWorkspaceId || !canManageInvitesInWorkspace) {
      membersRequestIdRef.current += 1;
      setMembers([]);
      return;
    }

    const requestId = ++membersRequestIdRef.current;
    setMembersLoading(true);
    try {
      const nextMembers = await listWorkspaceMembers(activeWorkspaceId);
      if (membersRequestIdRef.current !== requestId) return;
      setMembers(nextMembers);
    } catch (error) {
      if (membersRequestIdRef.current === requestId) {
        setInviteMessage(error instanceof Error ? error.message : 'Unable to load team members.');
      }
    } finally {
      if (membersRequestIdRef.current === requestId) {
        setMembersLoading(false);
      }
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

  // Reset stale shows, filters, and errors whenever the admin view or active scope changes.
  // This prevents sibling admin routes from briefly reusing an out-of-date list.
  useEffect(() => {
    deletedShowIdsRef.current.clear();
    setShows([]);
    setShowsHasLoadedOnce(false);
    setUpcomingSearch('');
    setPastSearch('');
    setUpcomingTour('All');
    setPastTour('All');
    setDraftSearch('');
    setDraftTour('All');
    setMessage('');
  }, [activeWorkspaceId, activeProjectId, activeTourId, mode]);

  useEffect(() => {
    if (contextLoading || !activeWorkspaceId || !activeProjectId) return;

    void loadShows();
    window.addEventListener('tourbook:shows-updated', loadShows);
    return () => {
      window.removeEventListener('tourbook:shows-updated', loadShows);
    };
  }, [activeProjectId, activeTourId, activeWorkspaceId, contextLoading, loadShows]);

  useEffect(() => {
    if (contextLoading) return;
    if (!activeWorkspaceId || canAccessAdminWorkspace(activeWorkspaceRole)) return;
    if (!firstAdminWorkspaceId || firstAdminWorkspaceId === activeWorkspaceId) return;
    setActiveWorkspaceId(firstAdminWorkspaceId);
  }, [activeWorkspaceId, activeWorkspaceRole, contextLoading, firstAdminWorkspaceId, setActiveWorkspaceId]);

  useEffect(() => {
    if (contextLoading) return;
    void loadInvites();
    void loadMembers();
    window.addEventListener('tourbook:invites-updated', loadInvites);
    return () => {
      window.removeEventListener('tourbook:invites-updated', loadInvites);
    };
  }, [contextLoading, loadInvites, loadMembers]);

  useEffect(() => {
    if (!isTeamMode || !contextProjectId || contextInvitePrefillRef.current === contextProjectId) return;
    if (!workspaceProjects.some((project) => project.id === contextProjectId)) return;
    contextInvitePrefillRef.current = contextProjectId;
    setInviteScopeType('projects');
    setInviteProjectIds([contextProjectId]);
    setInviteFormOpen(true);
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
  const draftShows = useMemo(
    () => shows
      .filter((show) => show.status === 'draft')
      .sort((a, b) => a.date.localeCompare(b.date) || (b.created_at || '').localeCompare(a.created_at || '')),
    [shows],
  );
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
    if (mode !== 'new' || contextLoading || !activeWorkspaceId) return;

    const editId = searchParams.get('edit');
    const duplicateId = searchParams.get('duplicate');
    const targetId = duplicateId ?? editId;
    const nextAction = duplicateId ? `duplicate:${duplicateId}` : editId ? `edit:${editId}` : null;

    if (!targetId || !nextAction || handledLoadRef.current === nextAction) return;
    const resolvedTargetId = targetId;

    let active = true;

    async function bootstrapEditor() {
      setEditorBootstrapLoading(true);
      try {
        const result = await getShow(resolvedTargetId, { workspaceId: activeWorkspaceId });
        if (!active) return;
        const source = result.show;

        if (duplicateId) {
          const duplicated = ensureEditorScheduleRows(sanitizeShowFormForDayType({
            ...source,
            id: '',
            date: '',
            created_at: undefined,
            schedule_items: source.schedule_items.map((item) => ({ ...item, id: crypto.randomUUID() })),
          }));
          setVisibilityModes(visibilityModesForLoadedForm(duplicated));
          setForm(duplicated);
          setExpandedSections(getExpandedSectionsForPopulatedForm(duplicated));
          setMessage('Tour day duplicated');
          setDirty(false);
        } else {
          const normalizedShow = ensureEditorScheduleRows(sanitizeShowFormForDayType(source));
          setVisibilityModes(visibilityModesForLoadedForm(normalizedShow));
          setForm(normalizedShow);
          setExpandedSections(getExpandedSectionsForPopulatedForm(normalizedShow));
          setDirty(false);
        }

        handledLoadRef.current = nextAction;
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, '', '/admin/new');
        }
      } catch {
        if (!active) return;
      } finally {
        if (active) setEditorBootstrapLoading(false);
      }
    }

    void bootstrapEditor();
    return () => {
      active = false;
    };
  }, [activeWorkspaceId, contextLoading, mode, searchParams]);

  useEffect(() => {
    const routes = ['/admin/new', '/admin/dates', '/admin/drafts', '/admin/team', '/admin/settings'];
    routes.forEach((route) => router.prefetch(route));
    if (returnToUrl.startsWith('/')) router.prefetch(returnToUrl);
  }, [returnToUrl, router]);

  useEffect(() => {
    if (mode !== 'new') return;

    const editId = searchParams.get('edit');
    const duplicateId = searchParams.get('duplicate');
    const returnTo = searchParams.get('returnTo');
    const returnTab = searchParams.get('returnTab') === 'past' ? 'past' : 'upcoming';

    if (returnTo && returnTo !== 'dates' && (editId || duplicateId)) {
      setReturnToUrl(returnTo);
      setReturnLabel(returnTo === '/admin/drafts' ? 'Drafts' : 'Dates');
    } else if (returnTo === 'show' && (editId || duplicateId)) {
      const targetId = editId ?? duplicateId;
      setReturnToUrl(`/shows/${encodeURIComponent(targetId ?? '')}?admin=1`);
      setReturnLabel('Date');
    } else {
      setReturnToUrl(`/admin/dates?tab=${returnTab}`);
      setReturnLabel('Dates');
    }
  }, [mode, searchParams]);

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
      setMessage('Enter a project name to continue.');
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
      setMessage('Project created. You can now create your first tour day.');
      void trackActivationEvent({
        event: 'activation.create_success',
        stateType: 'admin.no_artists',
        entity: 'artist',
        workspaceId: activeWorkspaceId,
        projectId: created.id,
        role: activeWorkspaceRole,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unable to create project.';
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
      setMessage('Enter a new project name.');
      return;
    }

    setRenamingArtist(true);
    try {
      const renamed = await renameArtist({ workspaceId: activeWorkspaceId, projectId, name: nextName });
      await refreshContext();
      setActiveProjectId(renamed.id);
      setMessage('Project renamed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to rename project.');
    } finally {
      setRenamingArtist(false);
    }
  }

  async function handleDeleteArtist(project: ProjectSummary) {
    if (!activeWorkspaceId || !isWorkspaceOwner) return;
    const projectName = project.name || project.slug || project.id;
    const confirmed = await requestConfirmation({
      title: 'Delete project?',
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
      setMessage('Project deleted.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to delete project.');
    }
  }

  async function handleCreateInvite() {
    if (!activeWorkspaceId || !canManageInvitesInWorkspace) return;
    if (!inviteEmail.trim()) {
      setInviteMessage('Enter an email to invite.');
      return;
    }

    const scopeError = validateScopeSelection({ role: inviteRole, scopeType: inviteScopeType, projectIds: inviteProjectIds, tourIds: inviteTourIds });
    if (scopeError) {
      setInviteMessage(scopeError);
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
      const inviteLink = `${window.location.origin}/invite/${encodeURIComponent(created.acceptToken)}`;
      setLastInviteShare({ token: created.acceptToken, link: inviteLink });
      setInviteName('');
      setInviteEmail('');
      setInviteTourIds([]);
      applyThisProjectInviteScope();
      setInviteMessage('An email invite has been sent to your recipient(s).');
      window.dispatchEvent(new Event('tourbook:invites-updated'));
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
      setInviteMessage('Invite revoked.');
      window.dispatchEvent(new Event('tourbook:invites-updated'));
      await trackInviteEvent({ event: 'invite.revoked', workspaceId: revoked.workspaceId, inviteId: revoked.id, role: revoked.role });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unable to revoke invite.';
      setInviteMessage(reason);
      await trackInviteEvent({ event: 'invite.failed', workspaceId: activeWorkspaceId, inviteId: invite.id, reason });
    }
  }

  async function handleResendInvite(invite: WorkspaceInviteSummary) {
    if (!activeWorkspaceId || !canManageInvitesInWorkspace) return;

    try {
      await resendWorkspaceInvite({ workspaceId: activeWorkspaceId, inviteId: invite.id });
      setInviteMessage('Invite resent successfully.');
      window.dispatchEvent(new Event('tourbook:invites-updated'));
    } catch (error) {
      setInviteMessage(error instanceof Error ? error.message : 'Unable to resend invite.');
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
    const scopeError = validateScopeSelection({ role: editingMemberRole, scopeType: editingMemberScopeType, projectIds: editingMemberProjectIds, tourIds: editingMemberTourIds });
    if (scopeError) {
      setInviteMessage(scopeError);
      return;
    }

    setSavingMemberEdit(true);
    try {
      const updated = await updateWorkspaceMember({
        workspaceId: activeWorkspaceId,
        memberId: editingMember.id,
        role: editingMemberRole,
        scopeType: editingMemberScopeType,
        projectIds: editingMemberScopeType === 'projects' || editingMemberScopeType === 'tours' ? editingMemberProjectIds : [],
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

  async function handleQuickRoleChange(member: WorkspaceMemberDirectoryEntry, role: AssignableRole) {
    if (!activeWorkspaceId || !canManageInvitesInWorkspace) return;
    if (member.role === 'owner' || member.role === 'admin' || member.role === role) return;

    setQuickRoleMemberId(member.id);
    try {
      const updated = await updateWorkspaceMember({
        workspaceId: activeWorkspaceId,
        memberId: member.id,
        role,
        scopeType: member.scopeType,
        projectIds: member.scopeType === 'projects' || member.scopeType === 'tours' ? member.projectIds : [],
        tourIds: member.scopeType === 'tours' ? member.tourIds : [],
      });
      setMembers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      if (editingMember?.id === member.id) {
        setEditingMember(updated);
        setEditingMemberRole(updated.role === 'owner' ? 'viewer' : updated.role);
      }
      setInviteMessage(`${updated.name || updated.email || 'Member'} is now ${roleLabel(updated.role)}.`);
    } catch (error) {
      setInviteMessage(error instanceof Error ? error.message : 'Unable to update member role.');
    } finally {
      setQuickRoleMemberId(null);
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

  function handleDayTypeChange(nextDayType: TourDayType) {
    setDirty(true);
    setForm((current) => {
      const nextForm = applyAutoVisibility(sanitizeShowFormForDayType({ ...current, day_type: nextDayType }), visibilityModes);
      setExpandedSections((expanded) => getExpandedSectionsForDayType(nextDayType, expanded, nextForm));
      return nextForm;
    });
  }

  function updateField<K extends keyof ShowFormValues>(key: K, value: ShowFormValues[K]) {
    if (key === 'day_type') {
      handleDayTypeChange(value as TourDayType);
      return;
    }
    updateForm((current) => ({ ...current, [key]: value }));
  }

  // New invites default to "This project" (the project you're working in);
  // admins always get the whole workspace.
  function applyThisProjectInviteScope() {
    const thisProjectId = contextProjectId || activeProjectId;
    if (thisProjectId && inviteRole !== 'admin' && teamProjects.some((project) => project.id === thisProjectId)) {
      setInviteScopeType('projects');
      setInviteProjectIds([thisProjectId]);
    } else if (!canInviteToAllProjects && teamProjects[0]) {
      setInviteScopeType('projects');
      setInviteProjectIds([teamProjects[0].id]);
    } else {
      setInviteScopeType('workspace');
      setInviteProjectIds([]);
    }
  }

  function openInviteForm() {
    setInviteTourIds([]);
    applyThisProjectInviteScope();
    setInviteFormOpen(true);
  }

  function updateVisibility(key: VisibilityKey, value: boolean) {
    setVisibilityModes((current) => ({ ...current, [key]: 'manual' }));
    setForm((current) => ({ ...current, visibility: { ...current.visibility, [key]: value } }));
    showFlash(value ? 'Visible to crew' : 'Hidden from crew');
  }

  // Short message at the bottom of the screen (about 2 seconds).
  function showFlash(text: string) {
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    setFlash(text);
    flashTimerRef.current = window.setTimeout(() => setFlash(null), 2000);
  }

  function resetForm(nextMessage = 'Ready to create') {
    const nextModes = defaultVisibilityModes();
    setVisibilityModes(nextModes);
    setExpandedSections(readExpandedSectionsPreference());
    setDeletedLine(null);
    setEditLinkActive(false);
    setForm(applyAutoVisibility({ ...emptyShowForm, schedule_items: createEmptyScheduleItems() }, nextModes));
    setPendingAttachments([]);
    handledLoadRef.current = null;
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/admin/new');
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
    const index = form.schedule_items.findIndex((item) => item.id === id);
    if (index === -1) return;
    const removed = form.schedule_items[index];
    updateForm((current) => ({
      ...current,
      schedule_items: current.schedule_items.filter((item) => item.id !== id),
    }));
    // No "are you sure?" pop-up: offer a short Undo instead.
    if (deletedLineTimerRef.current) window.clearTimeout(deletedLineTimerRef.current);
    setDeletedLine({ item: removed, index });
    deletedLineTimerRef.current = window.setTimeout(() => setDeletedLine(null), 5000);
  }

  function undoRemoveScheduleRow() {
    if (!deletedLine) return;
    const { item, index } = deletedLine;
    if (deletedLineTimerRef.current) window.clearTimeout(deletedLineTimerRef.current);
    setDeletedLine(null);
    updateForm((current) => {
      if (current.schedule_items.some((existing) => existing.id === item.id)) return current;
      const next = [...current.schedule_items];
      next.splice(Math.min(index, next.length), 0, item);
      return { ...current, schedule_items: next };
    });
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

  function buildReturnTarget(targetUrl: string, fallbackTab: 'past' | 'upcoming', messageText: string) {
    if (targetUrl.startsWith('/shows/') || targetUrl.startsWith('/admin/dates/') || targetUrl.startsWith('/admin/drafts')) {
      return `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}message=${encodeURIComponent(messageText)}`;
    }
    return `/admin/dates?tab=${fallbackTab}&message=${encodeURIComponent(messageText)}`;
  }

  async function saveShow(requestedStatus: ShowStatus) {
    if (!isValidStoredDate(form.date)) {
      setMessage(
        requestedStatus === 'draft'
          ? 'Enter a valid date before saving as a draft'
          : 'Enter a valid date before publishing',
      );
      return;
    }

    setSaving(true);

    try {
      if (!activeWorkspaceId || !activeProjectId) throw new Error('No active workspace or project selected.');
      const cleanedForm = sanitizeShowFormForDayType({
        ...form,
        id: form.id,
        status: requestedStatus,
        tour_name: form.tour_name.trim(),
        region: form.region.trim().toUpperCase(),
      });

      const show = await upsertShow(cleanedForm, { workspaceId: activeWorkspaceId, projectId: activeProjectId });

      if (pendingAttachments.length) {
        const failures: string[] = [];
        for (const file of pendingAttachments) {
          try {
            await uploadAttachment(show.id, file, { workspaceId: activeWorkspaceId }, getPendingDisplayName(file));
          } catch {
            failures.push(file.name);
          }
        }

        if (failures.length) {
          // Don't leave a half-published date sitting around with some (or none) of its
          // attachments actually saved. Roll back the just-created date, leave the form
          // exactly as the user had it — including every pending file, not just the
          // failed ones, since the retry will need to re-upload all of them — and block
          // here with a clear error instead of reporting success.
          if (!isEditing) {
            try {
              await deleteShow(show.id, { workspaceId: activeWorkspaceId });
            } catch {
              // Best-effort cleanup — the error below still matters even if this fails.
            }
          }
          setMessage(`Error: ${failures.join(', ')} failed to upload`);
          return;
        }

        setPendingAttachments([]);
      }

      await loadShows();
      setDirty(false);
      setForm(ensureEditorScheduleRows(show));
      window.dispatchEvent(new Event('tourbook:shows-updated'));
      // Refresh bootstrap context so newly auto-created tour entities appear
      // in the invite-scope tour dropdown without a full page reload.
      void refreshContext();

      if (requestedStatus === 'draft') {
        if (isEditing) {
          const nextTab = isPastShow(show.date) ? 'past' : 'upcoming';
          router.push(buildReturnTarget(returnToUrl, nextTab, 'Draft saved.'));
        } else {
          resetForm('Draft saved. Form cleared for the next date.');
        }
        return;
      }

      if (isEditing) {
        if (form.status === 'draft') {
          const nextTab = isPastShow(show.date) ? 'past' : 'upcoming';
          const nextMessage = returnToUrl === '/admin/drafts' ? 'Draft published.' : 'Changes saved.';
          router.push(buildReturnTarget(returnToUrl, nextTab, nextMessage));
          return;
        }
        const nextTab = isPastShow(show.date) ? 'past' : 'upcoming';
        router.push(buildReturnTarget(returnToUrl, nextTab, 'Changes saved.'));
        return;
      }

      resetForm('Date created. Form cleared for the next one.');
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

  async function loadShow(show: Show) {

    if (mode === 'dates') {
      router.push(`/admin?edit=${encodeURIComponent(show.id)}&returnTo=dates&returnTab=${datesTab}`);
      return;
    }

    if (mode === 'drafts') {
      router.push(`/admin?edit=${encodeURIComponent(show.id)}&returnTo=${encodeURIComponent('/admin/drafts')}`);
      return;
    }

    let nextShow = show;
    if (activeWorkspaceId) {
      try {
        const result = await getShow(show.id, { workspaceId: activeWorkspaceId });
        nextShow = result.show;
      } catch {
        // Fall back to the already-loaded list row so the editor still opens.
      }
    }

    const normalizedShow = ensureEditorScheduleRows(sanitizeShowFormForDayType(nextShow));
    setVisibilityModes(visibilityModesForLoadedForm(normalizedShow));
    setForm(normalizedShow);
    setExpandedSections(getExpandedSectionsForPopulatedForm(normalizedShow));
    setPendingAttachments([]);
    setDirty(false);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function duplicateShow(show: Show) {

    if (mode === 'dates') {
      router.push(`/admin?duplicate=${encodeURIComponent(show.id)}&returnTo=dates&returnTab=${datesTab}`);
      return;
    }

    if (mode === 'drafts') {
      router.push(`/admin?duplicate=${encodeURIComponent(show.id)}&returnTo=${encodeURIComponent('/admin/drafts')}`);
      return;
    }

    const duplicated = ensureEditorScheduleRows(sanitizeShowFormForDayType({
      ...show,
      id: '',
      date: '',
      created_at: undefined,
      schedule_items: show.schedule_items.map((item) => ({ ...item, id: crypto.randomUUID() })),
    }));

    setVisibilityModes(visibilityModesForLoadedForm(duplicated));
    setForm(duplicated);
    setExpandedSections(getExpandedSectionsForPopulatedForm(duplicated));
    setPendingAttachments([]);
    setMessage('Date duplicated');
    setDirty(false);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleDelete(showId: string) {
    const confirmed = await requestConfirmation({ title: 'Delete date?', description: 'Delete this show and its guest list?', confirmLabel: 'Delete', tone: 'danger' });
    if (!confirmed) return;

    if (!activeWorkspaceId) throw new Error('No active workspace selected.');

    deletedShowIdsRef.current.add(showId);
    setShows((current) => current.filter((show) => show.id !== showId));

    try {
      await deleteShow(showId, { workspaceId: activeWorkspaceId });
      await loadShows();
      if (form.id === showId) {
        resetForm();
      }
      setMessage('Show deleted.');
      window.dispatchEvent(new Event('tourbook:shows-updated'));
    } catch (error) {
      deletedShowIdsRef.current.delete(showId);
      await loadShows();
      setMessage(error instanceof Error ? error.message : 'Unable to delete show.');
    }
  }


  async function publishShow(show: Show) {
    try {
      if (!isValidStoredDate(show.date)) {
        setMessage('Draft needs a valid date before it can be published.');
        return;
      }
      if (!activeWorkspaceId || !activeProjectId) throw new Error('No active workspace or project selected.');
      await upsertShow({ ...show, status: 'published', region: show.region.trim().toUpperCase(), tour_name: show.tour_name.trim() }, { workspaceId: activeWorkspaceId, projectId: activeProjectId });
      await loadShows();
      setMessage('Draft published.');
      window.dispatchEvent(new Event('tourbook:shows-updated'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to publish draft.');
    }
  }

  async function exportGuestList(showId: string) {
    try {
      if (!activeWorkspaceId) throw new Error('No active workspace selected.');
      const csv = await exportGuestListCsv(showId, { workspaceId: activeWorkspaceId });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${showId}-guest-list.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to export guest list.');
    }
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
        throw new Error('No active workspace or project selected.');
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
      if (!activeWorkspaceId || !activeProjectId) throw new Error('No active workspace or project selected.');

      const supabase = getBrowserSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch('/api/dates/ai-intake', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          workspaceId: activeWorkspaceId,
          projectId: activeProjectId,
          tourId: activeTourId,
          previewOnly: false,
          rows: selectedRows.map((row) => ({
            date: parseFlexibleDateInput(row.date) || row.date.trim(),
            city: row.city.trim(),
            region: row.region.trim().toUpperCase(),
            venue_name: row.venue_name.trim(),
            tour_name: row.tour_name?.trim() || '',
            venue_address: row.venue_address?.trim() || '',
            dos_name: row.dos_name?.trim() || '',
            dos_phone: row.dos_phone?.trim() || '',
            parking_load_info: row.parking_load_info?.trim() || '',
            schedule_items: row.schedule_items
              .filter((item) => item.label.trim() || item.time.trim())
              .map((item) => ({ label: item.label.trim(), time: item.time.trim() })),
            hotel_name: row.hotel_name?.trim() || '',
            hotel_address: row.hotel_address?.trim() || '',
            hotel_notes: row.hotel_notes?.trim() || '',
            notes: row.notes?.trim() || '',
            confidence: row.confidence,
            flags: row.flags,
          })),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to import dates.');
      }

      const createdShows = Array.isArray(payload?.createdDates)
        ? (payload.createdDates as any[]).map((date) => mapDateRecordToShow(date))
        : [];

      if (createdShows.length > 0) {
        setShows((current) => {
          const byId = new Map(current.map((show) => [show.id, show]));
          for (const show of createdShows) {
            byId.set(show.id, show);
          }
          return Array.from(byId.values()).sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
        });
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
  const inviteSectionProps = {
    invites,
    loading: invitesLoading,
    name: inviteName,
    email: inviteEmail,
    role: inviteRole,
    scopeType: inviteScopeType,
    scopeProjectIds: inviteProjectIds,
    scopeTourIds: inviteTourIds,
    availableProjects: teamProjects,
    availableTours: inviteAvailableTours,
    allowAllProjects: canInviteToAllProjects,
    message: inviteMessage,
    creating: creatingInvite,
    lastInviteShare,
    showManualShare: showManualInviteShare,
    onToggleManualShare: () => setShowManualInviteShare((current) => !current),
    onNameChange: setInviteName,
    onEmailChange: setInviteEmail,
    onRoleChange: setInviteRole,
    onScopeTypeChange: setInviteScopeType,
    onScopeProjectIdsChange: setInviteProjectIds,
    onScopeTourIdsChange: setInviteTourIds,
    contextProjectId: contextProjectId || activeProjectId,
    onCreateInvite: () => void handleCreateInvite(),
    onRevokeInvite: (invite: WorkspaceInviteSummary) => void handleRevokeInvite(invite),
    onResendInvite: (invite: WorkspaceInviteSummary) => void handleResendInvite(invite),
    onCopyValue: (value: string, successMessage: string) => void copyToClipboard(value, successMessage),
  };
  const openingFromEditLink = initialEditTab !== null && editLinkActive && !isEditing;
  const datesTabActive = mode === 'dates' || (isEditing && form.status !== 'draft') || (openingFromEditLink && initialEditTab === 'dates');
  const draftsTabActive = mode === 'drafts' || isEditingDraft || (openingFromEditLink && initialEditTab === 'drafts');
  const editorCopy = getEditorCopy(form.day_type);
  const primaryActionLabel = saving ? 'Saving...' : form.status === 'draft' ? 'Save draft' : isEditing ? 'Save changes' : 'Create date';

  if (contextLoading) {
    return <ListSkeleton rowClassName="h-20 rounded-xl" label="Loading dates" />;
  }

  if (!activeWorkspaceId) {
    return (
      <ActivationEmptyState
        title={workspaces.length ? 'No workspace selected.' : 'No workspace access yet.'}
        body={workspaces.length
          ? 'Choose a workspace to continue with date management.'
          : 'You are signed in, but no workspace memberships were found. Ask an owner to invite you first.'}
        actions={[{ label: 'Crew view', href: '/', tone: 'ghost', ctaId: 'go_crew_view' }]}
        telemetry={{
          stateType: workspaces.length ? 'admin.no_workspace_selected' : 'admin.no_workspace_access',
        }}
      />
    );
  }

  if (activeWorkspaceId && !canAccessAdminWorkspace(activeWorkspaceRole) && !hasAdminAnywhere) {
    return (
      <WorkspaceSelfServeAccessPanel
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSelectWorkspace={handleWorkspaceSelection}
        onCreated={async (workspaceId) => {
          await refreshContext();
          setActiveWorkspaceId(workspaceId);
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
          title={projectsForActiveWorkspace.length ? 'No project selected.' : 'No projects found in this workspace.'}
          body={projectsForActiveWorkspace.length
            ? 'Pick a project below to activate the admin workflow for this workspace.'
            : noArtistGuardrail.emptyBody}
          actions={[{ label: 'Go to crew view', href: '/', tone: 'ghost', ctaId: 'go_crew_view' }]}
          telemetry={{
            stateType: projectsForActiveWorkspace.length ? 'admin.no_active_artist' : 'admin.no_artists',
            workspaceId: activeWorkspaceId,
            role: activeWorkspaceRole,
          }}
        />

        <div className="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm text-zinc-300">
            <span className="text-xs uppercase tracking-[0.14em] text-zinc-500">Workspace</span>
            <select
              value={activeWorkspaceId}
              onChange={(event) => handleWorkspaceSelection(event.target.value || null)}
              className="h-11 rounded-[10px] border border-white/10 bg-black/20 px-4 text-sm text-zinc-100 outline-none focus:border-accent/40"
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>{workspace.name || workspace.slug || workspace.id}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm text-zinc-300">
            <span className="text-xs uppercase tracking-[0.14em] text-zinc-500">Project</span>
            <select
              value=""
              onChange={(event) => handleArtistSelection(event.target.value || null)}
              className="h-11 rounded-[10px] border border-white/10 bg-black/20 px-4 text-sm text-zinc-100 outline-none focus:border-accent/40"
            >
              <option value="">Select project…</option>
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
            name={inviteName}
            email={inviteEmail}
            role={inviteRole}
            scopeType={inviteScopeType}
            scopeProjectIds={inviteProjectIds}
            scopeTourIds={inviteTourIds}
            availableProjects={teamProjects}
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
            onResendInvite={(invite) => void handleResendInvite(invite)}
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
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="mb-2 text-xs uppercase tracking-[0.14em] text-zinc-500">Create first project</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={newArtistName}
                  onChange={(event) => setNewArtistName(event.target.value)}
                  placeholder="Project name"
                  className="h-11 min-w-0 flex-1 rounded-[10px] border border-white/10 bg-black/20 px-4 text-sm text-zinc-100 outline-none focus:border-accent/40"
                />
                <button type="button" onClick={() => void handleCreateArtist()} disabled={creatingArtist || !newArtistName.trim()} className={primaryButtonClassName()}>
                  {creatingArtist ? 'Creating…' : 'Create project'}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
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
        availableProjects={teamProjects}
        availableTours={editAvailableTours}
        allowAllProjects={canInviteToAllProjects}
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
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-hidden bg-black/80 px-4 py-4 backdrop-blur-sm sm:py-6">
          <div className="mx-auto mt-[max(env(safe-area-inset-top),0.5rem)] max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl overflow-y-auto rounded-xl border border-white/10 bg-zinc-950 p-4 shadow-2xl shadow-black/80 sm:mt-0 sm:max-h-[calc(100vh-3rem)] sm:p-5">
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
                    className="min-h-[240px] w-full rounded-[10px] border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-accent/40"
                  />
                </label>

                <div>
                  <span className="mb-2 block text-sm text-zinc-300">Files / images</span>
                  <div
                    className={importFiles.length ? `rounded-xl border border-dashed p-4 transition ${isDraggingImportFiles ? 'border-accent/60 bg-accent/[0.06]' : 'border-white/15 bg-black/20'}` : uploadDropzoneClassName(isDraggingImportFiles)}
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
                          <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-100">
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
                      <UploadDropzoneContent onChoose={() => importFileInputRef.current?.click()} buttonLabel="Choose files" />
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={reviewImportWithAi} disabled={reviewingImport || importing} className={primaryButtonClassName()}>
                    {reviewingImport ? 'Reviewing…' : 'Review AI draft'}
                  </button>
                </div>
              </div>

              <div className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-zinc-200">Review</h3>
                    <p className="text-xs text-zinc-500">Edit, skip weak rows, then create drafts.</p>
                  </div>
                  <p className="text-xs text-zinc-400">{includedImportCount} selected</p>
                </div>

                {importError ? (
                  <div className="mb-3 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-100">{importError}</div>
                ) : null}

                {importWarnings.length ? (
                  <div className="mb-3 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                    <p className="mb-1 font-medium text-amber-200">Import warnings</p>
                    <div className="space-y-1">
                      {importWarnings.map((warning, index) => (
                        <p key={`${warning}-${index}`}>• {warning}</p>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                  {importRows.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-sm text-zinc-500">No results yet</div>
                  ) : (
                    importRows.map((row, index) => (
                      <div key={row.id} className="rounded-xl border border-white/10 bg-zinc-950/90 p-3">
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

                        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Schedule</p>
                            <button type="button" onClick={() => addImportScheduleItem(row.id)} className="inline-flex items-center gap-1 text-xs text-zinc-300 transition hover:text-zinc-100"><PlusIcon className="h-3.5 w-3.5" />Add line</button>
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
                                  className="h-12 w-full rounded-[10px] border border-white/10 bg-black/20 px-4 text-sm outline-none placeholder:text-zinc-500 focus:border-accent/40 sm:w-44"
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
      {/* Dates screens only: Dates | Drafts, plus "+ New date". Team and Settings
          are reached from the header (desktop) or the bottom bar (phones). */}
      {!isTeamMode && !isProjectsMode ? (
      <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={async () => {
            if (mode === 'new') {
              if (dirty) {
                const confirmed = await requestConfirmation({ title: 'Discard edits?', description: 'You have unsaved edits. Go back to your dates instead?', confirmLabel: 'Discard' });
                if (!confirmed) return;
              }
              router.push('/admin/dates');
              return;
            }
            router.push('/admin/dates');
          }}
          className={adminTabClassName(datesTabActive)}
          aria-current={datesTabActive ? 'page' : undefined}
        >
          Dates
        </button>
        <button
          type="button"
          onClick={async () => {
            if (mode === 'new') {
              if (dirty) {
                const confirmed = await requestConfirmation({ title: 'Discard edits?', description: 'You have unsaved edits. Return to Drafts instead?', confirmLabel: 'Discard' });
                if (!confirmed) return;
              }
              router.push('/admin/drafts');
              return;
            }
            router.push('/admin/drafts');
          }}
          className={adminTabClassName(draftsTabActive)}
          aria-current={draftsTabActive ? 'page' : undefined}
        >
          Drafts
        </button>

        {/* "+ New date" is a button (not a tab) at the end of the row. */}
        <button
          type="button"
          onClick={async () => {
            if (mode === 'new' && dirty) {
              const confirmed = await requestConfirmation({
                title: 'Discard edits?',
                description: isEditing ? 'You have unsaved edits. Start a new date instead?' : 'You have unsaved changes. Start a fresh new date?',
                confirmLabel: 'Discard',
              });
              if (!confirmed) return;
            }
            if (mode === 'new' && !isEditing && !form.id) {
              resetForm('Ready to create');
              return;
            }
            router.push('/admin/new');
          }}
          className="ml-auto inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-[10px] border border-accent/35 bg-accent-soft px-3 text-sm font-medium text-accent-light transition hover:border-accent/55"
        >
          <PlusIcon />
          New date
        </button>
      </div>
      ) : null}

      {/* Page titles sit close under the header, matching the Dates buttons. */}
      {isProjectsMode ? (
        <h2 className="px-1 text-lg font-semibold leading-tight tracking-tight text-zinc-50">Settings</h2>
      ) : null}

      {canManageProjectActions && isProjectsMode ? (
        <h3 className="px-1 text-sm font-medium text-zinc-400">Projects</h3>
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

      {/* Settings: the workspace you own or administer (renaming/switching can come later). */}
      {isProjectsMode && canManageProjectActions && activeWorkspace ? (
        <>
          <h3 className="px-1 pt-2 text-sm font-medium text-zinc-400">Workspace</h3>
          <section className="rounded-xl border border-white/10 bg-white/[0.045] p-4 sm:p-5">
            <p className="text-base font-medium text-zinc-100">{activeWorkspace.name || activeWorkspace.slug}</p>
            <p className="mt-1 text-sm text-zinc-500">Holds your projects and the people you invite.</p>
          </section>
        </>
      ) : null}

      {/* Settings: your account. Log out lives here. */}
      {isProjectsMode ? (
        <>
          <h3 className="px-1 pt-2 text-sm font-medium text-zinc-400">Your account</h3>
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.045] p-4 sm:p-5">
            <div className="min-w-0">
              <p className="text-sm text-zinc-500">Signed in as</p>
              <p className="truncate text-base text-zinc-100">{user?.email ?? '—'}</p>
            </div>
            <LogoutButton />
          </section>
        </>
      ) : null}

      {isTeamMode && canManageInvitesInWorkspace ? (
        <div className="space-y-3">
          {/* Team page header: Invite opens the invite form here at the top. */}
          <div className="flex items-center justify-between gap-3 px-1">
            <h2 className="text-lg font-semibold leading-tight tracking-tight text-zinc-50">Team</h2>
            {!inviteFormOpen ? (
              <button
                type="button"
                onClick={openInviteForm}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-accent/35 bg-accent-soft px-3 text-sm font-medium text-accent-light transition hover:border-accent/55"
              >
                <PlusIcon />
                Invite
              </button>
            ) : null}
          </div>
          {inviteFormOpen ? <InviteManagementSection {...inviteSectionProps} part="form" onCloseForm={() => setInviteFormOpen(false)} /> : null}
        </div>
      ) : null}

      {isTeamMode && canManageInvitesInWorkspace ? (
        <TeamMembersSection
          key={contextProjectId || activeProjectId || 'workspace-members'}
          members={members}
          invites={invites}
          loading={membersLoading}
          projects={workspaceProjects}
          tours={workspaceTours}
          quickRoleMemberId={quickRoleMemberId}
          onQuickRoleChange={(member, role) => void handleQuickRoleChange(member, role)}
          onEditMember={handleStartEditMember}
          onRemoveMember={(member) => void handleRemoveMember(member)}
          contextProjectId={contextProjectId || activeProjectId}
        />
      ) : null}

      {isTeamMode && canManageInvitesInWorkspace ? (
        <InviteManagementSection {...inviteSectionProps} part="directory" />
      ) : null}

      {mode === 'new' ? (
        <div ref={formRef} className="space-y-3">
          {/* Opening a date to edit/duplicate: placeholder boxes instead of a briefly-empty form. */}
          {editorBootstrapLoading && !isEditing ? (
            <div className="space-y-3" role="status" aria-label="Loading date into the editor">
              <SkeletonBlock className="h-32 rounded-xl" />
              <ListSkeleton rows={4} rowClassName="h-16 rounded-xl" label="Loading date into the editor" />
            </div>
          ) : null}

        <section className={`rounded-xl border border-white/10 bg-white/[0.045] p-4 sm:p-5 ${editorBootstrapLoading && !isEditing ? 'hidden' : ''}`}>
          {/* Title row: "New show day" / "Edit travel day" … with Import on the right.
              Expand/Collapse all sit in this row on desktop and just below it on phones. */}
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {isEditing ? (
                <button
                  type="button"
                  onClick={async () => {
                    if (dirty) {
                      const confirmed = await requestConfirmation({ title: 'Discard edits?', description: `Discard current edits and go back to ${returnLabel.toLowerCase()}?`, confirmLabel: 'Discard' });
                      if (!confirmed) return;
                    }
                    router.push(returnToUrl);
                  }}
                  className="-ml-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg text-zinc-300 transition hover:bg-white/[0.06] hover:text-zinc-100"
                  aria-label={`Back to ${returnLabel.toLowerCase()}`}
                >
                  ←
                </button>
              ) : null}
              <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-zinc-50">
                {`${isEditing ? 'Edit' : 'New'} ${getDayTypeBadge(form.day_type).toLowerCase()}`}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              <div className="hidden items-center gap-3 text-xs text-zinc-500 sm:flex">
                <button type="button" onClick={expandAllSections} className="transition hover:text-zinc-300">
                  Expand all
                </button>
                <span className="text-zinc-700" aria-hidden="true">•</span>
                <button type="button" onClick={collapseAllSections} className="transition hover:text-zinc-300">
                  Collapse all
                </button>
              </div>
              {/* Save / Create / Update / Publish live in the pinned bar at the bottom of the form. */}
              {!isEditing ? (
                <button type="button" onClick={openImportModal} className={`${secondaryButtonClassName()} h-10 shrink-0 px-4`}>
                  Quick import
                </button>
              ) : null}
            </div>
          </div>

          <div className={`mb-3 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500 ${message ? '' : 'sm:hidden'}`}>
            <div className="min-h-[1rem] text-accent-light/90">{message || ''}</div>
            <div className="flex items-center gap-3 sm:hidden">
              <button type="button" onClick={expandAllSections} className="transition hover:text-zinc-300">
                Expand all
              </button>
              <span className="text-zinc-700" aria-hidden="true">•</span>
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
                <div className="relative w-full max-w-[220px]">
                  <select
                    value={form.day_type}
                    onChange={(event) => handleDayTypeChange(event.target.value as TourDayType)}
                    aria-label="Day type"
                    className="h-11 w-full appearance-none rounded-[10px] border border-white/10 bg-black/20 px-4 pr-11 text-sm font-medium text-zinc-100 outline-none transition focus:border-accent/40 focus:bg-white/[0.03]"
                  >
                    <option value="show">Show day</option>
                    <option value="travel">Travel day</option>
                    <option value="off">Off day</option>
                  </select>
                  <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-zinc-400">
                    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <FlexibleDateInput label="Date" value={form.date} onChange={(value) => updateField('date', value)} labelWidthClassName="w-[72px]" />
                  {form.day_type === 'show' && (
                    <>
                      <InlineInput label="City" value={form.city} onChange={(value) => updateField('city', value)} labelWidthClassName="w-[72px]" />
                      <InlineInput label="Region" value={form.region} onChange={(value) => updateField('region', value.toUpperCase())} labelWidthClassName="w-[72px]" />
                      <InlineInput label="Country" value={form.country} onChange={(value) => updateField('country', value.toUpperCase())} labelWidthClassName="w-[72px]" />
                    </>
                  )}
                </div>
                <InlineTourInput key={form.id || 'new'} value={form.tour_name} onChange={(value) => updateField('tour_name', value)} options={availableTours} labelWidthClassName="w-[72px]" />
              </div>
            </CollapsibleSection>

            {shouldRenderSection('venue', form) ? (
            <CollapsibleSection
              title={editorCopy.venueTitle}
              expanded={expandedSections.venue}
              onExpandedChange={(value) => setSectionExpanded('venue', value)}
              hasContent={sectionHasContent('venue', form)}
              visibilityState={form.visibility.show_venue}
              onVisibilityToggle={(value) => updateVisibility('show_venue', value)}
            >
              <div className="grid gap-3">
                <Input label={editorCopy.venueNameLabel} value={form.venue_name} onChange={(value) => updateField('venue_name', value)} placeholder={form.day_type === 'show' ? undefined : form.day_type === 'travel' ? 'Drive to Chicago' : 'Hotel / city / crew day off'} />
                <AddressAutocompleteField
                  label={editorCopy.venueAddressLabel}
                  value={form.venue_address}
                  mapsUrl={form.venue_maps_url}
                  city={form.city}
                  region={form.region}
                  country={form.country}
                  onAddressChange={(value) => updateField('venue_address', value)}
                  onMapsUrlChange={(value) => updateField('venue_maps_url', value)}
                  onCityDetected={(value) => updateField('city', value)}
                  onRegionDetected={(value) => updateField('region', value.toUpperCase())}
                  onCountryDetected={(value) => updateField('country', value.toUpperCase())}
                />
              </div>
            </CollapsibleSection>
            ) : null}

            {shouldRenderSection('parking', form) ? (
            <CollapsibleSection
              title={editorCopy.parkingTitle}
              expanded={expandedSections.parking}
              onExpandedChange={(value) => setSectionExpanded('parking', value)}
              hasContent={sectionHasContent('parking', form)}
              visibilityState={form.visibility.show_parking_load_info}
              onVisibilityToggle={(value) => updateVisibility('show_parking_load_info', value)}
            >
              <Textarea label={editorCopy.parkingLabel} value={form.parking_load_info} onChange={(value) => updateField('parking_load_info', value)} />
            </CollapsibleSection>
            ) : null}

            {shouldRenderSection('schedule', form) ? (
            <CollapsibleSection
              title={editorCopy.scheduleTitle}
              expanded={expandedSections.schedule}
              onExpandedChange={(value) => setSectionExpanded('schedule', value)}
              hasContent={sectionHasContent('schedule', form)}
              visibilityState={form.visibility.show_schedule}
              onVisibilityToggle={(value) => updateVisibility('show_schedule', value)}
            >
              <div>
                {/* One row per schedule item: Item on the left, Time on the right, "…" menu.
                    The Time box sizes itself to what's typed, so short times stay small and
                    the item gets the room. If a long time (e.g. "5:00 - 7:00 PM") would make
                    the row cramped, the time drops to its own line under the item instead of
                    being squeezed or scrolling. Delete lives in the "…" menu (Undo afterwards). */}
                <ul className="space-y-2">
                  {form.schedule_items.map((item, index) => (
                    <li key={item.id} className="relative flex items-start gap-2">
                      <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                        <input
                          type="text"
                          value={item.label}
                          placeholder="Item"
                          aria-label={`Item, line ${index + 1}`}
                          onChange={(event) => updateScheduleItem(item.id, 'label', event.target.value)}
                          className={`${fieldClassName()} min-w-[8.5rem] flex-1`}
                        />
                        <input
                          type="text"
                          value={item.time}
                          placeholder="Time"
                          aria-label={`Time, line ${index + 1}`}
                          onChange={(event) => updateScheduleItem(item.id, 'time', event.target.value)}
                          style={{ width: `calc(${Math.max(item.time.length, 7)}ch + 2.25rem)` }}
                          className={`${fieldClassName()} max-w-full shrink-0 px-3 tabular-nums`}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setScheduleMenuId((current) => (current === item.id ? null : item.id))}
                        aria-label={`More options for line ${index + 1}`}
                        aria-expanded={scheduleMenuId === item.id}
                        className="-mr-2 mt-0.5 inline-flex h-11 w-10 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
                      >
                        <MoreIcon />
                      </button>
                      {scheduleMenuId === item.id ? (
                        <>
                          <button type="button" aria-hidden="true" tabIndex={-1} className="fixed inset-0 z-30 cursor-default" onClick={() => setScheduleMenuId(null)} />
                          <div onKeyDown={(event) => { if (event.key === 'Escape') setScheduleMenuId(null); }} className="absolute right-0 top-full z-40 mt-1 min-w-[160px] overflow-hidden rounded-xl border border-white/10 bg-zinc-950 shadow-2xl">
                            <button
                              type="button"
                              autoFocus
                              onClick={() => {
                                setScheduleMenuId(null);
                                removeScheduleRow(item.id);
                              }}
                              className="block w-full px-4 py-3 text-left text-sm text-red-300 transition hover:bg-red-500/10"
                            >
                              Delete line
                            </button>
                          </div>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={addScheduleRow} className={`${secondaryButtonClassName()} mt-3 inline-flex items-center gap-1.5`}>
                  <PlusIcon />
                  Add line
                </button>
              </div>
            </CollapsibleSection>
            ) : null}

            {shouldRenderSection('dos', form) ? (
            <CollapsibleSection
              title={editorCopy.dosTitle}
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
            ) : null}

            {shouldRenderSection('accommodation', form) ? (
            <CollapsibleSection
              title={editorCopy.accommodationTitle}
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
                  country={form.country}
                  onAddressChange={(value) => updateField('hotel_address', value)}
                  onMapsUrlChange={(value) => updateField('hotel_maps_url', value)}
                  onRegionDetected={(value) => updateField('region', value.toUpperCase())}
                  onCountryDetected={(value) => updateField('country', value.toUpperCase())}
                />
                <Textarea label="Hotel notes" value={form.hotel_notes} onChange={(value) => updateField('hotel_notes', value)} />
              </div>
            </CollapsibleSection>
            ) : null}

            {shouldRenderSection('notes', form) ? (
            <CollapsibleSection
              title={editorCopy.notesTitle}
              expanded={expandedSections.notes}
              onExpandedChange={(value) => setSectionExpanded('notes', value)}
              hasContent={sectionHasContent('notes', form)}
              visibilityState={form.visibility.show_notes}
              onVisibilityToggle={(value) => updateVisibility('show_notes', value)}
            >
              <Textarea value={form.notes} onChange={(value) => updateField('notes', value)} ariaLabel="Notes" />
            </CollapsibleSection>
            ) : null}

            {shouldRenderSection('guestListNotes', form) ? (
            <CollapsibleSection
              title="Guest list notes"
              expanded={expandedSections.guestListNotes}
              onExpandedChange={(value) => setSectionExpanded('guestListNotes', value)}
              hasContent={sectionHasContent('guestListNotes', form)}
              visibilityState={form.visibility.show_guest_list_notes}
              onVisibilityToggle={(value) => updateVisibility('show_guest_list_notes', value)}
            >
              <Textarea value={form.guest_list_notes} onChange={(value) => updateField('guest_list_notes', value)} ariaLabel="Guest list notes" />
            </CollapsibleSection>
            ) : null}

            <CollapsibleSection
              title="Attachments"
              expanded={attachmentsExpanded}
              onExpandedChange={setAttachmentsExpanded}
              hasContent={isEditing && form.id ? attachmentCount > 0 : pendingAttachments.length > 0}
            >
              {isEditing && form.id ? (
                <AttachmentsManager dateId={form.id} onCountChange={setAttachmentCount} />
              ) : (
                <PendingAttachmentsPicker files={pendingAttachments} onFilesChange={setPendingAttachments} />
              )}
            </CollapsibleSection>

          </form>
        </section>

        {/* Pinned action bar: fixed to the bottom of the screen the whole time the
            form is open, so Save / Create / Update are always one tap away.
            (Fixed rather than sticky: AppShell's overflow-x-hidden wrapper stops
            position: sticky from pinning.) The spacer below keeps the end of the
            form from hiding behind it. */}
        <div aria-hidden="true" className="h-16" />
        <div className={`fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-zinc-950/95 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur ${editorBootstrapLoading && !isEditing ? 'hidden' : ''}`}>
          <div className="mx-auto flex w-full max-w-5xl items-center justify-end gap-2 px-4 sm:px-6">
            {isEditingDraft ? (
              <>
                <button type="button" onClick={() => handleDelete(form.id)} className={`${dangerButtonClassName()} mr-auto`}>
                  Delete
                </button>
                <button type="button" onClick={() => void saveShow('draft')} disabled={saving} className={`${secondaryButtonClassName()} flex-1 sm:flex-none`}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button type="button" onClick={() => void saveShow('published')} disabled={saving} className={`${primaryButtonClassName()} flex-1 sm:flex-none sm:min-w-[7rem]`}>
                  {saving ? 'Publishing...' : 'Publish'}
                </button>
              </>
            ) : isEditing ? (
              <button type="submit" form="admin-show-form" disabled={saving} className={`${primaryButtonClassName()} flex-1 sm:flex-none sm:min-w-[7rem]`}>
                {primaryActionLabel}
              </button>
            ) : (
              <>
                <button type="button" onClick={() => void saveShow('draft')} disabled={saving} className={`${secondaryButtonClassName()} flex-1 sm:flex-none`}>
                  {saving ? 'Saving...' : 'Save draft'}
                </button>
                <button type="submit" form="admin-show-form" disabled={saving} className={`${primaryButtonClassName()} flex-1 sm:flex-none sm:min-w-[7rem]`}>
                  {saving ? 'Saving...' : 'Create date'}
                </button>
              </>
            )}
          </div>
        </div>

        {flash && !deletedLine ? (
          <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-40 flex justify-center px-4">
            <div role="status" aria-live="polite" className="rounded-full border border-white/10 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 shadow-2xl shadow-black/60">
              {flash}
            </div>
          </div>
        ) : null}

        {deletedLine ? (
          <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-40 flex justify-center px-4">
            <div role="status" aria-live="polite" className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-zinc-900 py-1 pl-4 pr-1 text-sm text-zinc-200 shadow-2xl shadow-black/60">
              <span>Line deleted</span>
              <span className="text-zinc-600" aria-hidden="true">·</span>
              <button type="button" onClick={undoRemoveScheduleRow} className="inline-flex h-9 items-center rounded-full px-3 font-medium text-accent-light transition hover:bg-white/[0.06]">
                Undo
              </button>
            </div>
          </div>
        ) : null}
        </div>
      ) : mode === 'dates' || mode === 'drafts' ? (
        showsLoading && !showsHasLoadedOnce ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl border border-white/10 bg-white/[0.03]" />
            ))}
          </div>
        ) : (
        <div>
          {message ? <div className="mb-3 px-1 text-xs text-accent-light/90">{message}</div> : null}
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
              loading={showsLoading}
            />
          ) : (
            <>
              <div>
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
                    headerAction={<UpcomingPastSwitch active={datesTab} />}
                    onEdit={loadShow}
                    onExport={exportGuestList}
                    onDelete={handleDelete}
                    onDuplicate={duplicateShow}
                    onPublish={publishShow}
                    loading={showsLoading}
                  />
                ) : (
                  <ShowListSection
                    title="Upcoming dates"
                    headerAction={<UpcomingPastSwitch active={datesTab} />}
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
                    loading={showsLoading}
                  />
                )}
              </div>
            </>
          )}
        </div>
        )
      ) : null}
    </div>
  );
}

function WorkspaceSelfServeAccessPanel({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onCreated,
}: {
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string | null) => void;
  onCreated: (workspaceId: string) => Promise<void>;
}) {
  const [workspaceName, setWorkspaceName] = useState('');
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('You currently have crew/view-only access in this workspace. Create your own workspace anytime without affecting your invited access elsewhere.');

  async function handleCreateWorkspace() {
    const cleanName = workspaceName.trim();
    if (!cleanName) {
      setMessage('Enter a workspace name to continue.');
      return;
    }

    setCreating(true);
    try {
      const workspace = await createWorkspace({ name: cleanName, slug: onboardingWorkspaceSlug(cleanName) || null });
      setWorkspaceName('');
      setMessage('Workspace created. You now have your own admin workspace.');
      await onCreated(workspace.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create workspace.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-3">
      <ActivationEmptyState
        title="Crew access only in this workspace."
        body="This workspace is available to you as invited crew/viewer access, so admin setup and management tools stay hidden here."
        actions={[{ label: 'Crew view', href: '/', tone: 'ghost', ctaId: 'go_crew_view' }]}
        telemetry={{ stateType: 'admin.viewer_guardrail' }}
      />

      <section className="rounded-xl border border-white/10 bg-white/[0.045] p-4 sm:p-5">
        <div className="space-y-3">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Your workspaces</p>
            <h2 className="mt-1 text-base font-semibold text-zinc-100">Switch context or create your own</h2>
          </div>

          {workspaces.length > 0 ? (
            <label className="grid gap-2 text-sm text-zinc-300">
              <span className="text-xs uppercase tracking-[0.14em] text-zinc-500">Current workspace</span>
              <select
                value={activeWorkspaceId ?? ''}
                onChange={(event) => onSelectWorkspace(event.target.value || null)}
                className="h-11 rounded-[10px] border border-white/10 bg-black/20 px-4 text-sm text-zinc-100 outline-none focus:border-accent/40"
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>{workspace.name || workspace.slug || workspace.id}</option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              placeholder="New workspace name"
              className="h-11 w-full rounded-[10px] border border-white/10 bg-black/20 px-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-accent/40"
            />
            <button type="button" onClick={() => void handleCreateWorkspace()} disabled={creating || !workspaceName.trim()} className={primaryButtonClassName()}>
              {creating ? 'Creating…' : 'Create my workspace'}
            </button>
          </div>

          <p className="text-sm text-zinc-300">{message}</p>
        </div>
      </section>
    </div>
  );
}

function formatInviteDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  // Date only ("Dec 5, 2026") — the time down to the second was just noise.
  return new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
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
    <section className="rounded-xl border border-white/10 bg-white/[0.045] p-4 sm:p-5">
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input
            value={newArtistName}
            onChange={(event) => onNewArtistNameChange(event.target.value)}
            placeholder="New project name"
            className="h-11 w-full rounded-[10px] border border-white/10 bg-black/20 px-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-accent/40"
          />
          <button type="button" onClick={onCreateArtist} disabled={creatingArtist || !newArtistName.trim()} className={primaryButtonClassName()}>
            {creatingArtist ? 'Creating…' : 'Create'}
          </button>
        </div>

        <div>
          {projects.length === 0 ? (
            <p className="text-sm text-zinc-400">No projects yet. Create your first project above.</p>
          ) : (
            <div ref={menuRootRef} className="divide-y divide-white/[0.08]">
              {projects.map((project) => {
                const isActive = project.id === activeProjectId;
                return (
                  <div key={project.id} className="py-2">
                    <div className="flex items-center justify-between gap-2">
                      <button type="button" onClick={() => onSelectProject(project.id)} className="min-h-10 min-w-0 flex-1 text-left">
                        <p className="truncate text-sm text-zinc-100">{project.name || project.slug || project.id}</p>
                        {isActive ? <p className="text-xs text-zinc-400">Currently selected</p> : null}
                      </button>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setMenuProjectId((current) => (current === project.id ? null : project.id))}
                          className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 transition hover:bg-white/[0.06] hover:text-zinc-100"
                          aria-label={`Project options for ${project.name || project.slug || project.id}`}
                        >
                          <MoreIcon />
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
                aria-label="Rename project"
                onClick={() => {
                  setRenameTargetId(null);
                  setRenameValue('');
                }}
              >
                <div className="w-full max-w-md rounded-xl border border-white/10 bg-zinc-950 p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                  <div className="mb-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Rename project</p>
                    <h3 className="mt-1 text-base font-semibold text-zinc-100">Update project name</h3>
                  </div>
                  <input
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    placeholder="Project name"
                    className="h-11 w-full rounded-[10px] border border-white/10 bg-black/20 px-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-accent/40"
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

function roleBadgeClassName(role: WorkspaceRole) {
  if (role === 'owner') return 'border-amber-400/30 bg-amber-500/10 text-amber-100';
  if (role === 'admin') return 'border-accent/30 bg-accent-soft text-accent-light';
  if (role === 'editor') return 'border-accent/30 bg-accent-soft text-accent-light';
  return 'border-white/10 bg-white/[0.06] text-zinc-200';
}

function inviteStatusBadgeClassName(status: WorkspaceInviteSummary['status']) {
  if (status === 'pending') return 'border-accent/30 bg-accent-soft text-accent-light';
  if (status === 'accepted') return 'border-accent/30 bg-accent-soft text-accent-light';
  if (status === 'revoked') return 'border-white/10 bg-white/[0.06] text-zinc-400'; // a status, not an action: grey, not red
  return 'border-white/10 bg-white/[0.06] text-zinc-300';
}

function directoryViewButtonClassName(active: boolean) {
  return `inline-flex h-9 items-center justify-center rounded-[10px] border px-3 text-xs font-medium transition ${active ? 'border-accent/40 bg-accent-soft text-accent-light' : 'border-white/10 bg-transparent text-zinc-300 hover:border-white/20 hover:bg-white/[0.05]'}`;
}

function TeamDirectoryCard({
  title,
  secondary,
  subtitle,
  role,
  status,
  action,
  showRoleBadge = true,
}: {
  title: string;
  /** Small grey line under the name (the email, when a name exists). */
  secondary?: string | null;
  /** What they can access, e.g. "Texas King" or "All projects". Omit to hide. */
  subtitle?: string | null;
  /** Hide the role badge when the row already has a role dropdown (one role control per person). */
  showRoleBadge?: boolean;
  role: WorkspaceRole;
  status?: WorkspaceInviteSummary['status'] | null;
  action?: ReactNode;
}) {
  return (
    <div className="border-t border-white/[0.08] py-3 first:border-t-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="min-w-0 truncate text-sm font-medium text-zinc-100">{title}</p>
            {showRoleBadge ? <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${roleBadgeClassName(role)}`}>{roleLabel(role)}</span> : null}
            {status ? <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${inviteStatusBadgeClassName(status)}`}>{status}</span> : null}
          </div>
          {secondary ? <p className="mt-0.5 truncate text-xs text-zinc-500">{secondary}</p> : null}
          {subtitle ? <p className="mt-1 truncate text-sm text-zinc-300">{subtitle}</p> : null}
        </div>
        {action ? <div className="w-full sm:w-auto sm:shrink-0">{action}</div> : null}
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
  allowAllProjects = true,
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
  onResendInvite,
  onCopyValue,
  contextProjectId,
  part = 'all',
  onCloseForm,
}: {
  /** 'form' = just the invite form (opened from the Invite button), 'directory' = just the invite lists. */
  part?: 'all' | 'form' | 'directory';
  onCloseForm?: () => void;
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
  allowAllProjects?: boolean;
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
  onResendInvite: (invite: WorkspaceInviteSummary) => void;
  onCopyValue: (value: string, successMessage: string) => void;
  contextProjectId?: string | null;
}) {
  // Split by status first so pending invites are never truncated by the history cap.
  // Slicing before splitting caused old-but-still-active pending invites to vanish from the
  // list (falling past position 12) while still blocking duplicate creation server-side.
  const allInviteGroups = splitInvitesByStatus(invites);
  const inviteGroups = {
    pending: allInviteGroups.pending,
    history: allInviteGroups.history.slice(0, 12),
  };
  const recentInvites = [...inviteGroups.pending, ...inviteGroups.history];
  const projectNameById = useMemo(() => new Map(availableProjects.map((project) => [project.id, project.name || project.slug || project.id])), [availableProjects]);
  const toursById = useMemo(() => new Map(availableTours.map((tour) => [tour.id, { id: tour.id, name: tour.name || tour.id, projectId: tour.projectId }])), [availableTours]);
  const contextProjectName = contextProjectId ? (projectNameById.get(contextProjectId) ?? null) : null;
  const [viewMode, setViewMode] = useState<'context' | 'workspace'>(contextProjectName ? 'context' : 'workspace');
  const effectiveViewMode = contextProjectName ? viewMode : 'workspace';
  const [showHistory, setShowHistory] = useState(false);
  const visiblePendingInvites = useMemo(
    () => effectiveViewMode === 'workspace' || !contextProjectId ? inviteGroups.pending : inviteGroups.pending.filter((invite) => matchesProjectContext(invite, contextProjectId, toursById)),
    [contextProjectId, effectiveViewMode, inviteGroups.pending, toursById],
  );
  const visibleHistoryInvites = useMemo(
    () => effectiveViewMode === 'workspace' || !contextProjectId ? inviteGroups.history : inviteGroups.history.filter((invite) => matchesProjectContext(invite, contextProjectId, toursById)),
    [contextProjectId, effectiveViewMode, inviteGroups.history, toursById],
  );

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.045] p-4 sm:p-5">
      <div className="space-y-3">
        {part !== 'directory' ? (
        <>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-zinc-100">Invite someone</h2>
          {onCloseForm ? (
            <button type="button" onClick={onCloseForm} className="text-sm text-zinc-400 transition hover:text-zinc-100">
              Close
            </button>
          ) : null}
        </div>
        {/* Order: name, email, role, access choices, then Create invite last. */}
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_160px]">
          <input
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            type="text"
            placeholder="Name"
            className="h-11 w-full rounded-[10px] border border-white/10 bg-black/20 px-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-accent/40"
          />
          <input
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            type="email"
            placeholder="teammate@example.com"
            className="h-11 w-full rounded-[10px] border border-white/10 bg-black/20 px-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-accent/40"
          />
          <select
            value={role}
            onChange={(event) => onRoleChange(event.target.value as WorkspaceInviteRole)}
            aria-label="Role"
            className="h-11 rounded-[10px] border border-white/10 bg-black/20 px-4 text-sm text-zinc-100 outline-none focus:border-accent/40"
          >
            <option value="viewer">Viewer</option>
            <option value="crew">Crew</option>
            <option value="editor">Manager</option>
          </select>
        </div>
        {role === 'viewer' || role === 'crew' || role === 'editor' ? (
          <p className="text-sm text-zinc-400">{roleLabel(role)}: {roleDescription(role)}</p>
        ) : null}

        <TeamScopeEditor
          prefix="invite"
          scopeType={scopeType}
          scopeProjectIds={scopeProjectIds}
          scopeTourIds={scopeTourIds}
          availableProjects={availableProjects}
          availableTours={availableTours}
          allowAllProjects={allowAllProjects}
          disableScopedAccess={role === 'admin'}
          disabledReason={role === 'admin' ? 'Admins always have full workspace access.' : undefined}
          onScopeTypeChange={onScopeTypeChange}
          onScopeProjectIdsChange={onScopeProjectIdsChange}
          onScopeTourIdsChange={onScopeTourIdsChange}
        />
        <div className="flex justify-end">
          <button type="button" onClick={onCreateInvite} disabled={creating} className={`${primaryButtonClassName()} w-full sm:w-auto`}>
            {creating ? 'Creating…' : 'Create invite'}
          </button>
        </div>
        {message ? <p className="text-sm text-zinc-300">{message}</p> : null}

        {lastInviteShare ? (
          <div className="rounded-xl border border-accent/25 bg-accent-soft p-3 text-sm text-accent-light">
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

        </>
        ) : null}
        {part !== 'form' ? (
        <div className={part === 'all' ? 'border-t border-white/10 pt-4' : ''}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-zinc-100">Invites</h2>
            </div>
            <div className="text-xs text-zinc-500">{visiblePendingInvites.length} pending · {visibleHistoryInvites.length} recent</div>
          </div>
          {contextProjectName ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 p-2">
              <p className="px-2 text-xs text-zinc-400">Viewing {effectiveViewMode === 'context' ? `this project: ${contextProjectName}` : 'all projects'} invites.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setViewMode('context')} className={directoryViewButtonClassName(effectiveViewMode === 'context')}>This project</button>
                <button type="button" onClick={() => setViewMode('workspace')} className={directoryViewButtonClassName(effectiveViewMode === 'workspace')}>All projects</button>
              </div>
            </div>
          ) : null}
          {loading ? (
            <div className="mt-3"><ListSkeleton rows={2} rowClassName="h-[74px] rounded-xl" label="Loading invites" /></div>
          ) : recentInvites.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-400">No invites yet.</p>
          ) : visiblePendingInvites.length === 0 && visibleHistoryInvites.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-400">No invites match this view yet.</p>
          ) : (
            <div className="mt-3 space-y-4">
              <div>
                <p className="pb-1 text-xs uppercase tracking-[0.14em] text-zinc-500">Pending invites</p>
                {visiblePendingInvites.length === 0 ? (
                  <p className="text-sm text-zinc-400">No pending invites.</p>
                ) : (
                  visiblePendingInvites.map((invite) => {
                    return (
                      <TeamDirectoryCard
                        key={invite.id}
                        title={invite.name || invite.email}
                        secondary={invite.name ? invite.email : null}
                        role={invite.role}
                        status={invite.status}
                        subtitle={`${summarizeTeamAccess(invite, { projectNameById, toursById })} · Expires ${formatInviteDate(invite.expiresAt)}`}
                        action={
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => onResendInvite(invite)} className={secondaryButtonClassName()}>Resend</button>
                            <button type="button" onClick={() => onRevokeInvite(invite)} className={dangerButtonClassName()}>Revoke</button>
                          </div>
                        }
                      />
                    );
                  })
                )}
              </div>
              {visibleHistoryInvites.length > 0 ? (
                <div>
                  {/* Invite history is folded away by default. */}
                  <button
                    type="button"
                    onClick={() => setShowHistory((current) => !current)}
                    aria-expanded={showHistory}
                    className="inline-flex min-h-10 items-center gap-1.5 text-sm text-zinc-400 transition hover:text-zinc-100"
                  >
                    <ChevronIcon open={showHistory} className="h-4 w-4" />
                    {showHistory ? 'Hide invite history' : `Show invite history (${visibleHistoryInvites.length})`}
                  </button>
                  {showHistory ? visibleHistoryInvites.map((invite) => {
                    return (
                      <TeamDirectoryCard
                        key={invite.id}
                        title={invite.name || invite.email}
                        secondary={invite.name ? invite.email : null}
                        role={invite.role}
                        status={invite.status}
                        subtitle={`${summarizeTeamAccess(invite, { projectNameById, toursById })} · Updated ${formatInviteDate(invite.updatedAt)}`}
                      />
                    );
                  }) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
        ) : null}
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
  allowAllProjects = true,
  disableScopedAccess = false,
  disabledReason,
  onScopeTypeChange,
  onScopeProjectIdsChange,
  onScopeTourIdsChange,
}: {
  prefix: string;
  /** False for Managers limited to some projects: they can't give "All projects". */
  allowAllProjects?: boolean;
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
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Access scope</p>
      <div className="mt-2 space-y-2">
        {allowAllProjects ? (
          <label className="flex items-start gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-200">
            <input type="radio" name={`${prefix}-scope`} checked={scopeType === 'workspace'} onChange={() => onScopeTypeChange('workspace')} className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/20" />
            <span className="block font-medium">All projects</span>
          </label>
        ) : null}
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
          <span className="block font-medium">Selected projects</span>
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
          <span className="block font-medium">Selected tours</span>
        </label>
      </div>

      {disableScopedAccess && disabledReason ? <p className="mt-3 text-sm text-zinc-500">{disabledReason}</p> : null}

      <div className="mt-3 space-y-2">
        <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Projects</p>
        {availableProjects.length === 0 ? (
          <p className="text-sm text-zinc-400">No projects available in this workspace.</p>
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
            <p className="text-sm text-zinc-400">No tours available for the selected project scope yet.</p>
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
  allowAllProjects = true,
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
  allowAllProjects?: boolean;
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
      <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-zinc-950 p-4 shadow-2xl sm:p-5" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Edit member</p>
            <h3 className="mt-1 text-base font-semibold text-zinc-100">{member.name || member.email || member.userId}</h3>
            {member.name && member.email ? <p className="mt-1 text-xs text-zinc-500">{member.email}</p> : null}
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
          }} className="h-11 rounded-[10px] border border-white/10 bg-black/20 px-4 text-sm text-zinc-100 outline-none focus:border-accent/40">
            <option value="viewer">Viewer</option>
            <option value="crew">Crew</option>
            <option value="editor">Manager</option>
            {canAssignAdmin && member.role === 'admin' ? <option value="admin">Admin (retired)</option> : null}
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
            allowAllProjects={allowAllProjects}
            disableScopedAccess={role === 'admin'}
            disabledReason={role === 'admin' ? 'Admins always have full workspace access.' : undefined}
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
  invites,
  loading,
  projects,
  tours,
  quickRoleMemberId,
  onQuickRoleChange,
  onEditMember,
  onRemoveMember,
  contextProjectId,
}: {
  members: WorkspaceMemberDirectoryEntry[];
  invites: WorkspaceInviteSummary[];
  loading: boolean;
  projects: ProjectSummary[];
  tours: TourSummary[];
  quickRoleMemberId: string | null;
  onQuickRoleChange: (member: WorkspaceMemberDirectoryEntry, role: AssignableRole) => void;
  onEditMember: (member: WorkspaceMemberDirectoryEntry) => void;
  onRemoveMember: (member: WorkspaceMemberDirectoryEntry) => void;
  contextProjectId?: string | null;
}) {
  const [openMemberMenuId, setOpenMemberMenuId] = useState<string | null>(null);

  useEffect(() => {
    function handlePointerDown(event: Event) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest('[data-team-member-menu-root="true"]')) return;
      setOpenMemberMenuId(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenMemberMenuId(null);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  function renderMemberRoleControl(member: WorkspaceMemberDirectoryEntry) {
    if (member.role === 'owner') return null;
    if (member.role === 'admin') {
      return (
        <button type="button" onClick={() => onEditMember(member)} className={secondaryButtonClassName()}>
          Manage admin
        </button>
      );
    }

    return (
      <label className="flex min-w-0 flex-1 flex-col sm:min-w-[9rem] sm:max-w-[10rem] sm:flex-none">
        <select
          value={member.role}
          onChange={(event) => onQuickRoleChange(member, event.target.value as AssignableRole)}
          disabled={quickRoleMemberId === member.id}
          aria-label={`Change role for ${member.name || member.email || member.userId}`}
          className="h-9 w-full rounded-[10px] border border-white/10 bg-black/20 px-3 pr-8 text-sm text-zinc-100 outline-none transition focus:border-accent/40 disabled:cursor-not-allowed disabled:opacity-60 sm:h-10"
        >
          <option value="viewer">Viewer</option>
          <option value="crew">Crew</option>
          <option value="editor">Manager</option>
        </select>
      </label>
    );
  }
  const projectNameById = useMemo(() => new Map(projects.map((project) => [project.id, project.name || project.slug || project.id])), [projects]);
  const toursById = useMemo(() => new Map(tours.map((tour) => [tour.id, { id: tour.id, name: tour.name || tour.id, projectId: tour.projectId }])), [tours]);
  const contextProjectName = contextProjectId ? (projectNameById.get(contextProjectId) ?? null) : null;
  const [viewMode, setViewMode] = useState<'context' | 'workspace'>(contextProjectName ? 'context' : 'workspace');

  const effectiveViewMode = contextProjectName ? viewMode : 'workspace';

  const acceptedEntries = useMemo(() => buildAcceptedTeamDirectory(members, invites), [members, invites]);
  // Owner first, then people in this project, then by name (or email).
  const sortedMembers = [...acceptedEntries].sort((a, b) => {
    const aOwner = a.role === 'owner' ? 1 : 0;
    const bOwner = b.role === 'owner' ? 1 : 0;
    if (aOwner !== bOwner) return bOwner - aOwner;
    const aInContext = matchesProjectContext(a, contextProjectId, toursById) ? 1 : 0;
    const bInContext = matchesProjectContext(b, contextProjectId, toursById) ? 1 : 0;
    if (aInContext !== bInContext) return bInContext - aInContext;
    return (a.name || a.email || a.userId).localeCompare(b.name || b.email || b.userId, undefined, { sensitivity: 'base' });
  });
  const visibleMembers = effectiveViewMode === 'workspace' || !contextProjectId
    ? sortedMembers
    : sortedMembers.filter((member) => matchesProjectContext(member, contextProjectId, toursById));

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.045] p-4 sm:p-5">
      <div className="space-y-3">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Members</p>
          <h2 className="mt-1 text-base font-semibold text-zinc-100">Accepted team members</h2>
        </div>

        {contextProjectName ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 p-2">
            <p className="px-2 text-xs text-zinc-400">Viewing {effectiveViewMode === 'context' ? `this project: ${contextProjectName}` : 'all projects'} members.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setViewMode('context')} className={directoryViewButtonClassName(effectiveViewMode === 'context')}>This project</button>
              <button type="button" onClick={() => setViewMode('workspace')} className={directoryViewButtonClassName(effectiveViewMode === 'workspace')}>All projects</button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <ListSkeleton rowClassName="h-[74px] rounded-xl" label="Loading members" />
        ) : acceptedEntries.length === 0 ? (
          <p className="text-sm text-zinc-400">No team members found yet.</p>
        ) : visibleMembers.length === 0 ? (
          <p className="text-sm text-zinc-400">No accepted members match this view yet.</p>
        ) : (
          <div>
            {visibleMembers.map((member) => {
              return (
                <TeamDirectoryCard
                  key={member.id}
                  title={member.name || member.email || member.userId}
                  secondary={member.name && member.email ? member.email : null}
                  role={member.role}
                  showRoleBadge={!(member.source === 'member' && (member.role === 'editor' || member.role === 'crew' || member.role === 'viewer'))}
                  subtitle={effectiveViewMode === 'workspace' ? summarizeTeamAccess(member, { projectNameById, toursById }) : null}
                  action={member.source === 'member' && member.role !== 'owner' ? (
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
                      <div className="flex w-full items-end justify-between gap-2 sm:w-auto sm:justify-end">
                        {renderMemberRoleControl(member)}
                        <div data-team-member-menu-root="true" className="relative shrink-0">
                          <button
                            type="button"
                            onClick={() => setOpenMemberMenuId((current) => (current === member.id ? null : member.id))}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.05] sm:h-10 sm:w-10"
                            aria-label={`More actions for ${member.name || member.email || member.userId}`}
                            aria-expanded={openMemberMenuId === member.id}
                          >
                            <MoreIcon />
                          </button>
                          {openMemberMenuId === member.id ? (
                            <div className="absolute right-0 top-full z-20 mt-2 min-w-[180px] overflow-hidden rounded-xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/60">
                              {member.role !== 'admin' ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMemberMenuId(null);
                                    onEditMember(member);
                                  }}
                                  className="block w-full border-b border-white/5 px-4 py-3 text-left text-sm text-zinc-200 transition hover:bg-white/[0.06]"
                                >
                                  Edit scope
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMemberMenuId(null);
                                  onRemoveMember(member);
                                }}
                                className="block w-full px-4 py-3 text-left text-sm text-red-200 transition hover:bg-white/[0.06]"
                              >
                                Remove
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : member.source === 'accepted-invite' ? (
                    <p className="text-xs text-amber-200/80">Accepted recently. Membership sync will refresh here automatically.</p>
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
  // Sections crew can't see are dimmed (the switch itself stays at full strength).
  const hiddenFromCrew = visibilityState === false;
  return (
    <section className={bubbleClassName()}>
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => onExpandedChange(!expanded)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <h2 className={`truncate text-base font-semibold transition-colors ${hiddenFromCrew ? 'text-zinc-500' : ''}`}>{title}</h2>
          {!expanded && hasContent ? <span className="h-2.5 w-2.5 rounded-full bg-accent-light" /> : null}
        </button>
        <div className="flex items-center gap-1">
          {typeof visibilityState === 'boolean' && onVisibilityToggle ? <Toggle enabled={visibilityState} onToggle={onVisibilityToggle} label={`${title}: ${visibilityState ? 'visible to crew' : 'hidden from crew'}`} /> : null}
          <button
            type="button"
            onClick={() => onExpandedChange(!expanded)}
            className="-my-1 -mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-200"
            aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`}
            aria-expanded={expanded}
          >
            <ChevronIcon open={expanded} />
          </button>
        </div>
      </div>
      {expanded ? <div className={`mt-3 transition-opacity ${hiddenFromCrew ? 'opacity-70' : ''}`}>{children}</div> : null}
    </section>
  );
}


/** Small two-part switch on the Dates list: Upcoming | Past. */
function UpcomingPastSwitch({ active }: { active: 'upcoming' | 'past' }) {
  const segment = (selected: boolean) =>
    `inline-flex min-h-9 items-center rounded-[8px] px-3 text-sm transition ${selected ? 'bg-accent-soft font-medium text-accent-light' : 'text-zinc-400 hover:text-zinc-100'}`;
  return (
    <nav aria-label="Show dates" className="inline-flex shrink-0 rounded-[10px] bg-white/[0.05] p-0.5">
      <Link href="/admin/dates?tab=upcoming" aria-current={active === 'upcoming' ? 'page' : undefined} className={segment(active === 'upcoming')}>
        Upcoming
      </Link>
      <Link href="/admin/dates?tab=past" aria-current={active === 'past' ? 'page' : undefined} className={segment(active === 'past')}>
        Past
      </Link>
    </nav>
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
  loading = false,
  headerAction,
}: {
  title: string;
  /** Shown at the right of the card's title row (e.g. the Upcoming / Past switch). */
  headerAction?: ReactNode;
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
  loading?: boolean;
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
    const menuHeight = mode === 'drafts' ? 168 : show.status === 'draft' ? 168 : 168;
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
          <MenuButton label="Duplicate draft" onClick={() => runMenuAction(() => onDuplicate(show))} />
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
      <div key={show.id} className="relative py-3">
        <div className="flex items-start justify-between gap-3">
          <Link href={href} className="min-w-0 flex-1 rounded-md outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent/50">
            <p className="text-xs uppercase tracking-wide tabular-nums text-zinc-400">{formatShowDate(show.date)}</p>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-sm font-medium">{getAdminListPrimaryLabel(show)}</p>
              {show.status === 'draft' ? <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-300">Draft</span> : null}
            </div>
            {getAdminListSubLabel(show) ? <p className="text-sm text-zinc-300">{getAdminListSubLabel(show)}</p> : null}
          </Link>

          <div className="-mr-2 flex shrink-0 items-center gap-0.5 self-start" onClick={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}>
            <button
              type="button"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); onEdit(show); }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 transition hover:bg-white/[0.06] hover:text-zinc-100"
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
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 transition ${menuOpen ? 'bg-accent-soft text-accent-light' : 'hover:bg-white/[0.06] hover:text-zinc-100'}`}
              aria-label="More actions"
            >
              <MoreIcon />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.045] p-4">
      <div className="space-y-3">
        <div className="flex min-h-10 items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          {headerAction}
        </div>
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

      <div className="mt-2">
        {shows.length === 0 && loading ? (
          <div className="pt-2"><ListSkeleton rowClassName="h-16 rounded-xl" label="Loading dates" /></div>
        ) : shows.length === 0 ? (
          <div className="py-4 text-sm text-zinc-400">
            {totalCount === 0 ? `No ${mode === 'drafts' ? 'drafts' : 'dates'} yet.` : 'No shows match this filter.'}
          </div>
        ) : groupedShows && groupedShows.length > 0 ? (
          groupedShows.map(([year, items]) => (
            <section key={year}>
              <div className={`border-b border-white/[0.08] pb-2 pt-4 text-sm font-medium tabular-nums text-zinc-400 ${stickyYears ? 'sticky top-[var(--app-header-h,96px)] z-10 bg-zinc-950/95 backdrop-blur' : ''}`}>{year}</div>
              <div className="divide-y divide-white/[0.08]">{items.map((show) => renderShowListItem(show))}</div>
            </section>
          ))
        ) : (
          <div className="divide-y divide-white/[0.08]">{shows.map((show) => renderShowListItem(show))}</div>
        )}
      </div>

      {menuState && typeof document !== 'undefined'
        ? createPortal(
            <div
              data-admin-menu-portal="true"
              className="fixed z-[260] min-w-[220px] overflow-hidden rounded-xl border border-zinc-700/90 bg-black shadow-[0_28px_80px_rgba(0,0,0,0.92)] ring-1 ring-white/10"
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

/**
 * Eye button for "can crew see this section?": open eye = visible to crew,
 * crossed-out eye = hidden. 44×44px tap area.
 */
function Toggle({ enabled, onToggle, label }: { enabled: boolean; onToggle: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={enabled}
      onClick={() => onToggle(!enabled)}
      className={`-my-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${enabled ? 'text-accent-light' : 'text-zinc-500 hover:text-zinc-300'}`}
    >
      {enabled ? <EyeIcon /> : <EyeOffIcon />}
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

function InlineSelect({
  label,
  value,
  onChange,
  options,
  labelWidthClassName,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  labelWidthClassName?: string;
}) {
  return (
    <label className="flex items-center gap-3 text-sm text-zinc-300">
      <span className={`${labelWidthClassName ?? 'w-[72px]'} shrink-0 text-zinc-300`}>{label}</span>
      <div className="relative min-w-0 flex-1">
        <select
          value={value}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
          className={`${fieldClassName()} min-w-0 flex-1 appearance-none pr-11`}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-zinc-400">
          <ChevronDownIcon />
        </span>
      </div>
    </label>
  );
}

/** "2026-12-01" -> "Tue, Dec 1, 2026" (null if it isn't a complete YYYY-MM-DD date). */
function formatFriendlyIsoDate(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(date.getTime()) || date.getMonth() !== Number(m) - 1) return null;
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(date);
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
  // Show a saved date as "Tue, Dec 1, 2026" while you're not typing in the box;
  // the stored value stays YYYY-MM-DD.
  const [focused, setFocused] = useState(false);
  const displayValue = !focused ? formatFriendlyIsoDate(value) ?? value : value;

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
          value={displayValue}
          aria-label={label}
          inputMode="numeric"
          placeholder="Choose a date"
          onFocus={() => setFocused(true)}
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => {
            setFocused(false);
            commitNextValue(event.target.value);
          }}
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
        className="w-full rounded-[10px] border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-accent/40"
      />
    </label>
  );
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureProjectAccess, ensureTourInScope, ensureTourAccess, isMissingRelationError, isSchemaDriftError, requireWorkspaceAccess, ApiError, requireScopedDataClient, canAccessProject, canAccessTour } from '@/lib/data/server/shared';
import type { DateFormValues, DateRecord, DateScheduleItem, DateStatus, DateVisibility } from '@/lib/types/date-record';
import type { WorkspaceRole } from '@/lib/types/tenant';
import { upsertTourByName } from '@/lib/data/server/tours';
import { buildAnchorScheduleItems as buildAnchorScheduleItemsImpl, normalizeScheduleItemsForPersistence as normalizeScheduleItemsImpl } from './schedule-normalization';
import type { ScheduleItemLike } from './schedule-normalization';

const DEFAULT_VISIBILITY: DateVisibility = {
  show_venue: true,
  show_parking_load_info: true,
  show_schedule: true,
  show_dos_contact: true,
  show_accommodation: true,
  show_notes: false,
  show_guest_list_notes: false,
};

const DATES_SELECT_COLUMNS = [
  'id',
  'workspace_id',
  'project_id',
  'tour_id',
  'legacy_tour_name',
  'date',
  'day_type',
  'status',
  'city',
  'region',
  'country',
  'venue_name',
  'label',
  'venue_address',
  'venue_maps_url',
  'dos_name',
  'dos_phone',
  'parking_load_info',
  'hotel_name',
  'hotel_address',
  'hotel_maps_url',
  'hotel_notes',
  'notes',
  'guest_list_notes',
  'load_in_time',
  'soundcheck_time',
  'doors_time',
  'show_time',
  'curfew_time',
  'show_venue',
  'show_parking_load_info',
  'show_schedule',
  'show_dos_contact',
  'show_accommodation',
  'show_notes',
  'show_guest_list_notes',
  'created_at',
  'updated_at',
] as const;

const LEGACY_MISSING_DATE_COLUMNS = ['day_type'] as const;

function normalizeStatus(value: unknown): DateStatus {
  return value === 'draft' || value === 'archived' || value === 'cancelled' ? value : 'published';
}

function normalizeDayType(value: unknown): DateRecord['day_type'] {
  return value === 'travel' || value === 'off' ? value : 'show';
}

function normalizeVisibility(row: any): DateVisibility {
  return {
    show_venue: row?.show_venue ?? DEFAULT_VISIBILITY.show_venue,
    show_parking_load_info: row?.show_parking_load_info ?? DEFAULT_VISIBILITY.show_parking_load_info,
    show_schedule: row?.show_schedule ?? DEFAULT_VISIBILITY.show_schedule,
    show_dos_contact: row?.show_dos_contact ?? DEFAULT_VISIBILITY.show_dos_contact,
    show_accommodation: row?.show_accommodation ?? DEFAULT_VISIBILITY.show_accommodation,
    show_notes: row?.show_notes ?? DEFAULT_VISIBILITY.show_notes,
    show_guest_list_notes: row?.show_guest_list_notes ?? DEFAULT_VISIBILITY.show_guest_list_notes,
  };
}

function normalizeDateRecord(row: any, scheduleItems: DateScheduleItem[] = []): DateRecord {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    project_id: String(row.project_id),
    tour_id: row.tour_id ? String(row.tour_id) : null,
    legacy_tour_name: row.legacy_tour_name ? String(row.legacy_tour_name) : null,
    date: String(row.date ?? ''),
    day_type: normalizeDayType(row.day_type),
    status: normalizeStatus(row.status),
    city: String(row.city ?? ''),
    region: String(row.region ?? ''),
    country: String(row.country ?? ''),
    venue_name: String(row.venue_name ?? ''),
    label: String(row.label ?? ''),
    venue_address: String(row.venue_address ?? ''),
    venue_maps_url: String(row.venue_maps_url ?? ''),
    dos_name: String(row.dos_name ?? ''),
    dos_phone: String(row.dos_phone ?? ''),
    parking_load_info: String(row.parking_load_info ?? ''),
    hotel_name: String(row.hotel_name ?? ''),
    hotel_address: String(row.hotel_address ?? ''),
    hotel_maps_url: String(row.hotel_maps_url ?? ''),
    hotel_notes: String(row.hotel_notes ?? ''),
    notes: String(row.notes ?? ''),
    guest_list_notes: String(row.guest_list_notes ?? ''),
    load_in_time: String(row.load_in_time ?? ''),
    soundcheck_time: String(row.soundcheck_time ?? ''),
    doors_time: String(row.doors_time ?? ''),
    show_time: String(row.show_time ?? ''),
    curfew_time: String(row.curfew_time ?? ''),
    visibility: normalizeVisibility(row),
    schedule_items: scheduleItems,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? row.created_at ?? ''),
  };
}

function normalizeScheduleItems(rows: any[]): DateScheduleItem[] {
  return [...rows]
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
    .map((row) => ({
      id: String(row.id),
      label: String(row.label ?? ''),
      time_text: String(row.time_text ?? ''),
      sort_order: Number(row.sort_order ?? 0),
    }));
}

function requireDateValue(value: unknown) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw new ApiError(400, 'Date is required.');
  }
}

function buildDatePayload(values: Partial<DateFormValues>, workspaceId: string, projectId: string) {
  return {
    workspace_id: workspaceId,
    project_id: projectId,
    tour_id: values.tour_id || null,
    legacy_tour_name: values.legacy_tour_name || null,
    date: values.date || null,
    day_type: normalizeDayType(values.day_type),
    status: normalizeStatus(values.status),
    city: values.city || null,
    region: values.region || null,
    country: values.country || null,
    venue_name: values.venue_name || null,
    label: values.label || null,
    venue_address: values.venue_address || null,
    venue_maps_url: values.venue_maps_url || null,
    dos_name: values.dos_name || null,
    dos_phone: values.dos_phone || null,
    parking_load_info: values.parking_load_info || null,
    hotel_name: values.hotel_name || null,
    hotel_address: values.hotel_address || null,
    hotel_maps_url: values.hotel_maps_url || null,
    hotel_notes: values.hotel_notes || null,
    notes: values.notes || null,
    guest_list_notes: values.guest_list_notes || null,
    load_in_time: values.load_in_time || null,
    soundcheck_time: values.soundcheck_time || null,
    doors_time: values.doors_time || null,
    show_time: values.show_time || null,
    curfew_time: values.curfew_time || null,
    show_venue: values.visibility?.show_venue ?? DEFAULT_VISIBILITY.show_venue,
    show_parking_load_info: values.visibility?.show_parking_load_info ?? DEFAULT_VISIBILITY.show_parking_load_info,
    show_schedule: values.visibility?.show_schedule ?? DEFAULT_VISIBILITY.show_schedule,
    show_dos_contact: values.visibility?.show_dos_contact ?? DEFAULT_VISIBILITY.show_dos_contact,
    show_accommodation: values.visibility?.show_accommodation ?? DEFAULT_VISIBILITY.show_accommodation,
    show_notes: values.visibility?.show_notes ?? DEFAULT_VISIBILITY.show_notes,
    show_guest_list_notes: values.visibility?.show_guest_list_notes ?? DEFAULT_VISIBILITY.show_guest_list_notes,
  };
}

function getDatesSelectClause(omitColumns: readonly string[] = []) {
  return DATES_SELECT_COLUMNS.filter((column) => !omitColumns.includes(column)).join(', ');
}

function stripDatePayloadColumns(payload: Record<string, unknown>, omitColumns: readonly string[]) {
  const nextPayload = { ...payload };
  for (const column of omitColumns) {
    delete nextPayload[column];
  }
  return nextPayload;
}

async function runDatesSelect<T>(buildQuery: (selectClause: string) => PromiseLike<{ data: T | null; error: any }>, options?: { allowLegacyDayTypeFallback?: boolean }) {
  const primary = await buildQuery(getDatesSelectClause());
  if (!primary.error || !options?.allowLegacyDayTypeFallback || !isSchemaDriftError(primary.error)) {
    return primary;
  }

  const message = String(primary.error?.message ?? '').toLowerCase();
  const mentionsDayType = message.includes('day_type') || message.includes('column');
  if (!mentionsDayType) {
    return primary;
  }

  return buildQuery(getDatesSelectClause(LEGACY_MISSING_DATE_COLUMNS));
}

async function runDatesWrite<T>(
  attempt: (payload: Record<string, unknown>) => PromiseLike<{ data: T | null; error: any }>,
  payload: Record<string, unknown>,
  options?: { allowLegacyDayTypeFallback?: boolean },
) {
  const primary = await attempt(payload);
  if (!primary.error || !isSchemaDriftError(primary.error)) {
    return primary;
  }

  const message = String(primary.error?.message ?? '').toLowerCase();
  if (!message.includes('day_type') && !message.includes('column')) {
    return primary;
  }

  if (!options?.allowLegacyDayTypeFallback) {
    return primary;
  }

  return attempt(stripDatePayloadColumns(payload, LEGACY_MISSING_DATE_COLUMNS));
}

async function listScheduleItemsForDate(supabase: SupabaseClient, dateId: string): Promise<DateScheduleItem[]> {
  const { data, error } = await supabase
    .from('date_schedule_items')
    .select('id, label, time_text, sort_order')
    .eq('date_id', dateId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    if (isMissingRelationError(error)) return [];
    throw new Error(error.message);
  }

  return normalizeScheduleItems(data ?? []);
}

export function buildAnchorScheduleItems(values: Partial<DateFormValues>) {
  return buildAnchorScheduleItemsImpl(values);
}

export function normalizeScheduleItemsForPersistence(scheduleItems: ScheduleItemLike[] | undefined, fallbackValues: Partial<DateFormValues>): Array<Partial<DateScheduleItem>> {
  return normalizeScheduleItemsImpl(scheduleItems, fallbackValues) as Array<Partial<DateScheduleItem>>;
}

async function replaceScheduleItems(supabase: SupabaseClient, dateId: string, workspaceId: string, projectId: string, scheduleItems: ScheduleItemLike[]) {
  const deleteResult = await supabase.from('date_schedule_items').delete().eq('date_id', dateId);
  if (deleteResult.error && !isMissingRelationError(deleteResult.error)) {
    throw new Error(deleteResult.error.message);
  }

  const cleaned = (scheduleItems ?? [])
    .map((item, index) => ({
      workspace_id: workspaceId,
      project_id: projectId,
      date_id: dateId,
      label: String(item.label ?? '').trim(),
      time_text: String(item.time_text ?? item.time ?? '').trim(),
      sort_order: Number.isFinite(item.sort_order) ? Number(item.sort_order) : index,
    }))
    .filter((item) => item.label || item.time_text);

  if (!cleaned.length) return;

  const insertResult = await supabase.from('date_schedule_items').insert(cleaned);
  if (insertResult.error) {
    if (isMissingRelationError(insertResult.error)) {
      throw new ApiError(409, 'Date schedule schema is not ready yet.');
    }
    throw new Error(insertResult.error.message);
  }
}

async function assertDateReadable(supabase: SupabaseClient, userId: string, workspaceId: string, dateId: string) {
  const membership = await requireWorkspaceAccess(supabase, userId, workspaceId);
  const { data, error } = await runDatesSelect<any>(
    (selectClause) => supabase
      .from('dates')
      .select(selectClause)
      .eq('id', dateId)
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
    { allowLegacyDayTypeFallback: true },
  );

  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(409, 'Dates schema is not ready yet.');
    }
    throw new ApiError(500, error.message);
  }

  if (!data) {
    throw new ApiError(404, 'Date not found.');
  }

  const projectId = String(data.project_id ?? '');
  if (!canAccessProject(membership, projectId)) {
    throw new ApiError(404, 'Date not found.');
  }

  const status = normalizeStatus(data.status);
  if (membership.role === 'viewer' && status !== 'published') {
    throw new ApiError(404, 'Date not found.');
  }

  const tourId = data.tour_id ? String(data.tour_id) : null;
  if (!canAccessTour(membership, projectId, tourId)) {
    throw new ApiError(404, 'Date not found.');
  }

  return { row: data, role: membership.role, access: membership };
}

export async function listDatesScoped(supabaseInput: SupabaseClient, input: {
  userId: string;
  workspaceId: string;
  projectId: string;
  tourId?: string | null;
  includeDrafts?: boolean;
  limit?: number;
}): Promise<DateRecord[]> {
  const supabase = requireScopedDataClient(supabaseInput);
  const membership = await ensureProjectAccess(supabase, input.userId, input.workspaceId, input.projectId);
  await ensureTourInScope(supabase, input.workspaceId, input.projectId, input.tourId);

  let buildQuery = (selectClause: string) => supabase
    .from('dates')
    .select(selectClause)
    .eq('workspace_id', input.workspaceId)
    .eq('project_id', input.projectId)
    .order('date', { ascending: true })
    .order('created_at', { ascending: true });

  if (input.tourId) {
    await ensureTourAccess(supabase, input.userId, input.workspaceId, input.projectId, input.tourId, ['owner', 'admin', 'editor', 'viewer']);
    const previous = buildQuery;
    buildQuery = (selectClause: string) => previous(selectClause).eq('tour_id', input.tourId as string);
  } else if (membership.scopeType === 'tours') {
    const previous = buildQuery;
    buildQuery = (selectClause: string) => previous(selectClause).in('tour_id', membership.tourIds);
  }

  if (membership.role === 'viewer' || !input.includeDrafts) {
    const previous = buildQuery;
    buildQuery = (selectClause: string) => previous(selectClause).eq('status', 'published');
  }

  const cappedLimit = Math.min(Math.max(Number(input.limit ?? 200), 1), 500);
  const finalBuildQuery = buildQuery;

  const { data, error } = await runDatesSelect<any[]>(
    (selectClause) => finalBuildQuery(selectClause).limit(cappedLimit),
    { allowLegacyDayTypeFallback: true },
  );
  if (error) {
    if (isMissingRelationError(error)) return [];
    throw new Error(error.message);
  }

  const rows = data ?? [];
  const dateIds = rows.map((row: any) => row.id);
  let scheduleByDate = new Map<string, DateScheduleItem[]>();

  if (dateIds.length) {
    const scheduleResult = await supabase
      .from('date_schedule_items')
      .select('id, date_id, label, time_text, sort_order, created_at')
      .in('date_id', dateIds)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (scheduleResult.error) {
      if (isMissingRelationError(scheduleResult.error)) {
        scheduleByDate = new Map<string, DateScheduleItem[]>();
      } else {
        throw new Error(scheduleResult.error.message);
      }
    } else if (scheduleResult.data) {
      scheduleByDate = scheduleResult.data.reduce((map: Map<string, DateScheduleItem[]>, row: any) => {
        const dateId = String(row.date_id);
        const items = map.get(dateId) ?? [];
        items.push({
          id: String(row.id),
          label: String(row.label ?? ''),
          time_text: String(row.time_text ?? ''),
          sort_order: Number(row.sort_order ?? 0),
        });
        map.set(dateId, items);
        return map;
      }, new Map<string, DateScheduleItem[]>());
    }
  }

  return rows.map((row: any) => normalizeDateRecord(row, scheduleByDate.get(String(row.id)) ?? []));
}

export async function getDateScoped(supabaseInput: SupabaseClient, userId: string, workspaceId: string, dateId: string): Promise<DateRecord> {
  const supabase = requireScopedDataClient(supabaseInput);
  const { row } = await assertDateReadable(supabase, userId, workspaceId, dateId);
  const scheduleItems = await listScheduleItemsForDate(supabase, String(row.id));
  return normalizeDateRecord(row, scheduleItems);
}

export async function createDateScoped(supabaseInput: SupabaseClient, userId: string, values: Partial<DateFormValues>): Promise<DateRecord> {
  const supabase = requireScopedDataClient(supabaseInput);
  const workspaceId = String(values.workspace_id ?? '');
  const projectId = String(values.project_id ?? '');
  const access = await ensureProjectAccess(supabase, userId, workspaceId, projectId, ['owner', 'admin', 'editor']);
  requireDateValue(values.date);

  // Auto-create a tour entity from legacy_tour_name so the tours table stays
  // populated and the invite-scope dropdown has something to show.
  let resolvedValues: Partial<DateFormValues> = { ...values };
  if (!resolvedValues.tour_id && resolvedValues.legacy_tour_name) {
    try {
      const tour = await upsertTourByName(supabase, workspaceId, projectId, resolvedValues.legacy_tour_name);
      resolvedValues = { ...resolvedValues, tour_id: tour.id };
    } catch {
      // If tour upsert fails (e.g. schema not ready), continue without tour_id
    }
  }

  await ensureTourInScope(supabase, workspaceId, projectId, resolvedValues.tour_id);
  if (access.scopeType === 'tours' && !resolvedValues.tour_id) {
    throw new ApiError(403, 'Tour-scoped members can only create dates inside an assigned tour.');
  }
  if (resolvedValues.tour_id) {
    await ensureTourAccess(supabase, userId, workspaceId, projectId, String(resolvedValues.tour_id), ['owner', 'admin', 'editor']);
  }

  const payload = buildDatePayload(resolvedValues, workspaceId, projectId);
  const requestedDayType = String(payload.day_type ?? 'show');
  const { data, error } = await runDatesWrite<any>(
    (nextPayload) => supabase.from('dates').insert(nextPayload).select(getDatesSelectClause(LEGACY_MISSING_DATE_COLUMNS)).single(),
    payload,
    { allowLegacyDayTypeFallback: requestedDayType === 'show' },
  );
  if (error || !data) {
    if (isMissingRelationError(error) || isSchemaDriftError(error)) {
      if (requestedDayType !== 'show') {
        throw new ApiError(409, 'Tour day schema is not ready yet. Apply the live dates.day_type migration before creating travel or off days.');
      }
      throw new ApiError(409, 'Dates schema is not ready yet.');
    }
    throw new ApiError(500, error?.message ?? 'Unable to create date.');
  }

  const normalizedScheduleItems = normalizeScheduleItemsForPersistence(values.schedule_items as ScheduleItemLike[] | undefined, resolvedValues);
  await replaceScheduleItems(supabase, String(data.id), workspaceId, projectId, normalizedScheduleItems);
  return getDateScoped(supabase, userId, workspaceId, String(data.id));
}

export async function updateDateScoped(supabaseInput: SupabaseClient, userId: string, workspaceId: string, dateId: string, values: Partial<DateFormValues>): Promise<DateRecord> {
  const supabase = requireScopedDataClient(supabaseInput);
  const current = await getDateScoped(supabase, userId, workspaceId, dateId);
  const projectId = String(values.project_id ?? current.project_id);
  const access = await ensureProjectAccess(supabase, userId, workspaceId, projectId, ['owner', 'admin', 'editor']);
  requireDateValue(values.date ?? current.date);

  // Auto-create a tour entity from legacy_tour_name if provided and no tour_id set yet.
  const incomingTourName = values.legacy_tour_name ?? current.legacy_tour_name;
  let resolvedTourId = values.tour_id ?? current.tour_id;
  if (!resolvedTourId && incomingTourName) {
    try {
      const tour = await upsertTourByName(supabase, workspaceId, projectId, incomingTourName);
      resolvedTourId = tour.id;
    } catch {
      // If tour upsert fails (e.g. schema not ready), continue without tour_id
    }
  }

  const effectiveTourId = resolvedTourId;
  await ensureTourInScope(supabase, workspaceId, projectId, effectiveTourId);
  if (access.scopeType === 'tours' && !effectiveTourId) {
    throw new ApiError(403, 'Tour-scoped members can only update dates inside an assigned tour.');
  }
  if (effectiveTourId) {
    await ensureTourAccess(supabase, userId, workspaceId, projectId, String(effectiveTourId), ['owner', 'admin', 'editor']);
  }

  const payload = buildDatePayload({ ...current, ...values, tour_id: effectiveTourId, project_id: projectId, workspace_id: workspaceId }, workspaceId, projectId);
  const requestedDayType = String(payload.day_type ?? current.day_type ?? 'show');
  const { data, error } = await runDatesWrite<any>(
    (nextPayload) => supabase
      .from('dates')
      .update(nextPayload)
      .eq('id', dateId)
      .eq('workspace_id', workspaceId)
      .select(getDatesSelectClause(LEGACY_MISSING_DATE_COLUMNS))
      .single(),
    payload,
    { allowLegacyDayTypeFallback: requestedDayType === 'show' },
  );

  if (error || !data) {
    if (isMissingRelationError(error) || isSchemaDriftError(error)) {
      if (requestedDayType !== 'show') {
        throw new ApiError(409, 'Tour day schema is not ready yet. Apply the live dates.day_type migration before creating travel or off days.');
      }
      throw new ApiError(409, 'Dates schema is not ready yet.');
    }
    throw new ApiError(500, error?.message ?? 'Unable to update date.');
  }

  // Pass current.schedule_items as the schedule_items in fallbackValues so that
  // normalizeScheduleItemsForPersistence can preserve existing arbitrary rows
  // (e.g. "Band Soundcheck", "Line Check") even when the incoming payload
  // sends an empty schedule_items array (which happens when the editor form
  // has only unfilled placeholder rows). Without this, the fallback would
  // generate only standard anchor rows (Load In, Doors, etc.) via
  // buildAnchorScheduleItems, silently dropping non-anchor custom items.
  const normalizedScheduleItems = normalizeScheduleItemsForPersistence(
    values.schedule_items as ScheduleItemLike[] | undefined,
    { ...current, ...values, schedule_items: values.schedule_items ?? current.schedule_items },
  );
  await replaceScheduleItems(supabase, String(data.id), workspaceId, projectId, normalizedScheduleItems);
  return getDateScoped(supabase, userId, workspaceId, dateId);
}

export async function deleteDateScoped(supabaseInput: SupabaseClient, userId: string, workspaceId: string, dateId: string) {
  const supabase = requireScopedDataClient(supabaseInput);
  await requireWorkspaceAccess(supabase, userId, workspaceId, ['owner', 'admin']);
  await getDateScoped(supabase, userId, workspaceId, dateId);
  const { error } = await supabase.from('dates').delete().eq('id', dateId).eq('workspace_id', workspaceId);
  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(409, 'Dates schema is not ready yet.');
    }
    throw new ApiError(500, error.message);
  }
}

export async function canUserSeeDrafts(supabaseInput: SupabaseClient, userId: string, workspaceId: string) {
  const supabase = requireScopedDataClient(supabaseInput);
  const access = await requireWorkspaceAccess(supabase, userId, workspaceId);
  return access.role !== 'viewer';
}

export async function getWorkspaceRoleForDateScope(supabaseInput: SupabaseClient, userId: string, workspaceId: string): Promise<WorkspaceRole> {
  const supabase = requireScopedDataClient(supabaseInput);
  const access = await requireWorkspaceAccess(supabase, userId, workspaceId);
  return access.role;
}

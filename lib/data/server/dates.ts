import { ensureProjectInWorkspace, ensureTourInScope, getPrivilegedDataClient, isMissingRelationError, requireWorkspaceAccess, ApiError } from '@/lib/data/server/shared';
import type { DateFormValues, DateRecord, DateScheduleItem, DateStatus, DateVisibility } from '@/lib/types/date-record';
import type { WorkspaceRole } from '@/lib/types/tenant';

const DEFAULT_VISIBILITY: DateVisibility = {
  show_venue: true,
  show_parking_load_info: true,
  show_schedule: true,
  show_dos_contact: true,
  show_accommodation: true,
  show_notes: false,
  show_guest_list_notes: false,
};

function normalizeStatus(value: unknown): DateStatus {
  return value === 'draft' || value === 'archived' || value === 'cancelled' ? value : 'published';
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


async function listScheduleItemsForDate(dateId: string): Promise<DateScheduleItem[]> {
  const supabase = getPrivilegedDataClient();
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

async function replaceScheduleItems(dateId: string, workspaceId: string, projectId: string, scheduleItems: Array<Partial<DateScheduleItem>>) {
  const supabase = getPrivilegedDataClient();
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
      time_text: String(item.time_text ?? '').trim(),
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

async function assertDateReadable(userId: string, workspaceId: string, dateId: string) {
  const membership = await requireWorkspaceAccess(userId, workspaceId);
  const supabase = getPrivilegedDataClient();
  const { data, error } = await supabase
    .from('dates')
    .select('*')
    .eq('id', dateId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(409, 'Dates schema is not ready yet.');
    }
    throw new ApiError(500, error.message);
  }

  if (!data) {
    throw new ApiError(404, 'Date not found.');
  }

  const status = normalizeStatus(data.status);
  if (membership.role === 'viewer' && status !== 'published') {
    throw new ApiError(404, 'Date not found.');
  }

  return { row: data, role: membership.role };
}

export async function listDatesScoped(input: {
  userId: string;
  workspaceId: string;
  projectId: string;
  tourId?: string | null;
  includeDrafts?: boolean;
}): Promise<DateRecord[]> {
  const membership = await requireWorkspaceAccess(input.userId, input.workspaceId);
  await ensureProjectInWorkspace(input.workspaceId, input.projectId);
  await ensureTourInScope(input.workspaceId, input.projectId, input.tourId);

  const supabase = getPrivilegedDataClient();
  let query = supabase
    .from('dates')
    .select('*')
    .eq('workspace_id', input.workspaceId)
    .eq('project_id', input.projectId)
    .order('date', { ascending: true })
    .order('created_at', { ascending: true });

  if (input.tourId) {
    query = query.eq('tour_id', input.tourId);
  }

  if (membership.role === 'viewer' || !input.includeDrafts) {
    query = query.eq('status', 'published');
  }

  const { data, error } = await query;
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

    if (!scheduleResult.error && scheduleResult.data) {
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

export async function getDateScoped(userId: string, workspaceId: string, dateId: string): Promise<DateRecord> {
  const { row } = await assertDateReadable(userId, workspaceId, dateId);
  const scheduleItems = await listScheduleItemsForDate(String(row.id));
  return normalizeDateRecord(row, scheduleItems);
}

export async function createDateScoped(userId: string, values: Partial<DateFormValues>): Promise<DateRecord> {
  const workspaceId = String(values.workspace_id ?? '');
  const projectId = String(values.project_id ?? '');
  await requireWorkspaceAccess(userId, workspaceId, ['owner', 'admin', 'editor']);
  requireDateValue(values.date);
  await ensureProjectInWorkspace(workspaceId, projectId);
  await ensureTourInScope(workspaceId, projectId, values.tour_id);

  const supabase = getPrivilegedDataClient();
  const payload = buildDatePayload(values, workspaceId, projectId);
  const { data, error } = await supabase.from('dates').insert(payload).select('*').single();
  if (error || !data) {
    if (isMissingRelationError(error)) {
      throw new ApiError(409, 'Dates schema is not ready yet.');
    }
    throw new ApiError(500, error?.message ?? 'Unable to create date.');
  }

  await replaceScheduleItems(String(data.id), workspaceId, projectId, values.schedule_items ?? []);
  return getDateScoped(userId, workspaceId, String(data.id));
}

export async function updateDateScoped(userId: string, workspaceId: string, dateId: string, values: Partial<DateFormValues>): Promise<DateRecord> {
  await requireWorkspaceAccess(userId, workspaceId, ['owner', 'admin', 'editor']);
  const current = await getDateScoped(userId, workspaceId, dateId);
  const projectId = String(values.project_id ?? current.project_id);
  requireDateValue(values.date ?? current.date);
  await ensureProjectInWorkspace(workspaceId, projectId);
  await ensureTourInScope(workspaceId, projectId, values.tour_id ?? current.tour_id);

  const supabase = getPrivilegedDataClient();
  const payload = buildDatePayload({ ...current, ...values, project_id: projectId, workspace_id: workspaceId }, workspaceId, projectId);
  const { data, error } = await supabase
    .from('dates')
    .update(payload)
    .eq('id', dateId)
    .eq('workspace_id', workspaceId)
    .select('*')
    .single();

  if (error || !data) {
    if (isMissingRelationError(error)) {
      throw new ApiError(409, 'Dates schema is not ready yet.');
    }
    throw new ApiError(500, error?.message ?? 'Unable to update date.');
  }

  await replaceScheduleItems(String(data.id), workspaceId, projectId, values.schedule_items ?? current.schedule_items);
  return getDateScoped(userId, workspaceId, dateId);
}

export async function deleteDateScoped(userId: string, workspaceId: string, dateId: string) {
  await requireWorkspaceAccess(userId, workspaceId, ['owner', 'admin']);
  const supabase = getPrivilegedDataClient();
  const { error } = await supabase.from('dates').delete().eq('id', dateId).eq('workspace_id', workspaceId);
  if (error) {
    if (isMissingRelationError(error)) {
      throw new ApiError(409, 'Dates schema is not ready yet.');
    }
    throw new ApiError(500, error.message);
  }
}

export async function canUserSeeDrafts(userId: string, workspaceId: string) {
  const access = await requireWorkspaceAccess(userId, workspaceId);
  return access.role !== 'viewer';
}

export async function getWorkspaceRoleForDateScope(userId: string, workspaceId: string): Promise<WorkspaceRole> {
  const access = await requireWorkspaceAccess(userId, workspaceId);
  return access.role;
}

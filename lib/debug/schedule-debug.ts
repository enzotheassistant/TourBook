// TEMP DEBUG: admin schedule save/reopen tracing
// Remove this file and the call sites tagged with `tourbook schedule debug` once the bug is diagnosed.

type ScheduleItemShape = {
  id?: unknown;
  label?: unknown;
  time?: unknown;
  time_text?: unknown;
  sort_order?: unknown;
};

type ScheduleDebugContext = {
  stage: 'editor-before-save' | 'api-payload' | 'server-save' | 'reopen-response' | 'reopen-hydration';
  action: string;
  dateId?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
  tourId?: string | null;
  status?: string | null;
  dayType?: string | null;
  count?: number;
  note?: string | null;
};

export function scheduleDebugRows(items: ScheduleItemShape[] | null | undefined) {
  return (items ?? []).map((item, index) => ({
    index,
    id: String(item?.id ?? ''),
    label: String(item?.label ?? '').trim(),
    time: String(item?.time_text ?? item?.time ?? '').trim(),
    sort_order: typeof item?.sort_order === 'number' ? item.sort_order : index,
  }));
}

export function scheduleDebugLog(context: ScheduleDebugContext, items: ScheduleItemShape[] | null | undefined) {
  const rows = scheduleDebugRows(items);
  const meta = [
    `stage=${context.stage}`,
    `action=${context.action}`,
    `dateId=${context.dateId ?? ''}`,
    `workspaceId=${context.workspaceId ?? ''}`,
    `projectId=${context.projectId ?? ''}`,
    `tourId=${context.tourId ?? ''}`,
    `status=${context.status ?? ''}`,
    `dayType=${context.dayType ?? ''}`,
    `count=${context.count ?? rows.length}`,
    context.note ? `note=${context.note}` : '',
  ].filter(Boolean).join(' ');

  console.log(`[tourbook/schedule-debug] ${meta}`);
  console.log('[tourbook/schedule-debug] rows=', rows);
}

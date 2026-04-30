import type { ScheduleItem } from '@/lib/types';

export function isVisibleScheduleItem(item: Pick<ScheduleItem, 'label' | 'time'>) {
  return Boolean(String(item.label ?? '').trim() || String(item.time ?? '').trim());
}

export function filterVisibleScheduleItems<T extends Pick<ScheduleItem, 'label' | 'time'>>(items: T[] | undefined) {
  return (items ?? []).filter((item) => isVisibleScheduleItem(item));
}

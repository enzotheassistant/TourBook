import type { ShowFormValues, TourDayType } from '@/lib/types';

export type TourDaySectionKey = 'basics' | 'venue' | 'parking' | 'schedule' | 'dos' | 'accommodation' | 'notes' | 'guestListNotes';

const DAY_TYPE_SECTIONS: Record<TourDayType, TourDaySectionKey[]> = {
  show: ['basics', 'venue', 'parking', 'schedule', 'dos', 'accommodation', 'notes', 'guestListNotes'],
  travel: ['basics', 'venue', 'parking', 'schedule', 'dos', 'accommodation', 'notes'],
  off: ['basics', 'venue', 'schedule', 'accommodation', 'notes'],
};

export function getRelevantSectionsForDayType(dayType: TourDayType) {
  return DAY_TYPE_SECTIONS[dayType] ?? DAY_TYPE_SECTIONS.show;
}

export function isSectionRelevantForDayType(section: TourDaySectionKey, dayType: TourDayType) {
  return getRelevantSectionsForDayType(dayType).includes(section);
}

export function sanitizeShowFormForDayType(form: ShowFormValues): ShowFormValues {
  if (form.day_type === 'show') return form;

  return {
    ...form,
    guest_list_notes: '',
    visibility: {
      ...form.visibility,
      show_guest_list_notes: false,
    },
  };
}

import { GuestListEntry, Show } from '@/lib/types';

export type SupabaseShowRow = Show;
export type SupabaseGuestListEntryRow = GuestListEntry;

// Next step:
// 1. Replace readShowsFromStorage() with a Supabase read.
// 2. Replace saveShowToStorage() with insert/update calls.
// 3. Replace guest list localStorage helpers with guest_list_entries table writes.
// 4. Add row-level security or move to proper user auth if you outgrow the shared password model.
export const supabaseIntegrationPlan = {
  showsTable: 'shows',
  guestListTable: 'guest_list_entries',
};

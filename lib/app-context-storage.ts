export const WORKSPACE_STORAGE_KEY = 'tourbook.activeWorkspaceId';
export const PROJECT_STORAGE_KEY = 'tourbook.activeProjectId';
export const TOUR_STORAGE_KEY = 'tourbook.activeTourId';

export function clearAppContextStorage() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  window.localStorage.removeItem(PROJECT_STORAGE_KEY);
  window.localStorage.removeItem(TOUR_STORAGE_KEY);
}

import type { WorkspaceRole } from '../types/tenant';
import { canCreateArtists, canCreateDates } from '../roles';

export type ActivationAction = {
  label: string;
  href: string;
  tone?: 'primary' | 'ghost';
  ctaId: string;
};

export function getCrewNoArtistsState(role: WorkspaceRole | null | undefined, hasAnyProject: boolean): {
  title: string;
  body: string;
  actions: ActivationAction[];
} {
  const canCreate = canCreateArtists(role);

  if (hasAnyProject) {
    return canCreate
      ? {
          title: 'No project is active for this workspace.',
          body: 'This workspace has projects, but none is selected in your current session. Open Admin, confirm workspace + project, then return here.',
          actions: [
            { label: 'Go to Admin', href: '/admin', tone: 'primary', ctaId: 'open_admin' },
            { label: 'View Past Dates', href: '/?tab=past', ctaId: 'view_past_dates' },
          ],
        }
      : {
          title: 'No project is active for this workspace.',
          body: 'This workspace has projects, but none are available in your current crew context yet. Ask an owner/admin/editor to check your access or publish dates.',
          actions: [{ label: 'View Past Dates', href: '/?tab=past', ctaId: 'view_past_dates' }],
        };
  }

  if (canCreate) {
    return {
      title: 'No projects found in this workspace.',
      body: 'To activate Crew dates, create the first project in Admin. This unlocks date creation and publishing.',
      actions: [{ label: 'Go to Admin', href: '/admin', tone: 'primary', ctaId: 'open_admin' }],
    };
  }

  return {
    title: 'No projects found in this workspace.',
    body: 'No projects are available in this workspace yet. Ask an owner/admin/editor to create the first project in Admin, then refresh this page.',
    actions: [{ label: 'View Past Dates', href: '/?tab=past', ctaId: 'view_past_dates' }],
  };
}

export function getCrewNoUpcomingDatesState(role: WorkspaceRole | null | undefined): {
  body: string;
  actions: ActivationAction[];
} {
  if (canCreateDates(role)) {
    return {
      body: 'No upcoming dates are published yet. Create the first date in Admin to activate this dashboard.',
      actions: [
        { label: 'Create First Date', href: '/admin', tone: 'primary', ctaId: 'create_first_date' },
        { label: 'Past Dates', href: '/?tab=past', ctaId: 'view_past_dates' },
      ],
    };
  }

  return {
    body: 'No upcoming dates are published for this project yet. Ask an owner/admin/editor to create and publish the first date.',
    actions: [{ label: 'Past Dates', href: '/?tab=past', ctaId: 'view_past_dates' }],
  };
}

export function getAdminNoArtistsGuardrail(role: WorkspaceRole | null | undefined) {
  if (canCreateArtists(role)) {
    return {
      emptyBody: 'Create your first project below, then continue to create the first date.',
      helperText: null,
      showCreateArtist: true,
    };
  }

  return {
    emptyBody: 'No projects exist in this workspace yet. Ask an owner/admin/editor to create the first project.',
    helperText: 'You have viewer access in this workspace. Project creation is restricted to owner/admin/editor roles.',
    showCreateArtist: false,
  };
}

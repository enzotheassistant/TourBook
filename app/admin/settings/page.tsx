import { Suspense } from 'react';
import { AppShell } from '@/components/app-shell';
import { AdminPageClient } from '@/components/admin-page-client';
import { ListSkeleton } from '@/components/skeleton';

export const dynamic = 'force-dynamic';

/** Settings: Projects, Workspace, and Your account (log out). */
export default function AdminSettingsPage() {
  return (
    <AppShell mode="admin" title="TourBook" showSubtitle={false}>
      <Suspense fallback={<ListSkeleton />}>
        <AdminPageClient key="settings" mode="projects" />
      </Suspense>
    </AppShell>
  );
}

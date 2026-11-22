import { Suspense } from 'react';
import { AppShell } from '@/components/app-shell';
import { AdminPageClient } from '@/components/admin-page-client';
import { ListSkeleton } from '@/components/skeleton';

export const dynamic = 'force-dynamic';

/** The new date form (opened from the "+ New date" button). */
export default function AdminNewDatePage() {
  return (
    <AppShell mode="admin" title="TourBook" showSubtitle={false}>
      <Suspense fallback={<ListSkeleton />}>
        <AdminPageClient key="new" />
      </Suspense>
    </AppShell>
  );
}

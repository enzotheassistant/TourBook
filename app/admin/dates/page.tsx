import { Suspense } from 'react';
import { AppShell } from '@/components/app-shell';
import { AdminPageClient } from '@/components/admin-page-client';
import { ListSkeleton } from '@/components/skeleton';

export const dynamic = 'force-dynamic';

export default function AdminDatesPage() {
  return (
    <AppShell mode="admin" title="TourBook" showSubtitle={false}>
      <Suspense fallback={<ListSkeleton />}>
        <AdminPageClient key="dates" mode="dates" />
      </Suspense>
    </AppShell>
  );
}

import { Suspense } from 'react';
import { AppShell } from '@/components/app-shell';
import { AdminPageClient } from '@/components/admin-page-client';

export const dynamic = 'force-dynamic';

export default function AdminPage() {
  return (
    <AppShell mode="admin" title="TourBook" showSubtitle={false} adminSection="new">
      <Suspense fallback={null}>
        <AdminPageClient />
      </Suspense>
    </AppShell>
  );
}

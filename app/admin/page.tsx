import { Suspense } from 'react';
import { AppShell } from '@/components/app-shell';
import { AdminPageClient } from '@/components/admin-page-client';

export const dynamic = 'force-dynamic';

export default function AdminPage() {
  return (
    <AppShell mode="admin" title="TourBook" subtitle="Touring crew dashboard">
      <Suspense fallback={null}>
        <AdminPageClient />
      </Suspense>
    </AppShell>
  );
}

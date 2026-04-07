import { Suspense } from 'react';
import { AppShell } from '@/components/app-shell';
import { AdminPageClient } from '@/components/admin-page-client';

export const dynamic = 'force-dynamic';

export default function AdminPage() {
  return (
    <AppShell mode="admin" title="New Date" subtitle="Create and manage tour dates">
      <Suspense fallback={null}>
        <AdminPageClient />
      </Suspense>
    </AppShell>
  );
}

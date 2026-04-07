import { Suspense } from 'react';
import { AppShell } from '@/components/app-shell';
import { AdminPageClient } from '@/components/admin-page-client';

export const dynamic = 'force-dynamic';

export default function AdminDatesPage() {
  return (
    <AppShell mode="admin" title="Existing Dates" subtitle="Filter, edit, duplicate, and export">
      <Suspense fallback={null}>
        <AdminPageClient mode="dates" />
      </Suspense>
    </AppShell>
  );
}

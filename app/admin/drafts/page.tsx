import { Suspense } from 'react';
import { AppShell } from '@/components/app-shell';
import { AdminPageClient } from '@/components/admin-page-client';

export const dynamic = 'force-dynamic';

export default function AdminDraftsPage() {
  return (
    <AppShell mode="admin" title="TourBook" showSubtitle={false}>
      <Suspense fallback={null}>
        <AdminPageClient key="drafts" mode="drafts" />
      </Suspense>
    </AppShell>
  );
}

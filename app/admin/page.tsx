import { Suspense } from 'react';
import { AppShell } from '@/components/app-shell';
import { AdminPageClient } from '@/components/admin-page-client';

export const dynamic = 'force-dynamic';

export default function AdminPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <AdminPageClient />
      </Suspense>
    </AppShell>
  );
}

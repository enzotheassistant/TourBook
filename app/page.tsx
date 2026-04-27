import { Suspense } from 'react';
import { AppShell } from '@/components/app-shell';
import { DashboardClient } from '@/components/dashboard-client';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const activeTab = params?.tab === 'past' ? 'past' : 'upcoming';

  return (
    <AppShell activeTab={activeTab}>
      <Suspense fallback={null}>
        <DashboardClient />
      </Suspense>
    </AppShell>
  );
}

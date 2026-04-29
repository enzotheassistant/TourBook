import { Suspense } from 'react';
import { AppShell } from '@/components/app-shell';
import { DashboardClient } from '@/components/dashboard-client';

// Revalidate every 60 seconds instead of force-dynamic
// This allows browsers to cache the shell, reducing first-click lag while keeping data reasonably fresh
// Auth is handled client-side, so stale shells are safe; actual show data loads live in DashboardClient
export const revalidate = 60;

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

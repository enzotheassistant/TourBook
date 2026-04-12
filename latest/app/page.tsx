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
      <Suspense
        fallback={
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
            Loading dates...
          </div>
        }
      >
        <DashboardClient />
      </Suspense>
    </AppShell>
  );
}

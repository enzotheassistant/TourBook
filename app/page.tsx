import { Suspense } from 'react';
import { AppShell } from '@/components/app-shell';
import { DashboardClient } from '@/components/dashboard-client';

export default function DashboardPage() {
  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
            Loading shows...
          </div>
        }
      >
        <DashboardClient />
      </Suspense>
    </AppShell>
  );
}
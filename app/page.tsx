import { AppShell } from '@/components/app-shell';
import { DashboardClient } from '@/components/dashboard-client';

export default function DashboardPage() {
  return (
    <AppShell>
      <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm uppercase tracking-wide text-zinc-400">Dashboard</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Upcoming shows</h1>
        <p className="mt-2 text-sm text-zinc-300">
          Tap any show to open venue info, DOS contact, schedule, hotel details, and guest list.
        </p>
      </section>

      <DashboardClient />
    </AppShell>
  );
}

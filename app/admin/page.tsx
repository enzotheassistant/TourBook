import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { AdminPageClient } from '@/components/admin-page-client';
import { ListSkeleton } from '@/components/skeleton';

export const dynamic = 'force-dynamic';

/**
 * /admin opens on the Dates list. Links that open the editor (?edit=… or
 * ?duplicate=…, used by the date lists and older bookmarks) still load the
 * editor here.
 */
export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (!params.edit && !params.duplicate) {
    redirect('/admin/dates');
  }

  return (
    <AppShell mode="admin" title="TourBook" showSubtitle={false}>
      <Suspense fallback={<ListSkeleton />}>
        <AdminPageClient key="new" />
      </Suspense>
    </AppShell>
  );
}

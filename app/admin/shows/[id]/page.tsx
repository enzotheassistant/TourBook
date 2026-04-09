import { AppShell } from '@/components/app-shell';
import { ShowPageClient } from '@/components/show-page-client';

export default async function AdminShowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <AppShell mode="admin" title="TourBook" showSubtitle={false} adminSection="dates">
      <ShowPageClient showId={id} adminMode />
    </AppShell>
  );
}

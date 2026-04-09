import { AppShell } from '@/components/app-shell';
import { ShowPageClient } from '@/components/show-page-client';

export default async function ShowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <AppShell>
      <ShowPageClient showId={id} />
    </AppShell>
  );
}

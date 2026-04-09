import { ShowPageClient } from '@/components/show-page-client';

export default async function ShowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 bg-zinc-950 px-4 py-4 text-zinc-50 sm:px-6">
      <ShowPageClient showId={id} />
    </main>
  );
}

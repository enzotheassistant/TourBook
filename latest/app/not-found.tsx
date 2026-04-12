import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center">
        <p className="text-sm uppercase tracking-wide text-zinc-400">TourBook</p>
        <h1 className="mt-2 text-2xl font-semibold">Show not found</h1>
        <p className="mt-2 text-sm text-zinc-300">That show does not exist in the current local dataset.</p>
        <Link href="/" className="mt-4 inline-flex rounded-2xl bg-white px-4 py-3 text-sm font-medium text-zinc-900">
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}

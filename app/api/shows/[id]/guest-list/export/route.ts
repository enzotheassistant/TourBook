import { requireApiAuth } from '@/lib/auth';
import { listGuestListEntriesServer } from '@/lib/server-store';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResponse = await requireApiAuth();
  if (authResponse) return authResponse;

  const { id } = await params;
  const entries = await listGuestListEntriesServer(id);
  const csv = ['name,created_at', ...entries.map((entry) => `"${entry.name.replace(/"/g, '""')}","${entry.created_at}"`)].join('
');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${id}-guest-list.csv"`,
    },
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { applySessionCookies, requireApiAuth } from '@/lib/auth';
import { listGuestListEntriesServer } from '@/lib/server-store';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const { id } = await params;
  const entries = await listGuestListEntriesServer(id);
  const csv = ['name,created_at', ...entries.map((entry) => `"${entry.name.replace(/"/g, '""')}","${entry.created_at}"`)].join('\n');

  const response = new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${id}-guest-list.csv"`,
    },
  });

  return authState.refreshedSession ? applySessionCookies(response, authState.refreshedSession) : response;
}

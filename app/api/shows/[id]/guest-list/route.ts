import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { addGuestListEntriesServer, listGuestListEntriesServer } from '@/lib/server-store';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const { id } = await params;
  const entries = await listGuestListEntriesServer(id);
  return finalizeAuthResponse(NextResponse.json(entries), authState);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const { id } = await params;
  const body = (await request.json()) as { names?: string[] };
  const names = (body.names ?? []).map((name) => name.trim()).filter(Boolean);

  if (names.length === 0) {
    return finalizeAuthResponse(NextResponse.json({ error: 'At least one guest name is required.' }, { status: 400 }), authState);
  }

  const entries = await addGuestListEntriesServer(id, names);
  return finalizeAuthResponse(NextResponse.json(entries), authState);
}

import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { addGuestListEntriesServer, listGuestListEntriesServer } from '@/lib/server-store';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResponse = await requireApiAuth();
  if (authResponse) return authResponse;

  const { id } = await params;
  const entries = await listGuestListEntriesServer(id);
  return NextResponse.json(entries);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResponse = await requireApiAuth();
  if (authResponse) return authResponse;

  const { id } = await params;
  const body = (await request.json()) as { names?: string[] };
  const names = (body.names ?? []).map((name) => name.trim()).filter(Boolean);

  if (names.length === 0) {
    return NextResponse.json({ error: 'At least one guest name is required.' }, { status: 400 });
  }

  const entries = await addGuestListEntriesServer(id, names);
  return NextResponse.json(entries);
}

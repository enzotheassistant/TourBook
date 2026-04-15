import { NextRequest, NextResponse } from 'next/server';
import { finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError } from '@/lib/data/server/shared';
import { createProjectScoped, listProjectsScoped } from '@/lib/data/server/projects';

export async function GET(request: NextRequest) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';

  try {
    const projects = await listProjectsScoped(authState.supabase, authState.user.id, workspaceId);
    return finalizeAuthResponse(NextResponse.json(projects), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to load projects.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}

export async function POST(request: NextRequest) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  try {
    const body = (await request.json()) as { workspaceId?: string; name?: string; slug?: string | null };
    const created = await createProjectScoped(authState.supabase, authState.user.id, {
      workspaceId: body.workspaceId ?? '',
      name: body.name ?? '',
      slug: body.slug ?? null,
    });
    return finalizeAuthResponse(NextResponse.json(created, { status: 201 }), authState);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to create artist.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}

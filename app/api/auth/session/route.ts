import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { clearSessionCookies, finalizeAuthResponse } from '@/lib/auth';

type Body = {
  accessToken?: string;
  refreshToken?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body;
    const accessToken = body.accessToken?.trim();
    const refreshToken = body.refreshToken?.trim();

    if (!accessToken || !refreshToken) {
      return NextResponse.json({ error: 'Missing tokens.' }, { status: 400 });
    }

    const response = NextResponse.json({ ok: true });
    const supabase = createRouteHandlerSupabaseClient(request, response);
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      return NextResponse.json({ error: 'Unable to sync session.' }, { status: 401 });
    }

    return finalizeAuthResponse(response);
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
}

// DELETE — called on logout to clear server-side session cookies.
export async function DELETE(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response);
  return response;
}

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
      console.info('[TourBook Session] POST /api/auth/session — missing tokens');
      return NextResponse.json({ error: 'Missing tokens.' }, { status: 400 });
    }

    const response = NextResponse.json({ ok: true });
    const supabase = createRouteHandlerSupabaseClient(request, response);
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      console.info('[TourBook Session] POST /api/auth/session — setSession failed', {
        errorType: error.name,
        message: error.message?.substring(0, 100),
      });
      return NextResponse.json({ error: 'Unable to sync session.' }, { status: 401 });
    }

    console.info('[TourBook Session] POST /api/auth/session — session set successfully');
    return finalizeAuthResponse(response);
  } catch (err) {
    const errorType = err instanceof Error ? err.name : 'unknown';
    console.info('[TourBook Session] POST /api/auth/session — exception', {
      errorType,
      message: err instanceof Error ? err.message?.substring(0, 100) : String(err),
    });
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
}

// DELETE — called on logout to clear server-side session cookies.
export async function DELETE(request: NextRequest) {
  const response = NextResponse.json({ ok: true });

  try {
    const supabase = createRouteHandlerSupabaseClient(request, response);
    await supabase.auth.signOut();
    console.info('[TourBook Session] DELETE /api/auth/session — signOut succeeded');
  } catch (err) {
    const errorType = err instanceof Error ? err.name : 'unknown';
    console.info('[TourBook Session] DELETE /api/auth/session — signOut failed', {
      errorType,
      message: err instanceof Error ? err.message?.substring(0, 100) : String(err),
    });
    return NextResponse.json({ error: 'Unable to clear server session.' }, { status: 500 });
  }

  clearSessionCookies(request, response);
  console.info('[TourBook Session] DELETE /api/auth/session — cookies cleared');
  return finalizeAuthResponse(response);
}

import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookies, finalizeAuthResponse, requireApiAuth } from '@/lib/auth';
import { ApiError } from '@/lib/data/server/shared';
import { EMAIL_COOKIE } from '@/lib/supabase/constants';
import { deleteOwnAccount } from '@/lib/data/server/account-deletion';
import { sendAccountDeletedEmailBestEffort } from '@/lib/invites/email-delivery';

/** Delete your own account: body { password, confirm: "DELETE" }. */
export async function DELETE(request: NextRequest) {
  const authState = await requireApiAuth(request);
  if (authState instanceof NextResponse) return authState;

  try {
    const body = (await request.json().catch(() => ({}))) as { password?: string; confirm?: string };
    const email = authState.user.email ?? '';
    await deleteOwnAccount({
      userId: authState.user.id,
      email,
      password: body.password ?? '',
      confirm: body.confirm ?? '',
    });
    await sendAccountDeletedEmailBestEffort({ email });
    const response = NextResponse.json({ deleted: true });
    clearSessionCookies(request, response);
    // Don't keep the deleted account's email for the sign-in form.
    response.cookies.set(EMAIL_COOKIE, '', { maxAge: 0, path: '/' });
    return response;
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to delete your account.';
    return finalizeAuthResponse(NextResponse.json({ error: message }, { status }), authState);
  }
}

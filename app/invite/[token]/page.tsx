import { redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/auth';
import { buildInviteContinuationHref } from '@/lib/invites/login-redirect';

export default async function InviteTokenLandingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inviteToken = String(token || '').trim();

  if (!inviteToken) {
    redirect('/');
  }

  const user = await getAuthenticatedUser();
  redirect(user ? buildInviteContinuationHref(inviteToken) : `/login?inviteToken=${encodeURIComponent(inviteToken)}`);
}

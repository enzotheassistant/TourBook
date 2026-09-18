import { redirect } from 'next/navigation';
import { InviteTokenBootstrapClient } from './page-client';

export default async function InviteTokenLandingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inviteToken = String(token || '').trim();

  if (!inviteToken) {
    redirect('/');
  }

  // Deliberately not resolved server-side: a signup/invite email
  // confirmation link carries its session only in the URL's hash fragment,
  // which the server never sees. InviteTokenBootstrapClient exchanges that
  // for a real session client-side before deciding where to send the user.
  return <InviteTokenBootstrapClient token={inviteToken} />;
}

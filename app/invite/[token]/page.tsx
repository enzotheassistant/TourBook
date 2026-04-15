import { redirect } from 'next/navigation';

export default async function InviteTokenLandingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inviteToken = String(token || '').trim();

  if (!inviteToken) {
    redirect('/');
  }

  redirect(`/?inviteToken=${encodeURIComponent(inviteToken)}`);
}

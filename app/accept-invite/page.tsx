import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { InviteContinuationClient } from './page-client';

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string; inviteToken?: string }>;
}) {
  const params = await searchParams;
  const token = String(params?.token ?? params?.inviteToken ?? '').trim();

  if (!token) {
    redirect('/');
  }

  return (
    <Suspense fallback={null}>
      <InviteContinuationClient token={token} />
    </Suspense>
  );
}

import { AppShell } from '@/components/app-shell';
import { AccountPageClient } from '@/components/account-page-client';

export const dynamic = 'force-dynamic';

/** Account: who you're signed in as, log out, delete account. */
export default function AccountPage() {
  return (
    <AppShell>
      <AccountPageClient />
    </AppShell>
  );
}

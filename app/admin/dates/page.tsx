import { AppShell } from '@/components/app-shell';
import { AdminPageClient } from '@/components/admin-page-client';

export default function AdminDatesPage() {
  return (
    <AppShell>
      <AdminPageClient mode="dates" />
    </AppShell>
  );
}

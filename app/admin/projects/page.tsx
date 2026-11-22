import { redirect } from 'next/navigation';

/** Projects now live under Settings. Old links/bookmarks forward there. */
export default function AdminProjectsPage() {
  redirect('/admin/settings');
}

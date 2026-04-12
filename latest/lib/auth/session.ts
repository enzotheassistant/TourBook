import { getAuthenticatedUser } from '@/lib/auth';

export async function requireUser() {
  return getAuthenticatedUser();
}

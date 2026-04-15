import { createClient } from '@supabase/supabase-js';

function getEnv(name, fallback) {
  const value = process.env[name] ?? (fallback ? process.env[fallback] : undefined);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

const url = getEnv('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

if (!url || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const nowIso = new Date().toISOString();

const { data, error } = await supabase
  .from('workspace_invites')
  .update({ status: 'expired' })
  .eq('status', 'pending')
  .lt('expires_at', nowIso)
  .select('id');

if (error) {
  console.error('Invite expiry maintenance failed:', error.message);
  process.exit(1);
}

console.log('# Invite Expiry Maintenance');
console.log(`- Run at: ${nowIso}`);
console.log(`- Expired invites updated: ${data?.length ?? 0}`);
console.log('- Safe to rerun: yes (idempotent via status=pending filter)');

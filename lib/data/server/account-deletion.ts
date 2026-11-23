import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ApiError, requireScopedDataClient } from '@/lib/data/server/shared';
import { ATTACHMENTS_BUCKET } from '@/lib/data/server/attachments';
import { createServiceRoleSupabaseClient, getServerSupabaseConfig } from '@/lib/supabase/server';
import {
  accountDeletionBlocker,
  isAccountDeleteConfirmed,
  passwordCheckMessage,
  workspaceNameMatches,
} from '@/lib/account/deletion-rules';

/**
 * Check the person's password without touching their real sign-in: sign in on
 * a throwaway connection, then end that extra session straight away.
 */
export async function verifyPasswordForUser(email: string, password: string) {
  if (!email) throw new ApiError(400, "We couldn't confirm your account. Sign out and back in, then try again.");
  if (!password) throw new ApiError(400, 'Enter your password.');

  const { url, anonKey } = getServerSupabaseConfig();
  const checker = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await checker.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    const message = passwordCheckMessage(error?.message ?? '');
    throw new ApiError(message.includes('wait') ? 429 : 400, message);
  }
  // Only this throwaway session — the person stays signed in everywhere else.
  await checker.auth.signOut({ scope: 'local' }).catch(() => undefined);
}

async function listOwnedWorkspaceNames(service: SupabaseClient, userId: string) {
  const [{ data: owned, error: ownedError }, { data: ownerRows, error: memberError }] = await Promise.all([
    service.from('workspaces').select('id, name').eq('owner_user_id', userId),
    service.from('workspace_members').select('workspace_id').eq('user_id', userId).eq('role', 'owner'),
  ]);
  if (ownedError) throw new ApiError(500, ownedError.message);
  if (memberError) throw new ApiError(500, memberError.message);

  const names = new Map<string, string>();
  for (const row of owned ?? []) names.set(String(row.id), String(row.name ?? 'your workspace'));
  const missing = (ownerRows ?? []).map((row) => String(row.workspace_id)).filter((id) => !names.has(id));
  if (missing.length) {
    const { data: extra, error } = await service.from('workspaces').select('id, name').in('id', missing);
    if (error) throw new ApiError(500, error.message);
    for (const row of extra ?? []) names.set(String(row.id), String(row.name ?? 'your workspace'));
  }
  return [...names.values()];
}

/**
 * Delete the signed-in person's account. Their access to every band goes
 * with it; day sheets and guest names they added stay with the band (the
 * database forgets who added them on its own).
 */
export async function deleteOwnAccount(input: { userId: string; email: string; password: string; confirm: string }) {
  if (!isAccountDeleteConfirmed(input.confirm)) throw new ApiError(400, 'Type DELETE to confirm.');

  const service = createServiceRoleSupabaseClient() as unknown as SupabaseClient;
  const blocker = accountDeletionBlocker(await listOwnedWorkspaceNames(service, input.userId));
  if (blocker) throw new ApiError(409, blocker);

  await verifyPasswordForUser(input.email, input.password);

  // Band access first (their per-band levels go with these rows)…
  const { error: memberError } = await service.from('workspace_members').delete().eq('user_id', input.userId);
  if (memberError) throw new ApiError(500, memberError.message);

  // …then the login itself (this also ends every session).
  const { error: deleteError } = await service.auth.admin.deleteUser(input.userId);
  if (deleteError) throw new ApiError(500, "Couldn't delete your account. Please try again.");
}

/**
 * Delete a workspace the person owns, and everything in it: projects, tours,
 * day sheets, guest lists, files and invites. Team members simply lose access
 * (no email). Needs the workspace name typed and the owner's password.
 */
export async function deleteOwnedWorkspace(
  supabaseInput: SupabaseClient,
  input: { userId: string; email: string; workspaceId: string; confirmName: string; password: string },
) {
  const supabase = requireScopedDataClient(supabaseInput);
  const workspaceId = String(input.workspaceId ?? '').trim();
  if (!workspaceId) throw new ApiError(400, 'workspaceId is required.');

  const { data: workspace, error: readError } = await supabase
    .from('workspaces')
    .select('id, name')
    .eq('id', workspaceId)
    .eq('owner_user_id', input.userId)
    .maybeSingle();
  if (readError) throw new ApiError(500, readError.message);
  if (!workspace) throw new ApiError(403, 'Only the workspace owner can delete it.');

  if (!workspaceNameMatches(input.confirmName, String(workspace.name ?? ''))) {
    throw new ApiError(400, 'Type the workspace name exactly as it appears.');
  }

  await verifyPasswordForUser(input.email, input.password);

  // Note the stored files before their records disappear.
  const service = createServiceRoleSupabaseClient() as unknown as SupabaseClient;
  const { data: files } = await service
    .from('date_attachments')
    .select('storage_path, thumbnail_path')
    .eq('workspace_id', workspaceId);
  const paths = (files ?? [])
    .flatMap((row) => [row.storage_path, row.thumbnail_path])
    .filter((path): path is string => typeof path === 'string' && path.length > 0);

  // The owner's own permission deletes it; everything inside goes with it.
  const { data: deleted, error: deleteError } = await supabase
    .from('workspaces')
    .delete()
    .eq('id', workspaceId)
    .eq('owner_user_id', input.userId)
    .select('id');
  if (deleteError) throw new ApiError(500, "Couldn't delete the workspace. Nothing was removed. Please try again.");
  if (!deleted?.length) throw new ApiError(403, 'Only the workspace owner can delete it.');

  // Tidy the stored files (best effort — the records are already gone).
  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await service.storage.from(ATTACHMENTS_BUCKET).remove(paths.slice(index, index + 100));
    if (error) console.warn('[workspace-delete] file cleanup failed', { workspaceId, message: error.message });
  }

  return { id: workspaceId, name: String(workspace.name ?? '') };
}

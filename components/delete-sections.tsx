'use client';

import { FormEvent, useState } from 'react';
import { deleteMyAccount, deleteWorkspace } from '@/lib/data-client';
import { accountDeletionBlocker, isAccountDeleteConfirmed, workspaceNameMatches } from '@/lib/account/deletion-rules';
import { clearAppContextStorage } from '@/lib/app-context-storage';
import { clearOfflineCache } from '@/lib/offline-cache';
import {
  clearBackupRefreshToken,
  clearBackupRememberedEmail,
  clearServerSession,
  getBrowserSupabaseClient,
} from '@/lib/supabase/client';
import type { WorkspaceSummary } from '@/lib/types/tenant';

const INPUT = 'h-11 w-full rounded-[10px] border border-white/10 bg-black/20 px-4 text-sm text-zinc-100 outline-none focus:border-accent/40';
const SECONDARY = 'inline-flex h-11 items-center justify-center rounded-[10px] border border-white/10 bg-transparent px-4 text-sm font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.05]';
const DANGER_OUTLINE = 'inline-flex h-11 items-center justify-center rounded-[10px] border border-red-500/35 bg-transparent px-4 text-sm font-medium text-red-200 transition hover:border-red-400/40 hover:bg-red-500/10';
const DANGER_SOLID = 'inline-flex h-11 items-center justify-center rounded-[10px] bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50';

function PasswordField({ id, value, onChange, disabled }: { id: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium text-zinc-200">Your password</label>
        <button type="button" onClick={() => setShow((current) => !current)} className="text-xs text-zinc-400 transition hover:text-zinc-100" aria-pressed={show}>
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      <input
        id={id}
        type={show ? 'text' : 'password'}
        autoComplete="current-password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className={`mt-2 ${INPUT}`}
      />
    </div>
  );
}

/**
 * "Delete account". Owners see why they can't yet (delete the workspace
 * first). Everyone else confirms with their password and the word DELETE.
 */
export function DeleteAccountSection({ userId, workspaces }: { userId: string | null | undefined; workspaces: WorkspaceSummary[] }) {
  const ownedNames = workspaces.filter((workspace) => userId && workspace.ownerUserId === userId).map((workspace) => workspace.name || workspace.slug);
  const blocker = accountDeletionBlocker(ownedNames);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ready = password.length > 0 && isAccountDeleteConfirmed(confirm);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      await deleteMyAccount({ password, confirm });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete your account. Please try again.");
      setBusy(false);
      return;
    }
    // The account is gone: clear everything this device kept, then leave.
    try {
      clearAppContextStorage();
      clearOfflineCache();
      clearBackupRefreshToken();
      clearBackupRememberedEmail();
      window.localStorage.removeItem('tourbook_last_email');
      window.sessionStorage.removeItem('tourbook_last_email');
      await clearServerSession().catch(() => undefined);
      await getBrowserSupabaseClient().auth.signOut({ scope: 'local' }).catch(() => undefined);
    } finally {
      window.location.replace('/login?account=deleted');
    }
  }

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.045] p-4 sm:p-5">
      {!open ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base text-zinc-100">Delete account</p>
            <p className="mt-1 text-sm text-zinc-500">{blocker ?? 'Permanently remove your login and your access to every band.'}</p>
          </div>
          {!blocker ? (
            <button type="button" onClick={() => setOpen(true)} className={DANGER_OUTLINE}>Delete account</button>
          ) : null}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <p className="text-base font-medium text-zinc-100">Delete your account?</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-400">
              <li>Your login is deleted and you lose access to every band right away.</li>
              <li>Day sheets and guest names you added stay with the band.</li>
              <li>This can&apos;t be undone. To come back, you&apos;d need a new invite.</li>
            </ul>
          </div>
          <PasswordField id="delete-account-password" value={password} onChange={setPassword} disabled={busy} />
          <div>
            <label htmlFor="delete-account-confirm" className="text-sm font-medium text-zinc-200">Type DELETE to confirm</label>
            <input
              id="delete-account-confirm"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              disabled={busy}
              autoComplete="off"
              autoCapitalize="characters"
              className={`mt-2 ${INPUT}`}
            />
          </div>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setPassword('');
                setConfirm('');
                setError('');
              }}
              disabled={busy}
              className={SECONDARY}
            >
              Cancel
            </button>
            <button type="submit" disabled={!ready || busy} className={DANGER_SOLID}>
              {busy ? 'Deleting…' : 'Delete my account'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/**
 * "Delete workspace" (owner only). Confirms with the workspace name and the
 * owner's password. Team members aren't emailed; they just lose access.
 */
export function DeleteWorkspaceSection({ workspace }: { workspace: WorkspaceSummary }) {
  const workspaceName = workspace.name || workspace.slug;
  const [open, setOpen] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ready = password.length > 0 && workspaceNameMatches(typedName, workspaceName);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      await deleteWorkspace({ workspaceId: workspace.id, confirmName: typedName, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete the workspace. Please try again.");
      setBusy(false);
      return;
    }
    // Forget the deleted workspace on this device, then reload fresh.
    clearAppContextStorage();
    clearOfflineCache();
    window.location.replace('/');
  }

  if (!open) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.045] p-4 sm:p-5">
        <div className="min-w-0">
          <p className="text-base text-zinc-100">Delete workspace</p>
          <p className="mt-1 text-sm text-zinc-500">Permanently delete {workspaceName} and everything in it.</p>
        </div>
        <button type="button" onClick={() => setOpen(true)} className={DANGER_OUTLINE}>Delete workspace</button>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-red-500/30 bg-red-500/[0.06] p-4 sm:p-5">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className="text-base font-medium text-zinc-100">Delete {workspaceName}?</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-300">
            <li>Every project, tour, day sheet, guest list and file in it is deleted.</li>
            <li>Everyone on the team loses access right away. They won&apos;t get an email.</li>
            <li>Waiting invites stop working.</li>
            <li>This can&apos;t be undone.</li>
          </ul>
        </div>
        <div>
          <label htmlFor="delete-workspace-name" className="text-sm font-medium text-zinc-200">
            Type <span className="font-semibold text-zinc-50">{workspaceName}</span> to confirm
          </label>
          <input
            id="delete-workspace-name"
            value={typedName}
            onChange={(event) => setTypedName(event.target.value)}
            disabled={busy}
            autoComplete="off"
            className={`mt-2 ${INPUT}`}
          />
        </div>
        <PasswordField id="delete-workspace-password" value={password} onChange={setPassword} disabled={busy} />
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setTypedName('');
              setPassword('');
              setError('');
            }}
            disabled={busy}
            className={SECONDARY}
          >
            Cancel
          </button>
          <button type="submit" disabled={!ready || busy} className={DANGER_SOLID}>
            {busy ? 'Deleting…' : 'Delete workspace'}
          </button>
        </div>
      </form>
    </section>
  );
}

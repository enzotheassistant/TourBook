alter table if exists public.workspace_invites
  add column if not exists invitee_name text;

comment on column public.workspace_invites.invitee_name is 'Optional human-friendly name entered when inviting a teammate.';

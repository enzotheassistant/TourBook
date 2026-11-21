-- Migration: Optional custom display name for attachments
-- Admins can give an attachment a friendlier name ("Stage plot") than its
-- original file name ("SP_v3_final.pdf"). Nullable: when empty, the app shows
-- the original file name without its extension.
--
-- Until now date_attachments had no UPDATE policy at all (rows were only ever
-- inserted or deleted). This adds one for owners/admins/editors, matching the
-- existing insert/delete policies, and restricts what `authenticated` may
-- update to the display_name column only, so renaming can never be used to
-- change a row's storage path, date, workspace or anything else.

begin;

alter table if exists public.date_attachments
  add column if not exists display_name text;

alter table public.date_attachments
  drop constraint if exists date_attachments_display_name_length;
alter table public.date_attachments
  add constraint date_attachments_display_name_length
  check (display_name is null or char_length(display_name) <= 120);

revoke update on public.date_attachments from authenticated, anon;
grant update (display_name) on public.date_attachments to authenticated;

drop policy if exists "date_attachments_editor_update" on public.date_attachments;
create policy "date_attachments_editor_update"
on public.date_attachments
for update
using (
  exists (
    select 1
    from public.dates d
    where d.id = date_attachments.date_id
      and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = d.workspace_id
          and wm.user_id = auth.uid()
          and wm.role in ('owner', 'admin', 'editor')
      )
  )
)
with check (
  exists (
    select 1
    from public.dates d
    where d.id = date_attachments.date_id
      and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = d.workspace_id
          and wm.user_id = auth.uid()
          and wm.role in ('owner', 'admin', 'editor')
      )
  )
);

commit;

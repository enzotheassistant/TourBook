-- Migration: Tighten who can read attachment files in Storage
--
-- Previously any member of a workspace could read every file in that
-- workspace's attachments folder (if they knew the exact path), regardless of
-- tour scope or whether the date was still a draft.
--
-- Now a file is readable by:
--   - owners/admins/editors of the workspace (they manage uploads, and the
--     upload flow needs to confirm files landed before a record exists), or
--   - anyone who can see the matching date_attachments record. That table's
--     own RLS applies inside this check, so crew get exactly the same rules as
--     the rest of TourBook: assigned project/tour only, published dates only.

begin;

create index if not exists idx_date_attachments_thumbnail_path
  on public.date_attachments (thumbnail_path);

drop policy if exists "date_attachments_storage_read" on storage.objects;
create policy "date_attachments_storage_read"
on storage.objects
for select
using (
  bucket_id = 'date-attachments'
  and (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = (storage.foldername(objects.name))[1]::uuid
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin', 'editor')
    )
    or exists (
      select 1 from public.date_attachments a
      where a.storage_path = objects.name
         or a.thumbnail_path = objects.name
    )
  )
);

commit;

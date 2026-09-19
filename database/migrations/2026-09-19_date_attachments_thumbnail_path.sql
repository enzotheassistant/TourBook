-- Migration: Add thumbnail_path to date_attachments
-- Image attachments get a small server-generated thumbnail (see
-- lib/data/server/attachments.ts) stored alongside the original in the same
-- bucket, so the Attachments grid never has to load a full-size photo just
-- to render a preview tile. Nullable: non-image attachments (PDFs, docs)
-- and any image whose thumbnail generation failed simply have no thumbnail,
-- and the app falls back to the original file / a generic file icon.

begin;

alter table if exists public.date_attachments
  add column if not exists thumbnail_path text;

commit;

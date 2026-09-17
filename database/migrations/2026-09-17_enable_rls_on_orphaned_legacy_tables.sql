-- Security advisor (ERROR level) flagged that public.shows and
-- public.legacy_show_date_map had RLS disabled with full anon/authenticated
-- grants still in place -- anyone holding the public anon key could
-- read/write/delete these tables directly via PostgREST.
--
-- Both tables are pre-multi-tenant leftovers superseded by public.dates.
-- Verified before applying: zero references to either table anywhere in the
-- application code (app/, lib/, components/) -- /api/shows/route.ts fully
-- delegates to listDatesScoped/createDateScoped against public.dates.
-- Enabling RLS with no policies makes them correctly deny-by-default; this
-- has no effect on any current app behavior or member access.
alter table public.shows enable row level security;
alter table public.legacy_show_date_map enable row level security;

-- Also flagged: tourbook_set_updated_at (the shared updated_at trigger used
-- by public.dates and public.workspace_invites) had a mutable search_path.
-- The function only assigns new.updated_at = now(), and now() is a
-- Postgres built-in resolved via pg_catalog regardless of search_path, so
-- this does not change its behavior for either table's triggers.
alter function public.tourbook_set_updated_at() set search_path = '';

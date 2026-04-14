-- Ensure guest_list_entries.id auto-generates for inserts

begin;

create extension if not exists pgcrypto;

alter table if exists public.guest_list_entries
  alter column id set default gen_random_uuid()::text;

commit;

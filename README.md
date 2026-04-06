# TourBook v3

Mobile-first Next.js day-sheet and guest-list app for a touring band.

## What changed in v3

- secure data flow through Next.js Route Handlers
- shared crew password still lives at the app layer via `APP_PASSWORD`
- Supabase is now server-side only for shows and guest lists
- upcoming/past tabs with sticky year headers on Past
- Day Sheet / Guest List tabs on each show
- dynamic schedule rows with editable labels and times
- guest list edit + delete + multiline paste support
- guest list notes with show/hide toggle
- admin delete show
- address autocomplete hooks for venue and hotel

## Required environment variables

```bash
APP_PASSWORD=your-shared-crew-password
SUPABASE_URL=your-supabase-project-url
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=optional-for-address-autocomplete
```

### Important

- `APP_PASSWORD` is the shared crew password used by `/login`.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only. Do **not** expose it in the browser.
- `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` is optional. Without it, manual address entry still works.

## Local run

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000/login` and sign in with `APP_PASSWORD`.

## Vercel deployment

1. Push the project to GitHub.
2. Import the repo into Vercel as a Next.js project.
3. Add the environment variables above in **Project Settings → Environment Variables**.
4. Redeploy.

## Supabase schema

Run this in Supabase SQL Editor:

```sql
create table if not exists public.shows (
  id text primary key,
  date text not null,
  city text not null,
  venue_name text not null,
  venue_address text not null default '',
  venue_maps_url text not null default '',
  dos_name text not null default '',
  dos_phone text not null default '',
  parking_load_info text not null default '',
  schedule_items jsonb not null default '[]'::jsonb,
  hotel_name text not null default '',
  hotel_address text not null default '',
  hotel_maps_url text not null default '',
  hotel_notes text not null default '',
  notes text not null default '',
  guest_list_notes text not null default '',
  created_at timestamptz not null default now(),
  visibility jsonb not null default '{"show_venue": true, "show_parking_load_info": true, "show_schedule": true, "show_dos_contact": true, "show_accommodation": true, "show_notes": false, "show_guest_list_notes": false}'::jsonb
);

create table if not exists public.guest_list_entries (
  id text primary key,
  show_id text not null references public.shows(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists guest_list_entries_show_id_idx on public.guest_list_entries(show_id);
```

### Security note

Because the app now uses Next.js Route Handlers plus a server-side Supabase client, the browser never receives the service role key.

## Fallback behavior

If Supabase env vars are missing, the app still renders with in-memory sample data for quick UI testing. That fallback is not persistent, so use Supabase for real shared touring use.

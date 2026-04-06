# TourBook

Mobile-first touring dashboard for a band and crew. Built with Next.js App Router, TypeScript, and Tailwind CSS.

## What is in this version

- Shared password login using `APP_PASSWORD`
- Dashboard with `Upcoming` and `Past` tabs
- Today's show highlight
- Show detail page with optional section visibility controls
- Guest list entry UI
- Admin page with:
  - create show
  - edit show
  - delete show
  - export a show's guest list as CSV
  - toggle whether sections are shown to crew
- Works immediately with local sample data
- Optional Supabase sync layer prepared for shared live data across devices

## Local run

1. Install dependencies:

```bash
npm install
```

2. Copy env file:

```bash
cp .env.example .env.local
```

3. Set the shared password in `.env.local`.

```bash
APP_PASSWORD=your-shared-password
```

This password is used in the login route and route protection. Search the codebase for `APP_PASSWORD` to see the exact server-side usage.

4. Start the dev server:

```bash
npm run dev
```

5. Open `http://localhost:3000`

## Vercel deployment

1. Push the repo to GitHub.
2. Import the repo into Vercel.
3. Add the required environment variable:

- `APP_PASSWORD`

4. Deploy.

The app runs without Supabase.

## Enable shared sync with Supabase

The current code is ready for Supabase, but the app does not require it until you add the env vars and tables.

### Add these Vercel environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Create these tables in Supabase

```sql
create table if not exists shows (
  id text primary key,
  date text not null,
  city text not null,
  venue_name text not null,
  venue_address text not null,
  venue_maps_url text not null,
  dos_name text not null,
  dos_phone text not null,
  parking_load_info text not null,
  load_in text not null,
  soundcheck text not null,
  doors text not null,
  show_time text not null,
  curfew text not null,
  hotel_name text not null,
  hotel_address text not null,
  hotel_maps_url text not null,
  hotel_notes text not null,
  created_at timestamptz not null default now(),
  visibility jsonb not null default '{"show_venue": true, "show_dos_contact": true, "show_parking_load_info": true, "show_schedule": true, "show_accommodation": true}'::jsonb
);

create table if not exists guest_list_entries (
  id text primary key,
  show_id text not null references shows(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
```

### Seed your sample shows

You can either add rows manually in Supabase, or copy the sample data from `lib/sample-data.ts`.

### What happens after Supabase is connected

- Show edits sync across devices
- New shows sync across devices
- Deleted shows sync across devices
- Guest list entries sync across devices

## Notes

- Without Supabase, data is stored in browser localStorage on each device.
- With Supabase enabled, the app uses Supabase for shared data and still falls back to local mode if Supabase is unavailable.

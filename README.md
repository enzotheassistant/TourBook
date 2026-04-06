# TourBook

TourBook is a mobile-first Next.js app for a touring band. It ships with local sample data so you can deploy the UI immediately, then swap in Supabase later.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Vercel-ready
- Password-protected with one shared crew password

## Features

- Dashboard with upcoming shows in a mobile-first card layout
- Show detail pages with venue, DOS, schedule, hotel, and guest list
- Admin page to create and edit shows locally
- CSV export for a single show's guest list
- Local sample data and localStorage persistence for the initial version
- Supabase-ready data model notes for the next phase

## Local run

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your local env file:

   ```bash
   cp .env.example .env.local
   ```

3. Set your shared crew password in `.env.local`:

   ```bash
   APP_PASSWORD=your-real-password
   ```

4. Start the dev server:

   ```bash
   npm run dev
   ```

5. Open `http://localhost:3000`

## Login flow

- Visit `/login`
- Enter the shared password from `APP_PASSWORD`
- On success, the app sets a secure HTTP-only session cookie
- Use the logout button in the header to clear the cookie

## Vercel deployment

1. Push this project to GitHub.
2. Import the repo into Vercel.
3. In the Vercel project settings, add an environment variable:

   - Name: `APP_PASSWORD`
   - Value: your shared crew password

4. Deploy.

Because the app uses local sample data and browser localStorage for guest list + admin edits, the initial deployment works without Supabase.

## Data behavior in v1

This first version uses:

- Local seed data from `lib/sample-data.ts`
- Browser localStorage for:
  - guest list entries
  - admin-created shows
  - admin-edited shows

That means data is browser-specific until Supabase is connected.

## Supabase next step

The current code is structured so you can replace the local store with Supabase later.

Suggested tables:

### `shows`

- `id`
- `date`
- `city`
- `venue_name`
- `venue_address`
- `venue_maps_url`
- `dos_name`
- `dos_phone`
- `parking_load_info`
- `load_in`
- `soundcheck`
- `doors`
- `show_time`
- `curfew`
- `hotel_name`
- `hotel_address`
- `hotel_maps_url`
- `hotel_notes`
- `created_at`

### `guest_list_entries`

- `id`
- `show_id`
- `name`
- `created_at`

## Auth note

This app intentionally uses a simple shared-password flow for a crew-only tool.

Important files:

- `app/api/auth/login/route.ts`
- `app/api/auth/logout/route.ts`
- `lib/auth.ts`
- `proxy.ts`

These files include comments showing exactly where `APP_PASSWORD` is read and validated.

## Production follow-up ideas

- Replace localStorage with Supabase reads/writes
- Add real user accounts later if needed
- Add role-based admin protection
- Add per-show notes and document uploads

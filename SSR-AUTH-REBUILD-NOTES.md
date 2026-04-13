TourBook Phase 3.1 SSR auth rebuild

What changed
- Replaced proxy.ts with middleware.ts using the Supabase SSR middleware pattern.
- Rebuilt lib/supabase/server.ts around createServerClient + next/headers cookies().
- Added lib/supabase/middleware.ts to refresh/authenticate SSR cookies in middleware.
- Login now uses the browser Supabase client directly.
- Logout now uses the browser Supabase client directly.
- Removed active use of /api/auth/login and /api/auth/logout.
- API auth now resolves the logged-in user through the SSR cookie-backed server client.

Important
- Delete proxy.ts from your repo when applying this patch. Next 16 cannot have both proxy.ts and middleware.ts.
- This patch is auth-only. It does not change the dates/shows cutover, UI, or RLS.

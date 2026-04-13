This patch fixes the middleware auth gate to trust the Supabase SSR user result instead of manually checking guessed cookie names.

Changes:
- middleware.ts now uses `const { response, user } = await updateSession(request)`
- lib/supabase/middleware.ts now returns both `{ response, user }`
- manual checks for `sb-access-token` / `sb-refresh-token` were removed

Why:
- Supabase SSR cookie names are not guaranteed to match those guessed names
- middleware was rejecting a valid session and bouncing login back to `/login`
- route handlers could not share a stable session state while middleware disagreed

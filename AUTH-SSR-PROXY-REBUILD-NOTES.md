Phase 3.1 SSR auth rebuild from the current codebase.

What changed
- Replaced middleware.ts with proxy.ts for Next.js 16.
- Added lib/supabase/proxy.ts.
- Rebuilt protected API auth so route handlers use a request+response Supabase SSR client.
- /api/me/context and the other protected API routes still use lib/auth.ts, but lib/auth.ts now uses the request-aware SSR auth path.
- Browser login/logout remain via the Supabase browser client.

Files changed
- proxy.ts
- lib/supabase/proxy.ts
- lib/supabase/server.ts
- lib/auth.ts

Removed
- middleware.ts
- lib/supabase/middleware.ts

Phase 3.1 route-handler auth fix

Changes:
- Login page now posts to /api/auth/login so the server route writes Supabase SSR cookies.
- requireApiAuth() now uses createRouteHandlerSupabaseClient(request, response) instead of the request-only client.
- finalizeAuthResponse() now forwards any refreshed auth cookies to the returned API response.

Expected result:
- /api/me/context authenticates via the same cookie-based session path as proxy.ts.

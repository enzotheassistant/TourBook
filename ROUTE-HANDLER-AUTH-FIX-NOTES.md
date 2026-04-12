Phase 3.1f route-handler auth alignment fix

What changed
- Login now goes through /api/auth/login so the server route sets Supabase SSR cookies.
- requireApiAuth() now authenticates with createRouteHandlerSupabaseClient(request, response).
- finalizeAuthResponse() now forwards any refreshed auth cookies from that auth response onto the final API response.

Why
- The previous build mixed a browser-only login path with request-only API auth.
- That allowed client-side login state while /api/me/context still returned Unauthorized.

This patch aligns login and protected API auth on the same SSR cookie path.

Changes:
- Login now posts to /api/auth/login so Supabase cookies are set by the server route.
- requireApiAuth() now uses createRouteHandlerSupabaseClient(request, response).
- finalizeAuthResponse() forwards any refreshed auth cookies onto the final API response.

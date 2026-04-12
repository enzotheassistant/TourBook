Phase 3.1f

- login page now posts to /api/auth/login so the server route sets Supabase SSR cookies
- requireApiAuth() now authenticates with createRouteHandlerSupabaseClient(request, response)
- finalizeAuthResponse() forwards any refreshed auth cookies from the auth check onto the final response

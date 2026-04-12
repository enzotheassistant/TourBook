Phase 3.1d auth route refresh fix

- /api/me/context auth now uses createRouteHandlerSupabaseClient(request, response)
  instead of a request-only client, so Supabase can refresh/read SSR session cookies in route handlers.
- finalizeAuthResponse now copies any refreshed auth cookies from the auth bootstrap response
  to the actual JSON/API response.
- No UI, schema, or RLS changes.

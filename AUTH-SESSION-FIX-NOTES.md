# Auth session fix

This patch changes auth resolution to prefer supabase.auth.setSession(access, refresh) on the server before falling back to direct access-token user lookup.

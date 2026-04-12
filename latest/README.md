# TourBook

Phase 1 of the multi-tenant refactor introduces real Supabase Auth and a tenant context bootstrap layer without changing the existing shows-based pages yet.

## Required environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` is optional in Phase 1, but recommended for the `/api/me/context` bootstrap endpoint once workspace tables exist.

## What changed in Phase 1

- `/login` now uses Supabase Auth email/password sign-in.
- Password cookies and the admin unlock flow were removed.
- Authenticated app access is enforced by middleware via auth session cookies.
- `/api/me/context` returns the signed-in user plus workspace/project/tour context when those tables exist.
- Existing shows-based pages and queries are intentionally unchanged in this phase.

## Important note

Phase 1 is designed to deploy before the workspace/project/tour schema exists. Until those tables are added, `/api/me/context` will safely return an authenticated user and empty tenant arrays.

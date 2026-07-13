# @ls/db

Supabase migrations and (later) generated types for the L&S backoffice.

## Applying migrations

Migrations live in `migrations/` and are plain SQL, numbered and append-only.
Apply them in order against the L&S Supabase project:

```sh
# Option A: Supabase CLI linked to the L&S project
supabase db push

# Option B: paste the file into the Supabase SQL editor (in order)
```

Never edit an applied migration; write a new one.

## Conventions

- RLS enabled on every table, no exceptions.
- `audit_log` is append-only: insert-only policies plus revoked update/delete grants.
- Service role is reserved for sync workers (Phase 1+), never used in request handlers that act on behalf of a user.

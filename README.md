# L&S Backoffice Platform

Internal backoffice for **L&S Investment Advisors** (SEC-registered RIA, Coconut Grove, FL).
Portfolio review (Addepar-fed), intake pipeline, support tickets, and a proposal engine
with compliance guardrails. Internal users only; no client portal.

> This project is a fully separate entity: its Supabase project, Vercel project and
> git remote must never be shared with any other codebase.

## Structure

```
apps/web            Next.js app (UI + API routes)
packages/db         Supabase migrations, generated types, RLS policies
packages/addepar    Addepar client (Phase 1)
packages/docgen     Proposal PPTX + email generation (Phase 3)
packages/domain     Shared types, Zod schemas, brand tokens, formatters
```

## Setup

1. `pnpm install`
2. Create the L&S Supabase project (dedicated account) and apply migrations from
   `packages/db/migrations/` in order (SQL editor or `supabase db push`).
3. Copy `.env.example` to `apps/web/.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `APP_BASE_URL` (http://localhost:3000 locally)
   - `ALLOWED_EMAIL_DOMAIN` (optional; explicit allowlist rows always work)
4. `pnpm dev` and open http://localhost:3000.
5. Sign up with `grupoaaj.aa@gmail.com` (seeded as pre-activated admin), then manage
   users and the allowlist under **Settings**.

## Auth model

- Email allowlist enforced twice: a database trigger on `auth.users` rejects
  non-allowlisted signups, and the app checks before calling Supabase Auth.
- New users land **inactive** and are parked on `/pending` until an admin activates them.
- Roles: `advisor`, `ops`, `admin`, enforced by RLS in Postgres and route guards in the app.
- Every mutation writes to the append-only `audit_log` via `writeAudit()`. No exceptions.

## Commands

```sh
pnpm dev          # run the web app
pnpm build        # build all packages
pnpm typecheck    # strict TS across the workspace
pnpm test         # unit tests (formatters, later: flag engine, docgen golden files)
```

## Runbooks

Placeholders; filled in as the features ship (Phase 4 hardening):

- **Sync failed**: Phase 1. A failed Addepar sync leaves the previous snapshot intact
  and surfaces a red banner on the dashboard; check `sync_jobs.error`.
- **Regenerate a proposal**: Phase 3. Approved proposals are immutable; editing creates
  version+1 and marks the prior version superseded.

## Phase status

- [x] Phase 0: scaffold, auth + allowlist, roles, brand tokens, app shell, audit log
- [ ] Phase 1: Addepar + portfolio review
- [ ] Phase 2: intake + tickets
- [ ] Phase 3: models + proposals
- [ ] Phase 4: hardening

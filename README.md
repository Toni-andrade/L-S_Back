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
pnpm dev                        # run the web app
pnpm build                      # build all packages
pnpm typecheck                  # strict TS across the workspace
pnpm test                       # unit tests: formatters, flag engine, addepar client,
                                # tickets SLA, intake HMAC/dedupe, docgen golden file
pnpm --filter @ls/web seed      # seed dev data (2 households, flags lit, tickets, intake)
pnpm --filter @ls/web seed:undo # remove exactly what the seed created
pnpm --filter @ls/web smoke     # Playwright smoke (needs SMOKE_EMAIL/SMOKE_PASSWORD
                                # and `npx playwright install chromium` once)
```

## Cron

`vercel.json` schedules `GET /api/cron/nightly-sync` at 10:30 UTC (~05:30 ET during DST).
The route requires `Authorization: Bearer $CRON_SECRET` (Vercel sends it automatically
when the `CRON_SECRET` env var is set on the project).

## Env vars

Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
App: `APP_BASE_URL`, `ALLOWED_EMAIL_DOMAIN` (optional).
Addepar (Open Item 1): `ADDEPAR_SUBDOMAIN`, `ADDEPAR_FIRM_ID`, `ADDEPAR_API_KEY`,
`ADDEPAR_API_SECRET`, optional `ADDEPAR_TWR_COLUMN`.
Intake (Open Item 2): `INTAKE_WEBHOOK_SECRET`. Cron: `CRON_SECRET`.

## Runbooks

### Sync failed

A failed Addepar sync **never corrupts data**: holdings snapshots are written atomically,
so the previous snapshot stays authoritative and a red banner appears on the dashboard.

1. Open **Integrations**: the failing job shows status `error` with the message.
2. Common causes: expired API credentials (401), licensing 403 on TWR/transaction
   attributes (these degrade gracefully and are reported in stats, they do not fail the
   run), Addepar timeouts (the nightly run uses the Jobs API and retries 429/5xx).
3. Fix the cause, then either wait for the next nightly run or use **Refresh Addepar
   Data** on any household page for a scoped re-pull.
4. `sync_jobs.stats` keeps unmapped entities/groups; map them via clients/accounts/
   households (the sync never auto-creates records).

### Regenerate a proposal

Approved proposals are **immutable** (enforced by a database trigger; unlocking is
impossible).

- Draft or in-review: open the proposal, **Generate PPTX + Email** re-renders artifacts
  in place (the brief can still be edited via Edit Draft).
- Approved or sent: click **Revise (new version)**: this prefills the brief form and
  saving creates version+1 (draft). The prior version is marked superseded when the new
  version is approved. Generate artifacts on the new version as usual.
- Every version's PPTX lives in the private `proposals` storage bucket at
  `<proposal-id>/proposta-v<version>.pptx`; downloads go through short-lived signed URLs.

## Exports (books and records)

Admin-only JSON exports at `/api/export/<entity>` for: households, clients, accounts,
intake_submissions, tickets, ticket_events, proposals, proposal_flags, portfolio_reviews,
portfolio_flags, audit_log. Positions CSV per scope/date at `/api/export/positions`.
Every export writes an audit row.

## Phase status

- [x] Phase 0: scaffold, auth + allowlist, roles, brand tokens, app shell, audit log
- [x] Phase 1: Addepar + portfolio review
- [x] Phase 2: intake + tickets
- [x] Phase 3: models + proposals
- [x] Phase 4: hardening (seed, smoke, exports, runbooks, realized vol/Sharpe)

Pending external inputs (Antonio): Addepar credentials (Open Item 1), website webhook
field names + secret (Open Item 2), model sleeve definitions (Open Item 3), benchmark
definition for the performance overlay (Open Item 6), risk-factor sign-off (Open Item 7).

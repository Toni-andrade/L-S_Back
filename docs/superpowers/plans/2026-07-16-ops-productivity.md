# Ops Productivity Build (Account Opening 2.0 + Tickets + Ops Queue + Notifications/Resend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the daily operations work (account openings, tickets) fast: onboarding pipeline board, step due dates + structured capture + inline account creation, ticket bulk actions/canned responses/links/due-date edits/category stats, ops queue aging + breach forecast + claim, and in-app notifications with optional Resend email.

**Architecture:** One additive migration (0013). Domain helpers (pure, tested) in `packages/domain`. Server actions follow the existing pattern (`requireUser`/`requireRole` + RLS + `writeAudit` + `revalidatePath`). Notifications insert via the existing service client (RLS: owner-read-only) and optionally email via Resend REST (no SDK). UI stays server-component-first; only the ticket table (bulk selection) and comment box (canned fill-in) become client components.

**Explicitly out of scope (user decision 2026-07-16):** document collection/checklists on-platform; e-sign. Document *fill-in* from intake data is a separate follow-up phase.

**Tech Stack:** Next.js App Router, Supabase (Postgres + RLS), zod, vitest, Resend REST API.

---

## Migration `packages/db/migrations/0013_ops_productivity.sql`

Additive only. Sections:

1. **Workflow scheduling + capture**
   - `workflow_template_steps`: `+ due_days int`, `+ fields jsonb` (array of `{key,label,type:'text'|'date'}`)
   - `workflow_run_steps`: `+ due_at timestamptz`, `+ fields jsonb` (snapshot), `+ data jsonb` (captured values)
   - `workflow_runs`: `+ intake_submission_id uuid references intake_submissions(id)`
   - Seed `due_days` (business days from run start): account_opening `3,2,2,10,2,5,3`; money_movement `1,2,2,1,3`
   - Seed `fields`: acct step 3 `application_ref`; step 4 `approval_date(date), custodian_account_number`; step 6 `funding_amount`; mm step 1 `amount,destination`; step 4 `custodian_ref`; step 5 `settled_on(date)`
2. **`canned_responses`** (id, title, body, category ticket_category null, active bool, created_by, created_at). RLS: read active users; write ops+admin.
3. **`ticket_links`** (id, ticket_id, linked_ticket_id, kind text check in `relates_to|blocks|duplicate_of`, created_by, created_at, unique pair, no self-link check). RLS: read active; insert as self; delete ops/admin or creator.
4. **`notifications`** (id, user_id, kind text, title, body, href, read_at, created_at; index on user_id + read_at). RLS: select/update own rows only; **no insert policy** (service role inserts).

Due-date changes and links on tickets reuse `ticket_event_kind = 'system'` with `meta` (no enum change).

## Tasks

### Task 1: Migration 0013
- [x] Write `packages/db/migrations/0013_ops_productivity.sql` per above. Commit.

### Task 2: Domain helpers + tests
Files: `packages/domain/src/tickets.ts`, `packages/domain/src/workflows.ts` (new), `packages/domain/src/index.ts`, tests alongside.
- [x] `tickets.ts`: `ageDays(createdAt, now)`, `slaDueWithin(dueAt, status, hours, now)` (open + due in the next N hours, not yet breached). Tests in `tickets.test.ts`.
- [x] `workflows.ts` (new): `WorkflowStepField` type, `parseStepFields(json)`, `stepDueAt(startedAt, dueDays)` (business days, reuses `addBusinessDays`), `stepDueState(dueAt, status, now)` -> `none|ok|overdue`. Tests in `workflows.test.ts`. Export from index.

### Task 3: Email (Resend) + notifications lib
Files: `apps/web/src/lib/email.ts` (new), `apps/web/src/lib/notify.ts` (new).
- [x] `email.ts`: `sendEmail({to, subject, html})` -> POST `https://api.resend.com/emails` with `Authorization: Bearer ${RESEND_API_KEY}`, from `RESEND_FROM ?? "L&S Backoffice <onboarding@resend.dev>"`. No-op (return `{sent:false}`) when key missing; never throws (logs).
- [x] `notify.ts`: `notify({userId, kind, title, body?, href, email?})` inserts via `createServiceClient()`, then best-effort email to the user's address when `email !== false`. `notifyOnce` skips when a row with same (user_id, kind, href) already exists.

### Task 4: Ticket actions
File: `apps/web/src/lib/actions/tickets.ts` (+ `canned-responses.ts` new).
- [x] Extend `assignTicket`: optional `comment` -> comment event; `notify` new assignee when not self.
- [x] `claimTicket(formData)`: assign to self from queue (event + audit).
- [x] `bulkTicketAction(formData)`: `requireRole("ops","admin")`; `ids` (getAll) + `op` in `assign|status|priority` + `value`; loops per ticket: update + system event + audit; notify on assign. Redirect back to `/tickets?view=...&cat=...`.
- [x] `changeTicketDue(formData)`: new `due` date + required `reason`; system event meta `{from,to,reason}` + audit.
- [x] `linkTicket(formData)`: id + `number` (LS-YYYY-NNNN) + kind -> resolve target, insert `ticket_links`, system events both sides, audit. `unlinkTicket(formData)`.
- [x] `canned-responses.ts`: `saveCannedResponse`, `setCannedResponseActive` (ops+admin, audited).

### Task 5: Workflow + intake actions
Files: `apps/web/src/lib/actions/workflows.ts`, `apps/web/src/lib/actions/intake.ts`.
- [x] `startWorkflow`: snapshot `fields` + compute `due_at` per step (`stepDueAt(now, due_days)`); optional `assignedTo` (defaults self, notify if other); optional `intakeSubmissionId`.
- [x] `setStepStatus`: read `field_<key>` form entries -> merge into `data` jsonb when marking done.
- [x] `createAccountForRun(formData)`: `requireRole("ops","admin")`; insert `accounts` via service client (custodian, masked number, currency, optional addepar_entity_id), set `run.account_id`, audit `account.create` (mirrors convertIntake service-client pattern). Handles duplicate addepar_entity_id error.
- [x] `convertIntake`: new `startWorkflow` checkbox -> also start Account Opening run (service client) linked via `intake_submission_id`, snapshot steps with due dates/fields; redirect run > ticket > intake.

### Task 6: Data layer
File: `apps/web/src/lib/data.ts`.
- [x] `ticketCategoryStats()` (per-category open/breached), `ticketThroughput()` (opened today via created_at; resolved today via status_change events to resolved/closed; breached now).
- [x] `onboardingBoard()`: open account_opening runs + steps + client names -> per-run `{run, currentStep, ageDays, overdueSteps}` + per-step-seq counts.
- [x] `unreadNotificationCount(userId)`, `notificationsList(userId)`.
- [x] `workQueue`: aging in subtitles (`opened Nd ago`, `SLA breached Nd ago`); new `ticket_due_soon` items (due within 24h, severity medium); `ActionItem.claimTicketId?` on unassigned tickets.

### Task 7: Tickets UI
Files: `apps/web/src/app/(app)/tickets/page.tsx`, `[id]/page.tsx`, `components/tickets/tickets-table.tsx` (new, client), `components/tickets/comment-box.tsx` (new, client).
- [x] List: category chips (`cat` param) + per-category stats strip (open/breached, clickable), Age + Due columns, `TicketsTable` client component with checkboxes + bulk bar (assign/status/priority) posting `bulkTicketAction`.
- [x] Detail: due-date card (edit + reason via `changeTicketDue`); `CommentBox` with canned-response picker; assignee card gains optional comment; Links card (add by number + kind, list, remove).

### Task 8: Onboarding board + workflow run UI + nav
Files: `apps/web/src/app/(app)/onboarding/page.tsx` (new), `workflows/[id]/page.tsx`, `components/shell/nav-items.ts`, `intake/[id]/page.tsx`.
- [x] `/onboarding`: stage chips (count of runs at each current step) + table (client, age, current step, due state, status, progress) + recently completed. Nav item after Intake Pipeline.
- [x] Workflow run page: per-step due chip (overdue red), field inputs inside the Done form for steps with fields, captured data shown when done, "Create & link account" card for account_opening runs without `account_id` (ops/admin), intake source link.
- [x] Intake detail: "Start Account Opening playbook" checkbox on convert form.

### Task 9: Home + notifications UI + settings
Files: `app/(app)/page.tsx`, `components/work-queue.tsx`, `app/(app)/notifications/page.tsx` (new), `components/shell/sidebar.tsx`, `app/(app)/layout.tsx`, `settings/page.tsx`, actions `notifications.ts` (new).
- [x] WorkQueue: render Claim button when `item.claimTicketId` (form -> `claimTicket`); ops queue header gets throughput chips (opened/resolved today, breaching, due <24h).
- [x] `/notifications`: list + mark read / mark all read; sidebar unread badge on a Notifications nav item (same pattern as tickets badge).
- [x] Settings: Canned responses card (list/add/deactivate, ops+admin visible; uses Task 4 actions).

### Task 10: Cron breach notifications
File: `apps/web/src/app/api/cron/nightly-sync/route.ts` (+ helper in `lib/notify.ts`).
- [x] After sync: `notifyTicketBreaches()` — open, past-due, assigned tickets -> `notifyOnce(assignee, 'ticket_breach', /tickets/id)`.

### Task 11: Verify + ship
- [x] `pnpm typecheck`, `pnpm test` (109 tests) and `pnpm build` green.
- [x] Apply migration 0013 — DONE 2026-07-17 via packages/db/scripts/apply-migration.mjs (session pooler, password session-supplied). Verified: 3 tables + RLS, 6 columns, seeds (account_opening 7 due_days / 3 field steps, money_movement 5 / 3).
- [x] Pushed to main 2026-07-16 (user requested deploy ahead of migration); schema caught up 2026-07-17.

## Resend placement (user question)
- Key lives in env: `RESEND_API_KEY` (+ optional `RESEND_FROM`) in Vercel project env vars (Production + Preview) and `apps/web/.env.local` for dev. Never committed.
- Code: `apps/web/src/lib/email.ts`; the only call-site is `notify()` so all outbound email flows through one audited path.

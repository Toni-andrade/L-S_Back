-- Ops productivity: workflow step due dates + structured capture + intake
-- linkage, ticket canned responses + links, and in-app notifications.
-- Additive only; ticket due-date changes and links reuse ticket_event_kind
-- 'system' with meta payloads (no enum change).

-- ---------------------------------------------------------------------------
-- Workflow scheduling + structured capture
-- ---------------------------------------------------------------------------
alter table public.workflow_template_steps
  add column due_days int,
  add column fields jsonb;

alter table public.workflow_run_steps
  add column due_at timestamptz,
  add column fields jsonb,
  add column data jsonb;

alter table public.workflow_runs
  add column intake_submission_id uuid references public.intake_submissions (id);

-- Seed due_days (business days from run start) on the stock playbooks.
update public.workflow_template_steps s
set due_days = v.due_days
from (values
  ('account_opening', 1, 3),
  ('account_opening', 2, 2),
  ('account_opening', 3, 2),
  ('account_opening', 4, 10),
  ('account_opening', 5, 2),
  ('account_opening', 6, 5),
  ('account_opening', 7, 3),
  ('money_movement', 1, 1),
  ('money_movement', 2, 2),
  ('money_movement', 3, 2),
  ('money_movement', 4, 1),
  ('money_movement', 5, 3)
) as v(tkey, seq, due_days)
join public.workflow_templates t on t.key = v.tkey
where s.template_id = t.id and s.seq = v.seq;

-- Seed structured-capture fields on the steps where ops records references.
update public.workflow_template_steps s
set fields = v.fields::jsonb
from (values
  ('account_opening', 3,
   '[{"key":"application_ref","label":"Application reference","type":"text"}]'),
  ('account_opening', 4,
   '[{"key":"approval_date","label":"Approval date","type":"date"},{"key":"custodian_account_number","label":"Custodian account number (last 4)","type":"text"}]'),
  ('account_opening', 6,
   '[{"key":"funding_amount","label":"Initial funding amount (USD)","type":"text"}]'),
  ('money_movement', 1,
   '[{"key":"amount","label":"Amount (USD)","type":"text"},{"key":"destination","label":"Destination","type":"text"}]'),
  ('money_movement', 4,
   '[{"key":"custodian_ref","label":"Custodian reference","type":"text"}]'),
  ('money_movement', 5,
   '[{"key":"settled_on","label":"Settlement date","type":"date"}]')
) as v(tkey, seq, fields)
join public.workflow_templates t on t.key = v.tkey
where s.template_id = t.id and s.seq = v.seq;

-- ---------------------------------------------------------------------------
-- Canned responses (ticket comment templates)
-- ---------------------------------------------------------------------------
create table public.canned_responses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  category ticket_category,
  active boolean not null default true,
  created_by uuid not null references public.users (id),
  created_at timestamptz not null default now()
);

alter table public.canned_responses enable row level security;
create policy canned_responses_read on public.canned_responses for select
  using (public.current_user_is_active());
create policy canned_responses_write on public.canned_responses for all
  using (public.current_user_role() in ('ops', 'admin'))
  with check (public.current_user_role() in ('ops', 'admin'));

-- ---------------------------------------------------------------------------
-- Ticket links (relates_to / blocks / duplicate_of)
-- ---------------------------------------------------------------------------
create table public.ticket_links (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  linked_ticket_id uuid not null references public.tickets (id) on delete cascade,
  kind text not null check (kind in ('relates_to', 'blocks', 'duplicate_of')),
  created_by uuid not null references public.users (id),
  created_at timestamptz not null default now(),
  unique (ticket_id, linked_ticket_id),
  check (ticket_id <> linked_ticket_id)
);
create index ticket_links_ticket_idx on public.ticket_links (ticket_id);
create index ticket_links_linked_idx on public.ticket_links (linked_ticket_id);

alter table public.ticket_links enable row level security;
create policy ticket_links_read on public.ticket_links for select
  using (public.current_user_is_active());
create policy ticket_links_insert on public.ticket_links for insert
  with check (public.current_user_is_active() and created_by = auth.uid());
create policy ticket_links_delete on public.ticket_links for delete
  using (
    public.current_user_role() in ('ops', 'admin')
    or created_by = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- Notifications (in-app; email fan-out happens in the app layer)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

alter table public.notifications enable row level security;
-- Owner-only read and mark-as-read; inserts arrive via the service role only.
create policy notifications_read on public.notifications for select
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

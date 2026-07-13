-- Phase 2: website intake pipeline + support tickets.
-- RLS on everything: active internal users read; intake/ticket writes are
-- ops + admin (spec Section 3); the public webhook writes via service role.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type intake_status as enum
  ('new_lead', 'discovery_scheduled', 'proposal_in_progress',
   'pending_onboarding', 'converted', 'discarded');
create type ticket_category as enum
  ('operations', 'trading', 'reporting', 'tax', 'onboarding', 'tech', 'other');
create type ticket_priority as enum ('low', 'medium', 'high', 'urgent');
create type ticket_status as enum
  ('new', 'in_progress', 'waiting_client', 'waiting_custodian', 'resolved', 'closed');
create type ticket_event_kind as enum ('comment', 'status_change', 'assignment', 'system');

-- ---------------------------------------------------------------------------
-- Intake submissions (raw webhook payload stored verbatim; dedupe by hash)
-- ---------------------------------------------------------------------------
create table public.intake_submissions (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  source text not null default 'website',
  raw jsonb not null,
  name text,
  email text,
  phone text,
  country text,
  investable_range text,
  message text,
  status intake_status not null default 'new_lead',
  converted_client_id uuid references public.clients (id),
  discard_reason text,
  dedupe_hash text not null unique,
  signature_valid boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- discarding always requires a reason
  check (status <> 'discarded' or discard_reason is not null)
);
create index intake_submissions_status_idx on public.intake_submissions (status, received_at desc);

-- Link clients back to the intake row they came from (column existed since
-- Phase 1 without a target; now enforce the FK).
alter table public.clients
  add constraint clients_created_from_intake_fkey
  foreign key (created_from_intake_id) references public.intake_submissions (id);

-- ---------------------------------------------------------------------------
-- Tickets: LS-YYYY-#### numbering, sequence per year via counter table
-- ---------------------------------------------------------------------------
create table public.ticket_counters (
  year int primary key,
  counter int not null default 0
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  title text not null,
  description text,
  client_id uuid references public.clients (id),
  account_id uuid references public.accounts (id),
  category ticket_category not null default 'operations',
  priority ticket_priority not null default 'medium',
  status ticket_status not null default 'new',
  assignee_id uuid references public.users (id),
  created_by uuid not null references public.users (id),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tickets_status_idx on public.tickets (status, priority);
create index tickets_assignee_idx on public.tickets (assignee_id) where status not in ('resolved', 'closed');
create index tickets_client_idx on public.tickets (client_id);

create or replace function public.next_ticket_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  y int := extract(year from now())::int;
  n int;
begin
  insert into public.ticket_counters as tc (year, counter)
  values (y, 1)
  on conflict (year) do update set counter = tc.counter + 1
  returning counter into n;
  new.number := format('LS-%s-%s', y, lpad(n::text, 4, '0'));
  return new;
end;
$$;

create trigger tickets_number before insert on public.tickets
  for each row when (new.number is null or new.number = '')
  execute function public.next_ticket_number();

create table public.ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  author_id uuid not null references public.users (id),
  kind ticket_event_kind not null,
  body text,
  internal boolean not null default true,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index ticket_events_ticket_idx on public.ticket_events (ticket_id, created_at);

-- ---------------------------------------------------------------------------
-- updated_at touch triggers
-- ---------------------------------------------------------------------------
create trigger intake_submissions_touch before update on public.intake_submissions
  for each row execute function public.touch_updated_at();
create trigger tickets_touch before update on public.tickets
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.intake_submissions enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_events enable row level security;
alter table public.ticket_counters enable row level security;
-- ticket_counters: no policies; only the security-definer numbering function
-- (and the service role) touch it.

create policy intake_read on public.intake_submissions for select
  using (public.current_user_is_active());
create policy tickets_read on public.tickets for select
  using (public.current_user_is_active());
create policy ticket_events_read on public.ticket_events for select
  using (public.current_user_is_active());

-- Intake writes: ops + admin (webhook inserts arrive via service role)
create policy intake_write on public.intake_submissions for all
  using (public.current_user_role() in ('ops', 'admin'))
  with check (public.current_user_role() in ('ops', 'admin'));

-- Ticket creation: any active internal user (advisors use "Open Ticket" from
-- the review page); they must create as themselves.
create policy tickets_insert on public.tickets for insert
  with check (public.current_user_is_active() and created_by = auth.uid());

-- Ticket updates: ops + admin, plus the assignee and the creator
create policy tickets_update on public.tickets for update
  using (
    public.current_user_role() in ('ops', 'admin')
    or assignee_id = auth.uid()
    or created_by = auth.uid()
  )
  with check (
    public.current_user_role() in ('ops', 'admin')
    or assignee_id = auth.uid()
    or created_by = auth.uid()
  );

-- Ticket events: any active internal user comments as themselves; events are
-- append-only (no update/delete policies).
create policy ticket_events_insert on public.ticket_events for insert
  with check (public.current_user_is_active() and author_id = auth.uid());

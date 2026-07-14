-- Workflow playbooks: reusable templated checklists that ops/advisors run to
-- execute recurring processes (account opening, money movement, transfers...).
-- Starting a template snapshots its steps into a run so later template edits
-- don't mutate in-flight work. Runs link to a client and are visibility-scoped.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type workflow_kind as enum
  ('account_opening', 'money_movement', 'transfer', 'review', 'offboarding', 'custom');
create type workflow_status as enum ('open', 'in_progress', 'blocked', 'done', 'canceled');
create type workflow_step_status as enum ('todo', 'done', 'skipped', 'blocked');
create type workflow_role as enum ('advisor', 'ops', 'admin', 'any');

-- ---------------------------------------------------------------------------
-- Templates + their steps (admin-managed)
-- ---------------------------------------------------------------------------
create table public.workflow_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  kind workflow_kind not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workflow_template_steps (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.workflow_templates (id) on delete cascade,
  seq int not null,
  title text not null,
  description text,
  role workflow_role not null default 'ops',
  required boolean not null default true,
  unique (template_id, seq)
);

-- ---------------------------------------------------------------------------
-- Runs + their (snapshotted) steps
-- ---------------------------------------------------------------------------
create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.workflow_templates (id),
  kind workflow_kind not null,
  title text not null,
  client_id uuid references public.clients (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete set null,
  status workflow_status not null default 'open',
  assigned_to uuid references public.users (id),
  started_by uuid not null references public.users (id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index workflow_runs_status_idx on public.workflow_runs (status);
create index workflow_runs_client_idx on public.workflow_runs (client_id);

create table public.workflow_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.workflow_runs (id) on delete cascade,
  seq int not null,
  title text not null,
  role workflow_role not null default 'ops',
  required boolean not null default true,
  status workflow_step_status not null default 'todo',
  notes text,
  completed_by uuid references public.users (id),
  completed_at timestamptz,
  unique (run_id, seq)
);

-- ---------------------------------------------------------------------------
-- touch triggers
-- ---------------------------------------------------------------------------
create trigger workflow_templates_touch before update on public.workflow_templates
  for each row execute function public.touch_updated_at();
create trigger workflow_runs_touch before update on public.workflow_runs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.workflow_templates enable row level security;
alter table public.workflow_template_steps enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.workflow_run_steps enable row level security;

-- Templates: all active read; admin writes.
create policy wf_templates_read on public.workflow_templates for select
  using (public.current_user_is_active());
create policy wf_templates_write on public.workflow_templates for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');
create policy wf_template_steps_read on public.workflow_template_steps for select
  using (public.current_user_is_active());
create policy wf_template_steps_write on public.workflow_template_steps for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- Runs: visible when firm-level (no client) or the client is visible; any
-- active internal user may create/advance them.
create policy wf_runs_read on public.workflow_runs for select
  using (
    public.current_user_is_active()
    and (client_id is null or public.user_can_see_client(client_id))
  );
create policy wf_runs_insert on public.workflow_runs for insert
  with check (
    started_by = auth.uid()
    and (client_id is null or public.user_can_see_client(client_id))
  );
create policy wf_runs_update on public.workflow_runs for update
  using (
    public.current_user_is_active()
    and (client_id is null or public.user_can_see_client(client_id))
  )
  with check (
    public.current_user_is_active()
    and (client_id is null or public.user_can_see_client(client_id))
  );

-- Run steps: follow the parent run's visibility.
create policy wf_run_steps_read on public.workflow_run_steps for select
  using (
    exists (
      select 1 from public.workflow_runs r
      where r.id = run_id
        and (r.client_id is null or public.user_can_see_client(r.client_id))
    )
  );
create policy wf_run_steps_write on public.workflow_run_steps for all
  using (
    public.current_user_is_active()
    and exists (
      select 1 from public.workflow_runs r
      where r.id = run_id
        and (r.client_id is null or public.user_can_see_client(r.client_id))
    )
  )
  with check (
    public.current_user_is_active()
    and exists (
      select 1 from public.workflow_runs r
      where r.id = run_id
        and (r.client_id is null or public.user_can_see_client(r.client_id))
    )
  );

-- ---------------------------------------------------------------------------
-- Seed playbooks
-- ---------------------------------------------------------------------------
insert into public.workflow_templates (key, name, kind, description) values
  ('account_opening', 'Account Opening', 'account_opening',
   'Open and fund a new custody account (IBKR / Morgan Stanley via Addepar).'),
  ('money_movement', 'Money Movement', 'money_movement',
   'Process a client wire / ACH / journal request with authorization and review.');

insert into public.workflow_template_steps (template_id, seq, title, role, required)
select t.id, s.seq, s.title, s.role::workflow_role, s.required
from public.workflow_templates t
join (values
  ('account_opening', 1, 'Collect KYC & identity documents', 'ops', true),
  ('account_opening', 2, 'Confirm suitability & risk profile', 'advisor', true),
  ('account_opening', 3, 'Submit custodian application', 'ops', true),
  ('account_opening', 4, 'Custodian approval received', 'ops', true),
  ('account_opening', 5, 'Map Addepar entity & accounts', 'ops', true),
  ('account_opening', 6, 'Initial funding confirmed', 'ops', true),
  ('account_opening', 7, 'Welcome contact & first review scheduled', 'advisor', true),
  ('money_movement', 1, 'Capture request details (amount, destination)', 'ops', true),
  ('money_movement', 2, 'Client written authorization on file', 'ops', true),
  ('money_movement', 3, 'Compliance review', 'admin', true),
  ('money_movement', 4, 'Submit to custodian', 'ops', true),
  ('money_movement', 5, 'Confirm settlement', 'ops', true)
) as s(tkey, seq, title, role, required) on s.tkey = t.key;

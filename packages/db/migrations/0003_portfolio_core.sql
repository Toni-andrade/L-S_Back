-- Phase 1: households, clients, accounts, sync infrastructure, holdings,
-- transactions, performance, reviews, risk factors, blocked issuers, flags.
-- RLS on everything: active internal users read; writes by role; sync tables
-- are written by the service role only.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type client_type as enum ('individual', 'joint', 'entity', 'trust');
create type client_status as enum ('prospect', 'active', 'closed');
create type risk_profile as enum ('conservador', 'moderado', 'agressivo');
create type custodian as enum ('ibkr', 'morgan_stanley', 'other');
create type account_status as enum ('open', 'closed');
create type sync_kind as enum ('addepar_nightly', 'addepar_on_demand', 'docgen');
create type sync_status as enum ('queued', 'running', 'done', 'error');
create type perf_scope as enum ('household', 'client');
create type perf_period as enum ('ytd', 'one_year');
create type blocked_reason as enum ('credit', 'client_preference', 'category');
create type flag_severity as enum ('info', 'warning', 'blocker');

-- ---------------------------------------------------------------------------
-- Core entities
-- ---------------------------------------------------------------------------
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  addepar_group_id text unique,
  primary_advisor_id uuid references public.users (id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type client_type not null default 'individual',
  status client_status not null default 'prospect',
  advisor_id uuid references public.users (id),
  household_id uuid references public.households (id),
  domicile_country char(2),
  tax_residency char(2),
  is_brazil_taxpayer boolean not null default false,
  is_us_nra boolean not null default false,
  risk_profile risk_profile,
  addepar_entity_id text unique,
  created_from_intake_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id),
  custodian custodian not null default 'other',
  account_number_masked text not null,
  addepar_entity_id text unique,
  base_currency char(3) not null default 'USD',
  status account_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Sync infrastructure
-- ---------------------------------------------------------------------------
create table public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  kind sync_kind not null,
  status sync_status not null default 'queued',
  target jsonb,
  stats jsonb,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.snapshots (
  id uuid primary key default gen_random_uuid(),
  sync_job_id uuid references public.sync_jobs (id),
  as_of date not null,
  source text not null default 'addepar',
  created_at timestamptz not null default now()
);

create table public.holdings (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.snapshots (id) on delete cascade,
  account_id uuid not null references public.accounts (id),
  as_of date not null,
  security_id text,
  symbol text,
  description text,
  asset_class text,
  quantity numeric,
  price numeric,
  market_value numeric not null,
  currency char(3) not null default 'USD',
  weight numeric,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index holdings_account_asof_idx on public.holdings (account_id, as_of);
create index holdings_snapshot_idx on public.holdings (snapshot_id);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id),
  addepar_transaction_id text unique,
  trade_date date not null,
  settle_date date,
  activity text not null check (activity in
    ('contribution','withdrawal','buy','sell','dividend','interest','fee','transfer','other')),
  description text,
  symbol text,
  quantity numeric,
  amount numeric not null,
  currency char(3) not null default 'USD',
  raw jsonb,
  created_at timestamptz not null default now()
);
create index transactions_account_date_idx on public.transactions (account_id, trade_date desc);

create table public.performance_points (
  id uuid primary key default gen_random_uuid(),
  scope perf_scope not null,
  scope_id uuid not null,
  period perf_period not null,
  as_of date not null,
  twr numeric not null,
  benchmark_twr numeric,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (scope, scope_id, period, as_of)
);

-- ---------------------------------------------------------------------------
-- Reviews, risk factors, blocked issuers, flags
-- ---------------------------------------------------------------------------
create table public.portfolio_reviews (
  id uuid primary key default gen_random_uuid(),
  scope perf_scope not null,
  scope_id uuid not null,
  reviewed_by uuid not null references public.users (id),
  reviewed_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);
create index portfolio_reviews_scope_idx on public.portfolio_reviews (scope, scope_id, reviewed_at desc);

create table public.risk_factors (
  id uuid primary key default gen_random_uuid(),
  asset_class text not null unique,
  factor numeric not null check (factor >= 0 and factor <= 100),
  vol_assumption numeric not null check (vol_assumption >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.blocked_issuers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ticker text,
  reason blocked_reason not null,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.portfolio_flags (
  id uuid primary key default gen_random_uuid(),
  scope perf_scope not null,
  scope_id uuid not null,
  snapshot_id uuid references public.snapshots (id) on delete cascade,
  code text not null,
  severity flag_severity not null,
  message text not null,
  acknowledged_by uuid references public.users (id),
  acknowledged_at timestamptz,
  ack_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- acknowledging always requires a reason
  check ((acknowledged_by is null) = (ack_reason is null))
);
create index portfolio_flags_scope_idx on public.portfolio_flags (scope, scope_id);

-- ---------------------------------------------------------------------------
-- updated_at touch triggers
-- ---------------------------------------------------------------------------
create trigger households_touch before update on public.households
  for each row execute function public.touch_updated_at();
create trigger clients_touch before update on public.clients
  for each row execute function public.touch_updated_at();
create trigger accounts_touch before update on public.accounts
  for each row execute function public.touch_updated_at();
create trigger sync_jobs_touch before update on public.sync_jobs
  for each row execute function public.touch_updated_at();
create trigger risk_factors_touch before update on public.risk_factors
  for each row execute function public.touch_updated_at();
create trigger blocked_issuers_touch before update on public.blocked_issuers
  for each row execute function public.touch_updated_at();
create trigger portfolio_flags_touch before update on public.portfolio_flags
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.households enable row level security;
alter table public.clients enable row level security;
alter table public.accounts enable row level security;
alter table public.sync_jobs enable row level security;
alter table public.snapshots enable row level security;
alter table public.holdings enable row level security;
alter table public.transactions enable row level security;
alter table public.performance_points enable row level security;
alter table public.portfolio_reviews enable row level security;
alter table public.risk_factors enable row level security;
alter table public.blocked_issuers enable row level security;
alter table public.portfolio_flags enable row level security;

-- All active internal users can read everything
create policy households_read on public.households for select using (public.current_user_is_active());
create policy clients_read on public.clients for select using (public.current_user_is_active());
create policy accounts_read on public.accounts for select using (public.current_user_is_active());
create policy sync_jobs_read on public.sync_jobs for select using (public.current_user_is_active());
create policy snapshots_read on public.snapshots for select using (public.current_user_is_active());
create policy holdings_read on public.holdings for select using (public.current_user_is_active());
create policy transactions_read on public.transactions for select using (public.current_user_is_active());
create policy performance_read on public.performance_points for select using (public.current_user_is_active());
create policy reviews_read on public.portfolio_reviews for select using (public.current_user_is_active());
create policy risk_factors_read on public.risk_factors for select using (public.current_user_is_active());
create policy blocked_issuers_read on public.blocked_issuers for select using (public.current_user_is_active());
create policy flags_read on public.portfolio_flags for select using (public.current_user_is_active());

-- Client/household/account writes: advisor + admin
create policy households_write on public.households for all
  using (public.current_user_role() in ('advisor', 'admin'))
  with check (public.current_user_role() in ('advisor', 'admin'));
create policy clients_write on public.clients for all
  using (public.current_user_role() in ('advisor', 'admin'))
  with check (public.current_user_role() in ('advisor', 'admin'));
create policy accounts_write on public.accounts for all
  using (public.current_user_role() in ('advisor', 'admin'))
  with check (public.current_user_role() in ('advisor', 'admin'));

-- Reviews: any active internal user records a review as themselves
create policy reviews_insert on public.portfolio_reviews for insert
  with check (public.current_user_is_active() and reviewed_by = auth.uid());

-- Risk factors and blocked issuers: admin-editable
create policy risk_factors_write on public.risk_factors for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');
create policy blocked_issuers_write on public.blocked_issuers for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- Flags: acknowledgment updates by active internal users (reason enforced by
-- table check + app layer, which also audit-logs). Inserts are service-role only.
create policy flags_ack on public.portfolio_flags for update
  using (public.current_user_is_active())
  with check (public.current_user_is_active());

-- sync_jobs/snapshots/holdings/transactions/performance_points have NO client
-- write policies: only the service role (sync workers) writes them.

-- ---------------------------------------------------------------------------
-- Seed: risk factors (Section 6.1 defaults, pending Antonio sign-off; admin-editable)
-- ---------------------------------------------------------------------------
insert into public.risk_factors (asset_class, factor, vol_assumption) values
  ('Cash & equivalents', 0, 0.5),
  ('IG fixed income', 15, 5),
  ('HY & EM fixed income', 35, 9),
  ('Gold', 30, 15),
  ('Liquid alternatives', 45, 10),
  ('US equities', 70, 16),
  ('Intl developed equities', 72, 17),
  ('EM equities', 85, 22),
  ('Real assets & REITs', 65, 18),
  ('Unclassified', 50, 12);

-- ---------------------------------------------------------------------------
-- Seed: blocked issuers (Section 10)
-- ---------------------------------------------------------------------------
insert into public.blocked_issuers (name, ticker, reason, notes) values
  ('Bayer', 'BAYRY', 'credit', null),
  ('Boeing', 'BA', 'credit', null),
  ('Intel', 'INTC', 'credit', null),
  ('Oracle', 'ORCL', 'credit', null),
  ('Ford', 'F', 'credit', null),
  ('Dow Chemical', 'DOW', 'credit', null),
  ('Humana', 'HUM', 'credit', null),
  ('Stellantis', 'STLA', 'credit', null),
  ('Peru sovereign', null, 'credit', 'Sovereign credit'),
  ('Televisa', 'TV', 'credit', null),
  ('Pemex', null, 'credit', null),
  ('LyondellBasell', 'LYB', 'credit', null),
  ('Uber', 'UBER', 'client_preference', null),
  ('Ally Financial', 'ALLY', 'client_preference', null),
  ('JBS', 'JBS', 'client_preference', null),
  ('Embraer', 'ERJ', 'client_preference', null),
  ('Owl Rock', 'OBDC', 'category', 'Private credit / BDC'),
  ('BCRED', null, 'category', 'Private credit / BDC'),
  ('Blue Owl OBDC', 'OBDC', 'category', 'Private credit / BDC'),
  ('GS Private Credit', null, 'category', 'Private credit / BDC'),
  ('Ares Strategic', null, 'category', 'Private credit / BDC'),
  ('ARCC', 'ARCC', 'category', 'Private credit / BDC');

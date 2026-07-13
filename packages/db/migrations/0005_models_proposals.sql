-- Phase 3: strategy library, model library, proposals with flags,
-- approval/versioning, PPTX storage bucket.
-- RLS: active internal users read; strategies/models admin-only writes;
-- proposals advisor + admin.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type strategy_kind as enum ('built_in', 'static_model', 'custom');
create type model_status as enum ('draft', 'active', 'retired');
create type proposal_status as enum ('draft', 'in_review', 'approved', 'sent', 'superseded');

-- ---------------------------------------------------------------------------
-- Strategy library (Section 8.2)
-- ---------------------------------------------------------------------------
create table public.strategies (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  kind strategy_kind not null,
  instruments jsonb,
  metrics jsonb,
  risk_label text,
  constraints jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Model library (sleeve weights per model must sum to 100)
-- ---------------------------------------------------------------------------
create table public.models (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  risk_profile risk_profile not null,
  version int not null default 1,
  status model_status not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.model_sleeves (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.models (id) on delete cascade,
  strategy_id uuid not null references public.strategies (id),
  target_weight numeric not null check (target_weight > 0 and target_weight <= 100),
  created_at timestamptz not null default now(),
  unique (model_id, strategy_id)
);

-- Weights per model must sum to exactly 100 (Section 3). Deferred constraint
-- trigger: sleeves are written together in one request/transaction; a model
-- with zero sleeves is allowed (draft being assembled).
create or replace function public.check_model_sleeve_weights()
returns trigger
language plpgsql
as $$
declare
  mid uuid := coalesce(new.model_id, old.model_id);
  total numeric;
begin
  select coalesce(sum(target_weight), 0) into total
  from public.model_sleeves where model_id = mid;
  if total <> 0 and total <> 100 then
    raise exception 'model sleeves must sum to 100 (got %)', total;
  end if;
  return null;
end;
$$;

create constraint trigger model_sleeves_sum after insert or update or delete
  on public.model_sleeves
  deferrable initially deferred
  for each row execute function public.check_model_sleeve_weights();

-- ---------------------------------------------------------------------------
-- Proposals (Section 8): prospect proposals allowed (client_name inline)
-- ---------------------------------------------------------------------------
create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id),
  client_name text not null,
  salutation text not null,
  brief jsonb not null,
  model_id uuid references public.models (id),
  allocation jsonb not null,
  total_aum numeric not null check (total_aum > 0),
  currency char(3) not null default 'USD',
  risk_profile risk_profile not null,
  month_year text not null,
  status proposal_status not null default 'draft',
  version int not null default 1,
  supersedes_id uuid references public.proposals (id),
  pptx_path text,
  email_draft text,
  created_by uuid not null references public.users (id),
  approved_by uuid references public.users (id),
  approved_at timestamptz,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index proposals_client_idx on public.proposals (client_id);
create index proposals_status_idx on public.proposals (status, created_at desc);

-- Approved proposals are immutable (Section 8.5): once locked, content fields
-- can never change; only the status may move forward (approved -> sent ->
-- superseded) and pptx_path/email_draft may be backfilled by the render job
-- if missing. Unlocking is not possible.
create or replace function public.guard_locked_proposal()
returns trigger
language plpgsql
as $$
begin
  if old.locked then
    if new.locked = false then
      raise exception 'approved proposals cannot be unlocked';
    end if;
    if new.brief is distinct from old.brief
      or new.allocation is distinct from old.allocation
      or new.total_aum is distinct from old.total_aum
      or new.currency is distinct from old.currency
      or new.risk_profile is distinct from old.risk_profile
      or new.month_year is distinct from old.month_year
      or new.client_id is distinct from old.client_id
      or new.client_name is distinct from old.client_name
      or new.salutation is distinct from old.salutation
      or new.model_id is distinct from old.model_id
      or new.version is distinct from old.version
      or (old.pptx_path is not null and new.pptx_path is distinct from old.pptx_path)
      or (old.email_draft is not null and new.email_draft is distinct from old.email_draft)
    then
      raise exception 'proposal is locked (approved); edit creates a new version instead';
    end if;
    if new.status is distinct from old.status
      and not (
        (old.status = 'approved' and new.status in ('sent', 'superseded'))
        or (old.status = 'sent' and new.status = 'superseded')
      )
    then
      raise exception 'invalid status transition for a locked proposal';
    end if;
  end if;
  return new;
end;
$$;

create trigger proposals_locked_guard before update on public.proposals
  for each row execute function public.guard_locked_proposal();

create table public.proposal_flags (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  code text not null,
  severity flag_severity not null,
  message text not null,
  acknowledged_by uuid references public.users (id),
  acknowledged_at timestamptz,
  ack_reason text,
  created_at timestamptz not null default now(),
  -- acknowledging always requires a reason (Section 10)
  check ((acknowledged_by is null) = (ack_reason is null))
);
create index proposal_flags_proposal_idx on public.proposal_flags (proposal_id);

-- ---------------------------------------------------------------------------
-- Storage: private bucket for generated PPTX files
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('proposals', 'proposals', false)
on conflict (id) do nothing;

create policy proposals_bucket_read on storage.objects for select
  using (bucket_id = 'proposals' and public.current_user_is_active());

-- ---------------------------------------------------------------------------
-- updated_at touch triggers
-- ---------------------------------------------------------------------------
create trigger strategies_touch before update on public.strategies
  for each row execute function public.touch_updated_at();
create trigger models_touch before update on public.models
  for each row execute function public.touch_updated_at();
create trigger proposals_touch before update on public.proposals
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.strategies enable row level security;
alter table public.models enable row level security;
alter table public.model_sleeves enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_flags enable row level security;

create policy strategies_read on public.strategies for select using (public.current_user_is_active());
create policy models_read on public.models for select using (public.current_user_is_active());
create policy model_sleeves_read on public.model_sleeves for select using (public.current_user_is_active());
create policy proposals_read on public.proposals for select using (public.current_user_is_active());
create policy proposal_flags_read on public.proposal_flags for select using (public.current_user_is_active());

-- Strategies / models: admin only (Section 3)
create policy strategies_write on public.strategies for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');
create policy models_write on public.models for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');
create policy model_sleeves_write on public.model_sleeves for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- Proposals: advisor + admin
create policy proposals_write on public.proposals for all
  using (public.current_user_role() in ('advisor', 'admin'))
  with check (public.current_user_role() in ('advisor', 'admin'));
create policy proposal_flags_write on public.proposal_flags for all
  using (public.current_user_role() in ('advisor', 'admin'))
  with check (public.current_user_role() in ('advisor', 'admin'));

-- ---------------------------------------------------------------------------
-- Seed: strategy library (Section 8.2). Metrics are backtested simulations,
-- Jan 2008 (or noted start) through Dez 2025; every metrics slide says so.
-- Risk labels use plain hyphens (client text never uses em/en dashes).
-- ---------------------------------------------------------------------------
insert into public.strategies (key, name, kind, risk_label, metrics, instruments, description) values
  ('BOND', 'Bond Portfolio (UCITS ETFs)', 'built_in', null, null, null,
   'ETF table with YTW and maturity + duration chart. Instrument list pending Antonio (Open Item 5).'),
  ('CASH_SIGNAL', 'American Dream Cash Signal', 'built_in', null,
   '{"cagr": 8.23, "sharpe": 1.00, "max_dd": -9.24, "period": "Jan 2008 a Dez 2025"}', null,
   '4-phase cycle methodology with stat boxes.'),
  ('ENERGY', 'US Energy & Infrastructure', 'built_in', null, null, null,
   'Demand thesis + 3-tier composition.'),
  ('OURO', 'Gold', 'built_in', null, null, null,
   'In all summary tables; dedicated slide only if weight >= 15%.'),
  ('NEW_TRENDS', 'New Trends', 'static_model', 'Alto',
   '{"cagr": 18.00, "vol": 19.95, "max_dd": -35.42, "sharpe": 0.84, "period": "Jan 2008 a Dez 2025"}', null, null),
  ('GROWTH_DRIVEN', 'Growth Driven', 'static_model', 'Alto',
   '{"cagr": 12.91, "vol": 17.22, "max_dd": -46.62, "sharpe": 0.72, "period": "Jan 2008 a Dez 2025"}', null, null),
  ('GLOBAL_GROWTH', 'Global Growth', 'static_model', 'Alto',
   '{"cagr": 11.81, "vol": 15.81, "max_dd": -31.43, "sharpe": 0.70, "period": "Jan 2008 a Dez 2025"}', null, null),
  ('GROWTH_BALANCED', 'Growth Balanced', 'static_model', 'Moderado-Alto',
   '{"cagr": 10.14, "vol": 11.28, "max_dd": -28.53, "sharpe": 0.80, "period": "Jan 2008 a Dez 2025"}', null, null),
  ('FUNDAMENTALS', 'Fundamentals', 'static_model', 'Alto',
   '{"cagr": 9.86, "vol": 16.58, "max_dd": -52.28, "sharpe": 0.57, "period": "Jan 2008 a Dez 2025"}',
   '{"holdings": [{"symbol": "COWZ", "weight": 25}, {"symbol": "LRGF", "weight": 25}, {"symbol": "QUAL", "weight": 25}, {"symbol": "VTV", "weight": 25}]}', null),
  ('DIVIDENDS', 'Dividends', 'static_model', 'Moderado-Alto',
   '{"cagr": 9.09, "vol": 14.91, "max_dd": -46.14, "sharpe": 0.57, "period": "Jan 2008 a Dez 2025"}', null, null),
  ('FUNDAMENTALS_CONSERVATIVE', 'Fundamentals Conservative', 'static_model', 'Moderado',
   '{"cagr": 8.16, "vol": 10.68, "max_dd": -29.09, "sharpe": 0.67, "period": "Jan 2008 a Dez 2025"}', null, null),
  ('INTL_DIVERSIFIED', 'International Diversified', 'static_model', 'Moderado',
   '{"cagr": 7.97, "vol": 9.64, "max_dd": -24.89, "sharpe": 0.71, "period": "Jan 2008 a Dez 2025"}', null, null),
  ('DIVIDENDS_BALANCED', 'Dividends Balanced', 'static_model', 'Moderado',
   '{"cagr": 7.56, "vol": 10.16, "max_dd": -25.03, "sharpe": 0.64, "period": "Jan 2008 a Dez 2025"}', null, null),
  ('NEUTRAL', 'Neutral', 'static_model', 'Baixo-Moderado',
   '{"cagr": 6.95, "vol": 6.25, "max_dd": -13.03, "sharpe": 0.91, "period": "Jan 2008 a Dez 2025"}', null, null),
  ('REITS', 'REITs', 'static_model', 'Alto',
   '{"cagr": 5.99, "vol": 22.48, "max_dd": -63.53, "sharpe": 0.32, "period": "Jan 2008 a Dez 2025"}', null, null),
  ('INTL_LOW_VOL', 'International Low Volatility', 'static_model', 'Baixo-Moderado',
   '{"cagr": 5.96, "vol": 6.93, "max_dd": -18.85, "sharpe": 0.68, "period": "Jan 2008 a Dez 2025"}', null, null),
  ('REITS_BALANCED', 'REITs Balanced', 'static_model', 'Moderado-Alto',
   '{"cagr": 5.70, "vol": 14.02, "max_dd": -42.15, "sharpe": 0.37, "period": "Jan 2008 a Dez 2025"}', null, null);

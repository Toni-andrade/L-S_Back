-- Portfolio activity: period performance + movement decomposition per scope,
-- the "what happened" summary that anchors the advisor's client review.
-- Written by the sync (service role); read scoped like performance.

create type activity_period as enum ('trailing_30d', 'ytd', 'one_year');

create table public.portfolio_activity (
  id uuid primary key default gen_random_uuid(),
  scope perf_scope not null,            -- 'household' | 'client'
  scope_id uuid not null,
  as_of date not null,
  period activity_period not null,
  period_start date,
  twr numeric,                          -- time-weighted return, fraction
  change_in_value numeric,              -- total value change over the window, $
  percent_change numeric,               -- change in value, fraction
  net_flows numeric,                    -- net cash flow (inflow): + in, - out
  net_deposits numeric,
  income numeric,                       -- income / expenses
  dividends numeric,
  market_change numeric,                -- change_in_value - net_flows
  movers jsonb,                         -- [{ name, symbol, change }] gainers+losers
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope, scope_id, period, as_of)
);
create index portfolio_activity_scope_idx on public.portfolio_activity (scope, scope_id, as_of desc);

create trigger portfolio_activity_touch before update on public.portfolio_activity
  for each row execute function public.touch_updated_at();

alter table public.portfolio_activity enable row level security;

-- Read scoped to visible households/clients (mirrors performance_points).
create policy activity_read on public.portfolio_activity for select
  using (
    case scope
      when 'household' then public.user_can_see_household(scope_id)
      else public.user_can_see_client(scope_id)
    end
  );
-- No client write policy: only the sync (service role) writes activity.

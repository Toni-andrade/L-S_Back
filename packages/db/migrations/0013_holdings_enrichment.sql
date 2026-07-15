-- Enrich holdings for a complete x-ray: cost basis + unrealized gain,
-- per-position TWR (YTD / 1Y), and fixed-income analytics (maturity, coupon,
-- duration). All optional; populated by the sync when Addepar returns them.

alter table public.holdings
  add column cost_basis numeric,
  add column unrealized_gain numeric,
  add column twr_ytd numeric,
  add column twr_1y numeric,
  add column maturity_date date,
  add column coupon_rate numeric,
  add column modified_duration numeric;

create index holdings_maturity_idx on public.holdings (maturity_date)
  where maturity_date is not null;

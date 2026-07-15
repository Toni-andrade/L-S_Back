-- Income calendar: per-position projected income for the dividend / coupon
-- calendar and portfolio-yield analytics. income_per_unit is Addepar's
-- projected_annual_income (annual, per unit); annual income is
-- income_per_unit * quantity. income_frequency is dividends_per_year;
-- next_ex_date is the next ex-dividend date when the license exposes it.
-- All optional; populated by the sync when Addepar returns them.

alter table public.holdings
  add column income_per_unit numeric,
  add column income_frequency integer,
  add column next_ex_date date;

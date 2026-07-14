-- Proposals 2.0: reusable proposal templates + an option to include the
-- client's current portfolio (individual positions) as an appendix.

alter table public.proposals
  add column include_current_portfolio boolean not null default false;

create table public.proposal_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  risk_profile risk_profile,
  -- { strategies: [{ key, weight, riskLabel, returnSource, asOfDate }], notes }
  brief jsonb not null,
  active boolean not null default true,
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger proposal_templates_touch before update on public.proposal_templates
  for each row execute function public.touch_updated_at();

alter table public.proposal_templates enable row level security;

-- Read: all active internal users. Write: advisor + admin (same as proposals).
create policy proposal_templates_read on public.proposal_templates for select
  using (public.current_user_is_active());
create policy proposal_templates_write on public.proposal_templates for all
  using (public.current_user_role() in ('advisor', 'admin'))
  with check (public.current_user_role() in ('advisor', 'admin'));

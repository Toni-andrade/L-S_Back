-- AI briefing cache: one row per user + scope + day. advisor_daily rows are
-- the advisor's book brief (scope_key = user id); client_weekly rows cache a
-- per-portfolio weekly snapshot (scope_key = 'client:<id>' / 'household:<id>').
-- Content is a draft briefing; rows are personal (owner-only RLS).

create table public.ai_snapshots (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('advisor_daily', 'client_weekly')),
  scope_key text not null,
  as_of date not null,
  content text not null,
  model text,
  created_by uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, scope_key, as_of, created_by)
);
create index ai_snapshots_lookup_idx on public.ai_snapshots (created_by, kind, as_of desc);

create trigger ai_snapshots_touch before update on public.ai_snapshots
  for each row execute function public.touch_updated_at();

alter table public.ai_snapshots enable row level security;
create policy ai_snapshots_select on public.ai_snapshots for select
  using (created_by = auth.uid());
create policy ai_snapshots_insert on public.ai_snapshots for insert
  with check (created_by = auth.uid());
create policy ai_snapshots_update on public.ai_snapshots for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

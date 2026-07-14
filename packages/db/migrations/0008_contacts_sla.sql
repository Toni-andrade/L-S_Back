-- Client contact log (timeline) + configurable SLA policies measured against it.
-- Contacts are read/written scoped to the client's visibility (advisors only see
-- their clients). SLA policies are firm-wide, admin-editable, seeded with
-- sensible defaults.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type contact_type as enum ('call', 'email', 'meeting', 'review', 'note', 'task', 'other');
create type contact_direction as enum ('inbound', 'outbound', 'internal');
create type sla_kind as enum ('periodic_review', 'flag_response', 'onboarding_touch', 'request_response');

-- ---------------------------------------------------------------------------
-- Contacts (interaction log / timeline)
-- ---------------------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  type contact_type not null,
  direction contact_direction not null default 'outbound',
  occurred_at timestamptz not null default now(),
  subject text,
  notes text,
  logged_by uuid not null references public.users (id),
  follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_client_idx on public.contacts (client_id, occurred_at desc);
create index contacts_followup_idx on public.contacts (follow_up_at) where follow_up_at is not null;

create trigger contacts_touch before update on public.contacts
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- SLA policies (pre-established cadences, admin-editable)
-- ---------------------------------------------------------------------------
create table public.sla_policies (
  id uuid primary key default gen_random_uuid(),
  kind sla_kind not null,
  name text not null,
  threshold_days int not null check (threshold_days > 0),
  business_days boolean not null default false,
  -- {} = all clients; future segmentation e.g. {"risk_profile": ["agressivo"]}
  applies_to jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger sla_policies_touch before update on public.sla_policies
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.contacts enable row level security;
alter table public.sla_policies enable row level security;

-- Contacts: read/write scoped to the client's visibility; logged as self.
create policy contacts_read on public.contacts for select
  using (public.user_can_see_client(client_id));
create policy contacts_insert on public.contacts for insert
  with check (logged_by = auth.uid() and public.user_can_see_client(client_id));
create policy contacts_update on public.contacts for update
  using (logged_by = auth.uid() or public.current_user_role() = 'admin')
  with check (logged_by = auth.uid() or public.current_user_role() = 'admin');
create policy contacts_delete on public.contacts for delete
  using (logged_by = auth.uid() or public.current_user_role() = 'admin');

-- SLA policies: all active users read; admin writes.
create policy sla_read on public.sla_policies for select
  using (public.current_user_is_active());
create policy sla_write on public.sla_policies for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ---------------------------------------------------------------------------
-- Seed default SLA policies (admin-editable)
-- ---------------------------------------------------------------------------
-- Review cadence varies by risk profile (applies_to.risk_profile); the
-- fallback policy (applies_to {}) covers clients with no assigned profile.
insert into public.sla_policies (kind, name, threshold_days, business_days, applies_to) values
  ('periodic_review', 'Review - Agressivo (bi-monthly)', 60, false, '{"risk_profile": ["agressivo"]}'),
  ('periodic_review', 'Review - Moderado (quarterly)', 90, false, '{"risk_profile": ["moderado"]}'),
  ('periodic_review', 'Review - Conservador (semi-annual)', 180, false, '{"risk_profile": ["conservador"]}'),
  ('periodic_review', 'Review - default (quarterly)', 90, false, '{}'),
  ('onboarding_touch', 'Onboarding welcome contact', 7, false, '{}'),
  ('flag_response', 'Respond to blocking compliance flags', 5, true, '{}'),
  ('request_response', 'Respond to client requests', 3, true, '{}');

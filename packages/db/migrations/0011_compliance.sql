-- Compliance center: the firm's compliance calendar + registers (filings,
-- annual reviews, code-of-ethics attestations, personal trading, complaints,
-- gifts & entertainment). Admin/ops managed; every change audit-logged in-app.

create type compliance_kind as enum
  ('filing', 'attestation', 'review', 'complaint', 'gift', 'personal_trade', 'other');
create type compliance_status as enum ('open', 'in_progress', 'done', 'waived');

create table public.compliance_items (
  id uuid primary key default gen_random_uuid(),
  kind compliance_kind not null,
  title text not null,
  description text,
  due_date date,
  status compliance_status not null default 'open',
  recurring boolean not null default false,
  assigned_to uuid references public.users (id),
  client_id uuid references public.clients (id) on delete set null,
  details jsonb,
  created_by uuid references public.users (id),
  resolved_by uuid references public.users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index compliance_items_status_idx on public.compliance_items (status, due_date);

create trigger compliance_items_touch before update on public.compliance_items
  for each row execute function public.touch_updated_at();

alter table public.compliance_items enable row level security;

-- Read: all active internal users. Write: ops + admin.
create policy compliance_read on public.compliance_items for select
  using (public.current_user_is_active());
create policy compliance_write on public.compliance_items for all
  using (public.current_user_role() in ('ops', 'admin'))
  with check (public.current_user_role() in ('ops', 'admin'));

-- ---------------------------------------------------------------------------
-- Seed a starting compliance calendar (recurring firm obligations; dates are
-- placeholders for the compliance officer to confirm/adjust).
-- ---------------------------------------------------------------------------
insert into public.compliance_items (kind, title, description, due_date, recurring) values
  ('filing', 'Form ADV annual amendment',
   'Annual updating amendment, due within 90 days of fiscal year end.', '2027-03-31', true),
  ('review', 'Annual compliance program review',
   'Rule 206(4)-7 annual review of policies and procedures.', '2026-12-31', true),
  ('review', 'Form CRS / ADV Part 3 review',
   'Confirm relationship summary remains accurate.', '2027-03-31', true),
  ('attestation', 'Code of ethics annual attestation',
   'All access persons attest to the code of ethics and personal holdings.', '2027-01-31', true),
  ('attestation', 'Q3 personal securities report',
   'Quarterly personal securities transaction reports from access persons.', '2026-10-30', true),
  ('review', 'Books & records retention check',
   'Advisers Act Rule 204-2 retention review; confirm exports and archives.', '2026-12-31', true);

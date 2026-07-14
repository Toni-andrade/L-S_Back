-- Per-user data-access scoping.
--
-- New model (replaces "every active user reads all client data"):
--   admin / ops  -> firmwide read of all client & portfolio data
--   advisor      -> only households/accounts granted by an admin, PLUS their
--                   own book (clients.advisor_id / households.primary_advisor_id)
--
-- Enforced in Postgres via SELECT policies calling SECURITY DEFINER predicate
-- functions (definer rights bypass RLS, so the predicates can query the same
-- tables without recursion). Writes are unchanged (still advisor + admin).
-- Assignment tables are admin-managed; users may read their own grants.

-- ---------------------------------------------------------------------------
-- Assignment tables
-- ---------------------------------------------------------------------------
create table public.user_household_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  granted_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  unique (user_id, household_id)
);
create index user_household_grants_user_idx on public.user_household_grants (user_id);

create table public.user_account_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  granted_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  unique (user_id, account_id)
);
create index user_account_grants_user_idx on public.user_account_grants (user_id);

-- ---------------------------------------------------------------------------
-- Visibility predicates (SECURITY DEFINER: bypass RLS to avoid recursion)
-- ---------------------------------------------------------------------------

-- admin + ops read everything; short-circuits every predicate below.
create or replace function public.current_user_sees_all()
returns boolean language sql security definer stable set search_path = public as $$
  select public.current_user_role() in ('admin', 'ops');
$$;

create or replace function public.user_can_see_household(hid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.current_user_sees_all()
    or exists (
      select 1 from public.user_household_grants g
      where g.user_id = auth.uid() and g.household_id = hid
    )
    or exists (
      select 1 from public.households h
      where h.id = hid and h.primary_advisor_id = auth.uid()
    );
$$;

create or replace function public.user_can_see_client(cid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.current_user_sees_all()
    or exists (
      select 1 from public.clients c
      where c.id = cid and c.advisor_id = auth.uid()
    )
    or exists (
      select 1 from public.clients c
      where c.id = cid and c.household_id is not null
        and public.user_can_see_household(c.household_id)
    )
    or exists (
      select 1 from public.user_account_grants g
      join public.accounts a on a.id = g.account_id
      where g.user_id = auth.uid() and a.client_id = cid
    );
$$;

create or replace function public.user_can_see_account(aid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.current_user_sees_all()
    or exists (
      select 1 from public.user_account_grants g
      where g.user_id = auth.uid() and g.account_id = aid
    )
    or exists (
      select 1 from public.accounts a
      where a.id = aid and public.user_can_see_client(a.client_id)
    );
$$;

-- ---------------------------------------------------------------------------
-- Replace firmwide-read SELECT policies with scoped ones
-- (snapshots + sync_jobs stay firm-level: they carry no client identity;
--  the sensitive rows are holdings/transactions, which are scoped by account)
-- ---------------------------------------------------------------------------
drop policy households_read on public.households;
create policy households_read on public.households for select
  using (public.user_can_see_household(id));

drop policy clients_read on public.clients;
create policy clients_read on public.clients for select
  using (public.user_can_see_client(id));

drop policy accounts_read on public.accounts;
create policy accounts_read on public.accounts for select
  using (public.user_can_see_account(id));

drop policy holdings_read on public.holdings;
create policy holdings_read on public.holdings for select
  using (public.user_can_see_account(account_id));

drop policy transactions_read on public.transactions;
create policy transactions_read on public.transactions for select
  using (public.user_can_see_account(account_id));

drop policy performance_read on public.performance_points;
create policy performance_read on public.performance_points for select
  using (
    case scope
      when 'household' then public.user_can_see_household(scope_id)
      else public.user_can_see_client(scope_id)
    end
  );

drop policy reviews_read on public.portfolio_reviews;
create policy reviews_read on public.portfolio_reviews for select
  using (
    case scope
      when 'household' then public.user_can_see_household(scope_id)
      else public.user_can_see_client(scope_id)
    end
  );

-- Reviews may only be recorded for a portfolio the user can see.
drop policy reviews_insert on public.portfolio_reviews;
create policy reviews_insert on public.portfolio_reviews for insert
  with check (
    reviewed_by = auth.uid()
    and case scope
      when 'household' then public.user_can_see_household(scope_id)
      else public.user_can_see_client(scope_id)
    end
  );

drop policy flags_read on public.portfolio_flags;
create policy flags_read on public.portfolio_flags for select
  using (
    case scope
      when 'household' then public.user_can_see_household(scope_id)
      else public.user_can_see_client(scope_id)
    end
  );

-- Acknowledging a flag also requires visibility of its scope.
drop policy flags_ack on public.portfolio_flags;
create policy flags_ack on public.portfolio_flags for update
  using (
    case scope
      when 'household' then public.user_can_see_household(scope_id)
      else public.user_can_see_client(scope_id)
    end
  )
  with check (
    case scope
      when 'household' then public.user_can_see_household(scope_id)
      else public.user_can_see_client(scope_id)
    end
  );

-- ---------------------------------------------------------------------------
-- RLS on the assignment tables
-- ---------------------------------------------------------------------------
alter table public.user_household_grants enable row level security;
alter table public.user_account_grants enable row level security;

create policy uhg_admin on public.user_household_grants for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');
create policy uhg_read_own on public.user_household_grants for select
  using (user_id = auth.uid() or public.current_user_role() = 'admin');

create policy uag_admin on public.user_account_grants for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');
create policy uag_read_own on public.user_account_grants for select
  using (user_id = auth.uid() or public.current_user_role() = 'admin');

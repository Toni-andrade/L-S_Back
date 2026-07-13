-- Phase 0: users mirror, email allowlist, append-only audit log.
-- RLS on every table; audit_log has no update/delete path for any client role.

create extension if not exists pgcrypto;

create type user_role as enum ('advisor', 'ops', 'admin');

-- ---------------------------------------------------------------------------
-- users: mirrors auth.users via trigger. New signups land inactive until an
-- admin activates them (allowed_emails.preset_* can pre-approve, used for seed).
-- ---------------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  name text not null default '',
  role user_role not null default 'advisor',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.allowed_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  preset_role user_role,
  preset_active boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);

create table public.allowed_domains (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique check (domain = lower(domain)),
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  at timestamptz not null default now(),
  ip inet
);

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, at desc);

-- ---------------------------------------------------------------------------
-- updated_at touch trigger, reused by every table that has updated_at
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_touch_updated_at
  before update on public.users
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Allowlist enforcement + mirror, on auth.users insert.
-- Signup is rejected at the database unless the email is explicitly allowed
-- or its domain is allowed. The app layer enforces the same rule with
-- ALLOWED_EMAIL_DOMAIN before calling signUp (defense in depth).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(new.email);
  v_domain text := split_part(lower(new.email), '@', 2);
  v_allow allowed_emails%rowtype;
  v_domain_ok boolean;
begin
  select * into v_allow from allowed_emails where email = v_email;
  select exists (select 1 from allowed_domains where domain = v_domain) into v_domain_ok;

  if v_allow.id is null and not v_domain_ok then
    raise exception 'signup not allowed for %', v_email
      using errcode = 'P0001';
  end if;

  insert into public.users (id, email, name, role, active)
  values (
    new.id,
    v_email,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(v_allow.preset_role, 'advisor'),
    coalesce(v_allow.preset_active, false)
  );

  insert into public.audit_log (actor_id, action, entity_type, entity_id, after)
  values (new.id, 'user.signup', 'users', new.id,
          jsonb_build_object('email', v_email, 'active', coalesce(v_allow.preset_active, false)));

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Role helpers (security definer, so RLS policies never self-recurse on users)
-- ---------------------------------------------------------------------------
create or replace function public.current_user_role()
returns user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from public.users where id = auth.uid() and active;
$$;

create or replace function public.current_user_is_active()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select active from public.users where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.allowed_emails enable row level security;
alter table public.allowed_domains enable row level security;
alter table public.audit_log enable row level security;

-- users: any user can see their own row (needed pre-activation for the
-- "pending activation" screen); active internal users read everyone;
-- only admins write. Inserts happen via the security-definer trigger only.
create policy users_select_self on public.users
  for select using (id = auth.uid());

create policy users_select_internal on public.users
  for select using (public.current_user_is_active());

create policy users_update_admin on public.users
  for update using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy users_delete_admin on public.users
  for delete using (public.current_user_role() = 'admin');

-- allowlist tables: admin only
create policy allowed_emails_admin on public.allowed_emails
  for all using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy allowed_domains_admin on public.allowed_domains
  for all using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- audit_log: append-only. Active users insert; admins read; nobody updates or
-- deletes (no policy AND explicit revoke, so even a future permissive policy
-- addition cannot silently re-enable it for the standard roles).
create policy audit_log_insert on public.audit_log
  for insert with check (public.current_user_is_active() and actor_id = auth.uid());

create policy audit_log_select_admin on public.audit_log
  for select using (public.current_user_role() = 'admin');

revoke update, delete on public.audit_log from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed: initial admin allowlist entry (activates as admin on first signup)
-- ---------------------------------------------------------------------------
insert into public.allowed_emails (email, preset_role, preset_active, note)
values ('grupoaaj.aa@gmail.com', 'admin', true, 'Initial admin (Phase 0 seed)');

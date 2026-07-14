-- Client document store (KYC, agreements, statements, tax, correspondence).
-- Files live in a private Storage bucket; the documents table is the index and
-- carries the RLS. Downloads go through short-lived signed URLs.

create type document_category as enum
  ('kyc', 'agreement', 'statement', 'tax', 'correspondence', 'proposal', 'other');

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete cascade,
  category document_category not null default 'other',
  name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid not null references public.users (id),
  created_at timestamptz not null default now()
);
create index documents_client_idx on public.documents (client_id, created_at desc);

alter table public.documents enable row level security;

-- Read: active users; firm-level docs (no client) visible to all, client docs
-- scoped to the client's visibility.
create policy documents_read on public.documents for select
  using (
    public.current_user_is_active()
    and (client_id is null or public.user_can_see_client(client_id))
  );
create policy documents_insert on public.documents for insert
  with check (
    uploaded_by = auth.uid()
    and (client_id is null or public.user_can_see_client(client_id))
  );
create policy documents_delete on public.documents for delete
  using (uploaded_by = auth.uid() or public.current_user_role() = 'admin');

-- Private bucket for the files.
insert into storage.buckets (id, name, public)
values ('client-documents', 'client-documents', false)
on conflict (id) do nothing;

create policy client_docs_read on storage.objects for select
  using (bucket_id = 'client-documents' and public.current_user_is_active());

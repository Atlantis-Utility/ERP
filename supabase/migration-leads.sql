-- Sales leads: discovered via Azure Maps search and/or imported from a
-- LinkedIn Sales Navigator CSV export, then worked manually (POC, company
-- size, status, notes). Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists leads (
  id         text primary key,
  status     text not null default 'new', -- new | contacted | qualified | unqualified | converted
  updated_at timestamptz not null default now(),
  data       jsonb not null default '{}'
);

create index if not exists leads_status_idx on leads (status);

alter table leads enable row level security;

drop policy if exists "authenticated read/write" on leads;
create policy "authenticated read/write" on leads
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

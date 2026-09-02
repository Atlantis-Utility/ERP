-- Per-lead notes/activity thread: private to the author by default, shared
-- with specific teammates via recipient_ids inside the jsonb payload (same
-- model as the personal `notes` table). Run once in the Supabase SQL editor.
-- Safe to re-run.

create table if not exists lead_notes (
  id         text primary key,
  updated_at timestamptz not null default now(),
  data       jsonb not null default '{}'
);

create index if not exists lead_notes_lead_id_idx on lead_notes (((data->>'leadId')));

alter table lead_notes enable row level security;

drop policy if exists "authenticated read/write" on lead_notes;
create policy "authenticated read/write" on lead_notes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Support contacts for the vendors we buy from (ISPs, carriers, hardware and
-- software suppliers) — the "Contacts" tab on the Quick Access page. Shared
-- company data, not per-user: everyone reads it, admins edit it (enforced in
-- the UI, same as the rest of the app; the policy below just requires an
-- authenticated session). Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists vendor_contacts (
  id         text primary key,
  updated_at timestamptz not null default now(),
  data       jsonb not null default '{}'
);

create index if not exists vendor_contacts_company_idx on vendor_contacts (((data->>'company')));
create index if not exists vendor_contacts_category_idx on vendor_contacts (((data->>'category')));

alter table vendor_contacts enable row level security;

drop policy if exists "authenticated read/write" on vendor_contacts;
create policy "authenticated read/write" on vendor_contacts
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ── Live ─────────────────────────────────────────────────────────────────
-- Missing from the start, and the Quick Access contacts tab syncs through
-- the same realtime subscription every other table does: without this, a
-- vendor saved with two contacts on it went to the database and the card on
-- screen never changed, which reads as "it didn't save".
--
-- The tab no longer waits on this for its own saves - it refetches when it
-- writes - but a second person looking at the same page still needs it.
do $$
begin
  begin alter publication supabase_realtime add table vendor_contacts; exception when duplicate_object then null; end;
end $$;

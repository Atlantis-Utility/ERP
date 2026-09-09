-- Equipment + SIM inventory: everything we hold that isn't currently earning
-- for a customer — spare T-Mobile 5G backup routers, unassigned SIM cards,
-- gear pulled back from a cancelled site. Keeping it here means the unused
-- stock is on our DB instead of a spreadsheet or someone's memory.
--
-- Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists inventory_items (
  id         text primary key,
  -- sim | router | gateway | switch | ap | phone | antenna | accessory | other
  category   text not null default 'other',
  -- in_stock | assigned | deployed | returned | retired
  status     text not null default 'in_stock',
  updated_at timestamptz not null default now(),
  data       jsonb not null default '{}'
);

create index if not exists inventory_items_status_idx   on inventory_items (status);
create index if not exists inventory_items_category_idx on inventory_items (category);

alter table inventory_items enable row level security;

drop policy if exists "authenticated read/write" on inventory_items;
create policy "authenticated read/write" on inventory_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

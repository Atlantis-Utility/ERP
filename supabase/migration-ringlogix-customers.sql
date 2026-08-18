-- Cached snapshot of the RingLogix reseller portal customer list, kept fresh
-- by a Vercel cron job (app/api/cron/ringlogix-sync) every 3 hours instead of
-- scraping the portal live on every page load.
-- Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists ringlogix_customers (
  id           text primary key, -- RingLogix customer/domain id
  parent_id    text,
  company      text,
  contact      text,
  email        text,
  phone        text,
  status       text,
  balance      text,
  credit_limit text,
  synced_at    timestamptz not null default now() -- rows older than the latest sync run are pruned (customer no longer on the portal)
);

alter table ringlogix_customers enable row level security;

drop policy if exists "authenticated read/write" on ringlogix_customers;
create policy "authenticated read/write" on ringlogix_customers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

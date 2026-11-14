-- What was sent to customers, and by whom.
--
-- The app sends these from Quick Access -> Email customers. Without a record
-- there is no answer to "did we tell them about the outage, and when" three
-- weeks later, which is exactly when somebody asks.
--
-- app/api/broadcast/route.ts writes to this best-effort: a send that already
-- happened is not undone by a log that didn't, so the feature works before
-- this migration is applied and starts keeping history once it is.

create table if not exists public.broadcasts (
  id               uuid primary key default gen_random_uuid(),
  sent_at          timestamptz not null default now(),
  subject          text not null,
  -- outage | maintenance | restored | news | promotion | custom
  kind             text not null default 'custom',
  headline         text not null default '',
  body             text not null default '',
  recipient_count  integer not null default 0,
  -- The addresses it actually went to, so "was this customer told" is a
  -- question the table can answer.
  recipients       jsonb not null default '[]'::jsonb,
  sent_by          text not null default '',
  sent_by_name     text not null default ''
);

create index if not exists broadcasts_sent_at_idx on public.broadcasts (sent_at desc);

alter table public.broadcasts enable row level security;

-- Readable by anyone signed in: knowing what the company told customers is
-- not sensitive, and it stops two people sending the same notice twice.
-- Writes come from the service role in the API route, never the browser.
drop policy if exists "broadcasts readable by authenticated" on public.broadcasts;
create policy "broadcasts readable by authenticated"
  on public.broadcasts for select
  to authenticated
  using (true);

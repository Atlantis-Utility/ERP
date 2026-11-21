-- What we know about a text conversation that RingLogix doesn't.
--
-- The PBX stores the messages and the read flag, and nothing else: there
-- is nowhere in it to write "this one is about a billing dispute" or "Cyril
-- is handling it". That context is the difference between a list of texts
-- and a shared inbox, and it belongs to us rather than to the carrier.
--
-- Keyed by RingLogix's session id, so a row here attaches to a thread
-- without copying any of its messages. Nothing in this table is required:
-- a conversation with no row behaves exactly as it did before.
--
-- Read/unread deliberately lives in the PBX instead (messagesession/update,
-- which works), so marking something read here also marks it read in Teams
-- rather than leaving two inboxes disagreeing.
--
-- Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists public.message_threads (
  -- RingLogix's conversation id.
  session_id   text primary key,
  domain       text not null default '',
  notes        text not null default '',
  -- Keys from MESSAGE_TAGS in lib/message-tags.ts, not free text: a tag
  -- somebody invents is a tag nobody else can filter by.
  tags         text[] not null default '{}',
  updated_at   timestamptz not null default now(),
  updated_by   text not null default ''
);

create index if not exists message_threads_updated_idx
  on public.message_threads (updated_at desc);

alter table public.message_threads enable row level security;

-- Company-wide context, like the rest of the shared inbox: anyone signed
-- in can read it and write it. The sensitive thing here is the messages,
-- and those are not in this table.
drop policy if exists "message threads readable by authenticated" on public.message_threads;
create policy "message threads readable by authenticated"
  on public.message_threads for select to authenticated using (true);

drop policy if exists "message threads writable by authenticated" on public.message_threads;
create policy "message threads writable by authenticated"
  on public.message_threads for all to authenticated using (true) with check (true);

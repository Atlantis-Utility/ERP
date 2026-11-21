-- Who actually pressed send.
--
-- A text goes out from the extension that owns the conversation, because
-- that is what decides which of our numbers the customer sees. Four people
-- share 805-658-2329, which lives on extension 100 - so RingLogix records
-- every reply as Balijinder's, whoever typed it. That is right for the
-- carrier and wrong for us: on our own system it should say who sent it.
--
-- RingLogix hands back the message's id when it accepts the send, and that
-- is the same id the message carries when read back (verified), so the
-- person can be attached to the exact message rather than guessed at from
-- the text and the clock.
--
-- Only messages sent from the ERP appear here. One sent from Teams or a
-- handset has no row, and falls back to the extension's owner - which is
-- the best anybody can say about it.
--
-- Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists public.message_senders (
  -- RingLogix's message id, e.g. "m-6b0143c4c9cb4".
  message_id   text primary key,
  session_id   text not null default '',
  sent_by_name text not null default '',
  sent_by_email text not null default '',
  sent_at      timestamptz not null default now()
);

create index if not exists message_senders_session_idx
  on public.message_senders (session_id);

alter table public.message_senders enable row level security;

-- Readable by anyone signed in, which is the whole point: the desk needs
-- to see who replied. Written only by the service role inside the send
-- route, never by the browser - nobody gets to claim somebody else's
-- message.
drop policy if exists "message senders readable by authenticated" on public.message_senders;
create policy "message senders readable by authenticated"
  on public.message_senders for select to authenticated using (true);

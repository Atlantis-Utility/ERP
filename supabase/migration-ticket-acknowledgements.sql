-- Which ticket threads have had the automatic "we have your request" reply.
--
-- The real test is the thread itself: a conversation holding a message from
-- us has been answered, and lib/tickets/acknowledge.ts checks exactly that.
-- What a thread read cannot do is settle a race. Two sweeps running at the
-- same moment - two serverless instances, two people opening Tickets - both
-- ask Graph, are both told the thread is unanswered, and both reply. The
-- in-process throttle is per instance, and a message Graph has just sent
-- takes a moment to appear in the conversation.
--
-- A primary key settles it: whoever inserts the row first sends, the other
-- is told the row already exists and stops. The claim is taken immediately
-- before the send and deleted again if the send fails, so a failure is
-- retried rather than silently recorded as done.
--
-- Secondarily it answers "did we ever acknowledge this customer, and when",
-- which otherwise only Sent Items knows.
--
-- Run once in the Supabase SQL editor. Safe to re-run. Until it is applied
-- the sweep falls back to the thread check alone (it logs that it has) -
-- one acknowledgement too many is bad, none at all is worse.

create table if not exists public.ticket_acknowledgements (
  -- The Graph conversationId: the thread, not the message. One
  -- acknowledgement per conversation, however many times they write in.
  conversation_id  text primary key,
  acknowledged_at  timestamptz not null default now(),
  to_address       text not null default '',
  subject          text not null default '',
  -- The message replied to, for tracing one back to the mailbox.
  message_id       text not null default ''
);

create index if not exists ticket_acknowledgements_at_idx
  on public.ticket_acknowledgements (acknowledged_at desc);

alter table public.ticket_acknowledgements enable row level security;

-- Readable by anyone signed in: it is a record of what the company sent.
-- Writes come from the service role inside the sweep, never the browser.
drop policy if exists "ticket acks readable by authenticated" on public.ticket_acknowledgements;
create policy "ticket acks readable by authenticated"
  on public.ticket_acknowledgements for select
  to authenticated
  using (true);

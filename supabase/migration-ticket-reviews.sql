-- Post-close "how did we do" review requests: sent by
-- app/api/tickets/manual/[id]/review-request when a manual ticket is closed,
-- answered via the public app/feedback/[token] page.
-- Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists ticket_reviews (
  token          text primary key, -- unguessable id used in the public feedback link, doubles as the row's access credential
  ticket_id      text not null,
  customer_name  text,
  customer_email text,
  subject        text,
  rating         int,
  feedback       text, -- free-text "how can we improve" answer, only collected when rating < 5
  status         text not null default 'sent', -- sent | rated | completed
  clicked_google boolean not null default false,
  created_at     timestamptz not null default now(),
  responded_at   timestamptz
);

alter table ticket_reviews enable row level security;
-- No client-side policy: only accessed server-side via the service-role key
-- (app/api/tickets/manual/[id]/review-request and app/api/feedback/[token]),
-- which bypasses RLS entirely. The public feedback page never talks to
-- Supabase directly.

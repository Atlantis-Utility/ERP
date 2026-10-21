-- Vault outside links: who opened what, and when.
--
-- A link that was sent says nothing about whether anyone looked at it.
-- Each of the three things a recipient does is recorded with its time and
-- the device it came from:
--
--   email_opened    the email was displayed (a 1x1 image in it was loaded)
--   link_opened     the link was followed and the page loaded
--   details_viewed  they clicked through and the credential was shown
--
-- email_opened is the soft one. Apple Mail and Gmail fetch images through
-- their own proxies, sometimes before the person reads anything, and
-- Outlook blocks images until asked; so an open can be early or missing.
-- The other two are the browser doing it.
--
-- Rows are written only by the public routes with the service key (there
-- is no insert policy), and read by the entry's owner or an admin.
--
-- Run once in the Supabase SQL editor, after
-- migration-vault-external-shares.sql. Safe to re-run.

create table if not exists vault_external_share_events (
  id          uuid primary key default gen_random_uuid(),
  share_id    uuid not null references vault_external_shares(id) on delete cascade,
  kind        text not null check (kind in ('email_opened', 'link_opened', 'details_viewed')),
  at          timestamptz not null default now(),
  ip          text,
  user_agent  text
);

create index if not exists vault_external_share_events_share_idx on vault_external_share_events (share_id, at);

alter table vault_external_share_events enable row level security;

drop policy if exists "owner or admin can read share events" on vault_external_share_events;
create policy "owner or admin can read share events" on vault_external_share_events
  for select using (
    is_admin()
    or exists (
      select 1
      from vault_external_shares s
      join vault_entries e on e.id = s.entry_id
      where s.id = share_id and e.owner_uid = auth.uid() and vault_is_unlocked()
    )
  );

-- "Email me when they open it", chosen per link when it's sent.
alter table vault_external_shares add column if not exists notify_owner boolean not null default true;
-- So the notification goes out once, on the first view, not on every one.
alter table vault_external_shares add column if not exists owner_notified_at timestamptz;
-- The sender's zone, so that notification says "2:14 PM PDT" in their terms.
alter table vault_external_shares add column if not exists sender_time_zone text;

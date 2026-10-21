-- Vault: share a credential with someone outside the organisation.
--
-- The owner names an email address and how long the link should live; the
-- recipient gets an email with a link, opens it, and sees the credential on
-- a page in the app's own look. No account, no sign-in: the link is the
-- credential, so it expires, can be capped to a number of views, and can be
-- revoked at any point.
--
-- Only a SHA-256 of the link's token is stored. The token itself exists in
-- the email and in the owner's browser for the moment after creating it,
-- so a leaked copy of this table opens nothing.
--
-- The secret is not copied here. The page decrypts the entry's current
-- password when the recipient opens it, so there is exactly one encrypted
-- copy, and deleting the entry takes every outside link with it.
--
-- Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists vault_external_shares (
  id               uuid primary key default gen_random_uuid(),
  entry_id         uuid not null references vault_entries(id) on delete cascade,
  token_hash       text not null unique,
  recipient_email  text not null,
  recipient_name   text,
  message          text,
  include_notes    boolean not null default false,
  expires_at       timestamptz not null,
  max_views        int check (max_views is null or max_views > 0),
  view_count       int not null default 0,
  last_viewed_at   timestamptz,
  created_by_uid   uuid not null references auth.users(id),
  created_at       timestamptz not null default now(),
  revoked_at       timestamptz,
  revoked_by_uid   uuid references auth.users(id)
);

create index if not exists vault_external_shares_entry_idx on vault_external_shares (entry_id, created_at desc);

alter table vault_external_shares enable row level security;

-- The owner (with their vault unlocked) or an admin manages outside links.
-- The recipient never touches this table directly: the public page reads
-- it through a server route with the service key, by token hash.
drop policy if exists "owner or admin can read external shares" on vault_external_shares;
create policy "owner or admin can read external shares" on vault_external_shares
  for select using (
    is_admin()
    or exists (
      select 1 from vault_entries e
      where e.id = entry_id and e.owner_uid = auth.uid() and vault_is_unlocked()
    )
  );

drop policy if exists "owner or admin can create external shares" on vault_external_shares;
create policy "owner or admin can create external shares" on vault_external_shares
  for insert with check (
    created_by_uid = auth.uid()
    and (
      is_admin()
      or exists (
        select 1 from vault_entries e
        where e.id = entry_id and e.owner_uid = auth.uid() and vault_is_unlocked()
      )
    )
  );

-- Revoking is an update (revoked_at), so the history of who was sent what
-- stays visible after the link stops working.
drop policy if exists "owner or admin can revoke external shares" on vault_external_shares;
create policy "owner or admin can revoke external shares" on vault_external_shares
  for update using (
    is_admin()
    or exists (
      select 1 from vault_entries e
      where e.id = entry_id and e.owner_uid = auth.uid() and vault_is_unlocked()
    )
  ) with check (
    is_admin()
    or exists (
      select 1 from vault_entries e
      where e.id = entry_id and e.owner_uid = auth.uid() and vault_is_unlocked()
    )
  );

-- Delete is only used to take back a link whose email never went out
-- (app/api/vault/[id]/external-shares). Anything that was sent is revoked
-- instead, above, so it stays on record.
drop policy if exists "owner or admin can delete external shares" on vault_external_shares;
create policy "owner or admin can delete external shares" on vault_external_shares
  for delete using (
    is_admin()
    or exists (
      select 1 from vault_entries e
      where e.id = entry_id and e.owner_uid = auth.uid() and vault_is_unlocked()
    )
  );

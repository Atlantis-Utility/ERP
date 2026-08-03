-- Vault rework: per-employee ownership, sharing, and a passkey unlock gate.
-- Run this once in the Supabase SQL editor against your EXISTING project
-- (schema.sql has also been updated so a fresh install includes this).
--
-- Safe to re-run: every statement below is idempotent (IF NOT EXISTS /
-- CREATE OR REPLACE / DROP ... IF EXISTS before CREATE).

-- ── vault_entries: add ownership ────────────────────────────────────────
alter table vault_entries add column if not exists owner_uid uuid references auth.users(id);

-- Backfill: attribute existing rows to whoever created them, resolved via
-- their logged email → user_profiles.uid. Anything left NULL (creator's
-- account no longer exists, or created_by wasn't a real login) stays
-- admin-only until an admin reassigns/recreates it, we don't guess.
update vault_entries ve
set owner_uid = up.uid
from user_profiles up
where ve.owner_uid is null and up.email = ve.created_by;

-- ── vault_shares: per-entry access grants ───────────────────────────────
create table if not exists vault_shares (
  id             uuid primary key default gen_random_uuid(),
  entry_id       uuid not null references vault_entries(id) on delete cascade,
  grantee_uid    uuid not null references auth.users(id) on delete cascade,
  granted_by_uid uuid not null references auth.users(id),
  granted_at     timestamptz not null default now(),
  unique (entry_id, grantee_uid)
);

-- ── vault_passkeys: per-employee unlock gate ────────────────────────────
-- passkey_hash/passkey_salt: scrypt, never the raw passkey. Nullable, a row
-- can exist before any passkey has ever been set (e.g. right after a fresh
-- Microsoft re-verification, before the "create your passkey" step).
-- unlocked_until is the live "vault is open in this session" state;
-- failed_attempts/locked_until implement a simple brute-force backoff.
-- ms_verified_until is a short-lived flag set by /auth/callback right after
-- the employee re-completes Microsoft sign-in, required to create a
-- passkey for the first time or to reset a forgotten one, since neither of
-- those can be gated by "knows the current passkey".
create table if not exists vault_passkeys (
  uid                uuid primary key references auth.users(id) on delete cascade,
  passkey_hash       text,
  passkey_salt       text,
  failed_attempts    int not null default 0,
  locked_until       timestamptz,
  unlocked_until     timestamptz,
  ms_verified_until  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table vault_shares   enable row level security;
alter table vault_passkeys enable row level security;

-- True only while the caller's own vault is currently unlocked, mirrors
-- (and backstops at the DB layer) the app-level requireVaultUnlocked() gate.
create or replace function vault_is_unlocked() returns boolean
language sql stable
as $$
  select exists (
    select 1 from vault_passkeys
    where uid = auth.uid()
      and unlocked_until is not null
      and unlocked_until > now()
  );
$$;

create or replace function vault_has_share(p_entry_id uuid) returns boolean
language sql stable
as $$
  select exists (
    select 1 from vault_shares where entry_id = p_entry_id and grantee_uid = auth.uid()
  );
$$;

drop policy if exists "admin only" on vault_entries;

-- Read: admin (no unlock needed, recovery/offboarding override), or the
-- owner/a grantee with their own vault currently unlocked.
create policy "owner, grantee, or admin can read" on vault_entries
  for select using (
    is_admin()
    or (owner_uid = auth.uid() and vault_is_unlocked())
    or (vault_has_share(id) and vault_is_unlocked())
  );

-- Write: owner or admin only, grantees get read/reveal, never edit.
-- Unlock is required for the owner's own write, not for an admin override.
create policy "owner or admin can insert" on vault_entries
  for insert with check (
    is_admin() or (owner_uid = auth.uid() and vault_is_unlocked())
  );
create policy "owner or admin can update" on vault_entries
  for update using (
    is_admin() or (owner_uid = auth.uid() and vault_is_unlocked())
  ) with check (
    is_admin() or (owner_uid = auth.uid() and vault_is_unlocked())
  );
create policy "owner or admin can delete" on vault_entries
  for delete using (
    is_admin() or (owner_uid = auth.uid() and vault_is_unlocked())
  );

-- vault_shares: visible to the entry's owner, any existing grantee (so
-- "who else has access" is visible to the people it's shared with, per
-- design), or admin. Only the owner/admin may grant or revoke.
create policy "owner, grantee, or admin can read shares" on vault_shares
  for select using (
    is_admin()
    or exists (select 1 from vault_entries e where e.id = entry_id and e.owner_uid = auth.uid())
    or vault_has_share(entry_id)
  );
create policy "owner or admin can grant" on vault_shares
  for insert with check (
    is_admin()
    or exists (
      select 1 from vault_entries e
      where e.id = entry_id and e.owner_uid = auth.uid() and vault_is_unlocked()
    )
  );
create policy "owner or admin can revoke" on vault_shares
  for delete using (
    is_admin()
    or exists (
      select 1 from vault_entries e
      where e.id = entry_id and e.owner_uid = auth.uid() and vault_is_unlocked()
    )
  );

-- vault_passkeys: everyone manages only their own row; admins may read
-- (status only, app layer never returns hash/salt to the client) and may
-- delete anyone's row (the "reset a forgotten passkey" recovery path).
create policy "self or admin can read passkey" on vault_passkeys
  for select using (uid = auth.uid() or is_admin());
create policy "self can create own passkey" on vault_passkeys
  for insert with check (uid = auth.uid());
create policy "self or admin can update passkey" on vault_passkeys
  for update using (uid = auth.uid() or is_admin()) with check (uid = auth.uid() or is_admin());
create policy "admin can reset passkey" on vault_passkeys
  for delete using (is_admin());

alter publication supabase_realtime add table vault_shares;

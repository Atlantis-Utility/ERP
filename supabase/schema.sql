-- Atlantis ERP, Supabase schema
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query) against a fresh project.

create extension if not exists "pgcrypto";

-- ── Tables ───────────────────────────────────────────────────────────────

create table employees (
  id     text primary key,
  name   text not null,
  email  text,
  status text,
  data   jsonb not null default '{}'
);

create table projects (
  id     text primary key,
  name   text not null,
  status text,
  data   jsonb not null default '{}'
);

create table tasks ( -- was Firestore "kanban_cards"
  id       text primary key,
  due_date date,
  data     jsonb not null default '{}'
);

create table tickets ( -- email-ticket metadata overlay (status/priority/assignee)
  id            text primary key,
  status        text,
  priority      text,
  assignee_id   text,
  assignee_name text,
  notes         text,
  updated_at    timestamptz not null default now()
);

create table manual_tickets (
  id             uuid primary key default gen_random_uuid(),
  ticket_number  int not null,
  source         text not null,
  subject        text not null,
  description    text not null,
  customer_name  text not null,
  customer_email text,
  customer_phone text,
  status         text not null,
  priority       text not null,
  assignee_id    text,
  assignee_name  text,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table ticket_sync ( -- dedup set: which live-fetched tickets have been turned into tasks
  id        text primary key,
  synced_at timestamptz not null default now()
);

create table customer_unifi_sites ( -- links a RingLogix customer (domain id) to its UniFi Site Manager site
  customer_id text primary key,
  site_id     text not null,
  host_id     text not null,
  site_name   text,
  linked_at   timestamptz not null default now(),
  linked_by   text
);

create table notes ( -- personal notes, optionally shared with other employees
  id         text primary key,
  author_id  text,
  updated_at timestamptz not null default now(),
  data       jsonb not null default '{}'
);

create table ticket_reviews ( -- post-close "how did we do" review request, sent by app/api/tickets/manual/[id]/review-request
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

create table ringlogix_customers ( -- cached snapshot of the RingLogix reseller portal customer list, refreshed every 3h by app/api/cron/ringlogix-sync
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

create table customer_profiles ( -- editable ISP/contacts overlay for a RingLogix customer (domain id)
  customer_id     text primary key,
  isp             text,
  backup_isp      text,
  contacts        jsonb not null default '[]', -- extra contacts beyond the RingLogix-sourced default {name, email, phone}
  main_contact_id text not null default 'default', -- 'default' (RingLogix contact) or a contact's id
  updated_at      timestamptz not null default now(),
  updated_by      text
);

create table user_profiles (
  uid          uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  display_name text,
  employee_id  text references employees(id),
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

create table settings ( -- replaces Firestore "config/ticketCounter" + "config/ticketSyncBaseline"
  key   text primary key,
  value jsonb not null
);
insert into settings (key, value) values ('ticket_counter', '{"value": 0}');

-- Credentials vault, previously Firestore "vault_entries"/"vault_audit_log",
-- readable only through the Admin SDK (never the client SDK directly).
-- Here that's enforced with admin-only RLS instead (see is_admin() below).
create table vault_entries (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null, -- "Key Name"
  account_id         text,          -- "ID", account/login identifier
  email              text,
  website            text,
  phone_numbers      text[] not null default '{}',
  points_of_contact  text[] not null default '{}',
  category           text not null default 'other',
  notes              text,
  tags               text[] not null default '{}',
  ciphertext         text not null, -- password (always present)
  iv                 text not null,
  auth_tag           text not null,
  pin_ciphertext     text,          -- PIN (optional, a second secret alongside the password)
  pin_iv             text,
  pin_auth_tag       text,
  -- RingLogix customer this key belongs to, external id/denormalized name,
  -- no local FK (customers live in RingLogix, not this database; same
  -- pattern as customer_unifi_sites/customer_profiles).
  customer_id        text,
  customer_name      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         text not null,
  updated_by         text not null,
  last_revealed_at   timestamptz,
  last_revealed_by   text,
  -- Owning employee, each vault entry belongs to whoever created it.
  -- NULL only for rows migrated from the old admin-only-shared vault that
  -- couldn't be attributed to a real login (see migration-vault-sharing.sql).
  owner_uid          uuid references auth.users(id)
);

create table vault_audit_log (
  id          uuid primary key default gen_random_uuid(),
  action      text not null,
  entry_id    text not null,
  entry_name  text not null,
  actor_uid   uuid not null,
  actor_email text not null,
  timestamp   timestamptz not null default now()
);

-- Per-entry access grants, an owner sharing one credential with a coworker.
-- Grantees get read/reveal only; editing and further sharing stays with the
-- owner (and admins, via override).
create table vault_shares (
  id             uuid primary key default gen_random_uuid(),
  entry_id       uuid not null references vault_entries(id) on delete cascade,
  grantee_uid    uuid not null references auth.users(id) on delete cascade,
  granted_by_uid uuid not null references auth.users(id),
  granted_at     timestamptz not null default now(),
  unique (entry_id, grantee_uid)
);

-- Per-employee vault unlock gate, an app-level passkey distinct from their
-- login, checked before the vault's contents render for that session.
-- passkey_hash/passkey_salt: scrypt, nullable (no passkey set yet is valid).
-- ms_verified_until: stamped by /auth/callback right after a fresh Microsoft
-- sign-in, required to create a passkey for the first time or reset a
-- forgotten one (neither can be gated by "knows the current passkey").
create table vault_passkeys (
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

-- ── Ticket counter (atomic, replaces Firestore increment()) ────────────────

create function next_ticket_number() returns int
language sql
as $$
  update settings set value = jsonb_set(value, '{value}', to_jsonb(((value->>'value')::int) + 1))
  where key = 'ticket_counter'
  returning (value->>'value')::int;
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Internal ERP tool: any authenticated user may read/write every table.
-- Admin-only gating (e.g. isAdmin) is enforced at the app layer today, not
-- per-row, this mirrors the pre-migration Firestore rules.

alter table employees      enable row level security;
alter table projects       enable row level security;
alter table tasks          enable row level security;
alter table tickets        enable row level security;
alter table manual_tickets enable row level security;
alter table ticket_sync    enable row level security;
alter table user_profiles  enable row level security;
alter table settings       enable row level security;
alter table customer_unifi_sites enable row level security;
alter table customer_profiles enable row level security;
alter table notes enable row level security;
alter table ringlogix_customers enable row level security;
alter table ticket_reviews enable row level security;

create policy "authenticated read/write" on employees
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write" on projects
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write" on tasks
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write" on tickets
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write" on manual_tickets
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write" on ticket_sync
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write" on settings
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write" on customer_unifi_sites
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write" on customer_profiles
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write" on notes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write" on ringlogix_customers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
-- ticket_reviews has no client-side policy: the public feedback page never
-- talks to Supabase directly, only through app/api/feedback/[token] routes
-- running under the service-role key, which bypasses RLS entirely.

-- user_profiles: any authenticated user can read all profiles (matches
-- today's admin-facing "subscribeUserProfiles" use case) and update their
-- own row, but only admins can flip is_admin on someone else's row.
create function is_admin() returns boolean
language sql stable
as $$
  select coalesce((select is_admin from user_profiles where uid = auth.uid()), false);
$$;

create policy "read all profiles" on user_profiles
  for select using (auth.role() = 'authenticated');
create policy "insert own profile" on user_profiles
  for insert with check (uid = auth.uid());
create policy "update own profile or admin" on user_profiles
  for update using (uid = auth.uid() or is_admin())
  with check (uid = auth.uid() or is_admin());

-- vault_entries: owner, a grantee (once shared with them), or an admin
-- (recovery/offboarding override), enforced at the DB layer in addition to
-- the app-level checks in the API routes (see lib/vault-auth.ts).
-- vault_audit_log stays admin/system-only, matching the pre-sharing model.
alter table vault_entries    enable row level security;
alter table vault_audit_log  enable row level security;
alter table vault_shares     enable row level security;
alter table vault_passkeys   enable row level security;

create policy "admin only" on vault_audit_log
  for all using (is_admin()) with check (is_admin());

-- True only while the caller's own vault is currently unlocked, mirrors
-- (and backstops at the DB layer) the app-level requireVaultUnlocked() gate.
create function vault_is_unlocked() returns boolean
language sql stable
as $$
  select exists (
    select 1 from vault_passkeys
    where uid = auth.uid()
      and unlocked_until is not null
      and unlocked_until > now()
  );
$$;

create function vault_has_share(p_entry_id uuid) returns boolean
language sql stable
as $$
  select exists (
    select 1 from vault_shares where entry_id = p_entry_id and grantee_uid = auth.uid()
  );
$$;

-- Read: admin (no unlock needed, recovery/offboarding override), or the
-- owner/a grantee with their own vault currently unlocked.
create policy "owner, grantee, or admin can read" on vault_entries
  for select using (
    is_admin()
    or (owner_uid = auth.uid() and vault_is_unlocked())
    or (vault_has_share(id) and vault_is_unlocked())
  );

-- Write: owner or admin only, grantees get read/reveal, never edit.
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

-- vault_shares: visible to the entry's owner, any existing grantee (so "who
-- else has access" is visible to the people it's shared with), or admin.
-- Only the owner/admin may grant or revoke.
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
-- (status only, the app layer never returns hash/salt to the client) and
-- may delete anyone's row (the "reset a forgotten passkey" recovery path).
create policy "self or admin can read passkey" on vault_passkeys
  for select using (uid = auth.uid() or is_admin());
create policy "self can create own passkey" on vault_passkeys
  for insert with check (uid = auth.uid());
create policy "self or admin can update passkey" on vault_passkeys
  for update using (uid = auth.uid() or is_admin()) with check (uid = auth.uid() or is_admin());
create policy "admin can reset passkey" on vault_passkeys
  for delete using (is_admin());

-- ── Realtime ─────────────────────────────────────────────────────────────
-- Enable replication for tables the app subscribes to live (replaces
-- Firestore onSnapshot). Run once, the dashboard's "Replication" tab under
-- Database also works if you prefer clicking through it instead.

alter publication supabase_realtime add table employees;
alter publication supabase_realtime add table projects;
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table tickets;
alter publication supabase_realtime add table manual_tickets;
alter publication supabase_realtime add table ticket_sync;
alter publication supabase_realtime add table user_profiles;
alter publication supabase_realtime add table customer_unifi_sites;
alter publication supabase_realtime add table notes;
alter publication supabase_realtime add table vault_shares;

-- ── Storage ──────────────────────────────────────────────────────────────
-- Bucket for project attachments (replaces browser-only IndexedDB storage).
-- Private bucket, access goes through signed URLs / RLS-gated downloads.

insert into storage.buckets (id, name, public)
values ('project-attachments', 'project-attachments', false)
on conflict (id) do nothing;

create policy "authenticated read attachments" on storage.objects
  for select using (bucket_id = 'project-attachments' and auth.role() = 'authenticated');
create policy "authenticated write attachments" on storage.objects
  for insert with check (bucket_id = 'project-attachments' and auth.role() = 'authenticated');
create policy "authenticated delete attachments" on storage.objects
  for delete using (bucket_id = 'project-attachments' and auth.role() = 'authenticated');

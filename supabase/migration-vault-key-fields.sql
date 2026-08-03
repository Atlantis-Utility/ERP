-- Vault "Key" field rework: ID (was username), multiple phone numbers,
-- multiple points of contact, an encrypted PIN alongside the password, and
-- a linked customer (RingLogix company, referenced by its external id,
-- same pattern as customer_unifi_sites/customer_profiles, no local FK).
-- Run once in the Supabase SQL editor. Safe to re-run.

alter table vault_entries
  add column if not exists account_id        text,
  add column if not exists phone_numbers      text[] not null default '{}',
  add column if not exists points_of_contact  text[] not null default '{}',
  add column if not exists pin_ciphertext     text,
  add column if not exists pin_iv             text,
  add column if not exists pin_auth_tag       text,
  add column if not exists customer_id        text,
  add column if not exists customer_name      text;

-- Backfill from the old singular fields before dropping them.
update vault_entries set account_id = username
  where account_id is null and username is not null;
update vault_entries set phone_numbers = array[contact_phone]
  where phone_numbers = '{}' and contact_phone is not null and contact_phone <> '';
update vault_entries set points_of_contact = array[point_of_contact]
  where points_of_contact = '{}' and point_of_contact is not null and point_of_contact <> '';

-- Superseded by the columns above (contact_email had no analogous field in
-- the new shape, point of contact is now a plain list of names).
alter table vault_entries drop column if exists username;
alter table vault_entries drop column if exists point_of_contact;
alter table vault_entries drop column if exists contact_phone;
alter table vault_entries drop column if exists contact_email;

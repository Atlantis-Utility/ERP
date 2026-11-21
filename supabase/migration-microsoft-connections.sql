-- One row per person who has connected their own Microsoft account.
--
-- Reading somebody's Teams chats needs *their* permission, not the
-- company's. Microsoft draws a hard line here: the application-permission
-- versions of the chat APIs are "protected", requiring an approval request
-- to Microsoft and per-message billing through an Azure subscription. The
-- delegated versions - where a person signs in and the app acts as them -
-- are neither. So the app asks each person to connect, and sees exactly
-- what that person can see, which is also the right answer for privacy.
--
-- No password is ever collected or stored. The person signs in at
-- Microsoft, with whatever MFA their account requires, and comes back with
-- a refresh token. That token is the only credential kept here and it is
-- encrypted at rest with VAULT_ENCRYPTION_KEY (lib/vault-crypto.ts), the
-- same AES-256-GCM used for the Vault.
--
-- Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists public.microsoft_connections (
  -- The ERP identity: the employee's email, lower-cased. Deliberately not
  -- employees.id - an administrator's user_profiles row carries a null
  -- employee_id, and anything keyed on it silently loses them.
  email             text primary key,
  -- Who they signed in as at Microsoft, which may differ from their ERP
  -- address and is worth showing them before they trust the connection.
  microsoft_upn     text not null default '',
  display_name      text not null default '',
  -- What they actually granted. Scopes can be narrower than we asked for,
  -- so this records the answer rather than the question.
  scopes            text not null default '',
  -- {ciphertext, iv, authTag} from encryptSecret(). Never plaintext.
  refresh_token     jsonb not null,
  connected_at      timestamptz not null default now(),
  last_used_at      timestamptz,
  -- Set when a refresh fails, so the UI can say "reconnect" instead of
  -- failing silently for ever.
  broken_reason     text
);

create index if not exists microsoft_connections_connected_idx
  on public.microsoft_connections (connected_at desc);

alter table public.microsoft_connections enable row level security;

-- Deliberately no policies: this table holds credentials and is reachable
-- only through the service role inside API routes. RLS on with no policy
-- means the anon and authenticated keys see nothing at all, which is the
-- intent - the browser never needs a refresh token.

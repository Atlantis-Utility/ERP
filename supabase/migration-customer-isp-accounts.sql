-- The account number the circuit is billed under.
--
-- The ISP fields said which provider a customer is on; the number you have
-- to quote to talk to that provider about them lived on a bill in somebody's
-- inbox. Ringing Spectrum about an outage and not being able to say which
-- account it is about is the whole problem.
--
-- A list, not a column: one customer can hold several. Harborwalk has two
-- Spectrum accounts at the same address, and a customer with a primary and
-- a backup circuit has one for each.
--
-- Each element:
--   { id, provider, accountNumber, serviceAddress, notes }
--
-- serviceAddress is the address as the provider bills it, kept only when it
-- differs from the customer's own - the bills say "131 Mallard Way" under a
-- company name that is not the customer's, and losing that makes the next
-- person doubt the match.
--
-- Run once in the Supabase SQL editor. Safe to re-run.

alter table customer_profiles
  add column if not exists isp_accounts jsonb not null default '[]'::jsonb;

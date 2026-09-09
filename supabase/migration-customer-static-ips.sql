-- Static IP details per customer: the address itself plus the subnet mask,
-- gateway and DNS servers needed to actually reconfigure a circuit.
--
-- UniFi's Site Manager API reports a WAN's IPv4 address but nothing else —
-- no netmask, no WAN gateway, no resolvers (verified against the live API) —
-- so the IP can be pre-filled from a linked site and the rest is entered by
-- hand. Stored as an array because one customer can hold several static IPs
-- (999 Pizza is billed for five).
--
-- Each element:
--   { id, ip, subnetMask, gateway, dnsPrimary, dnsSecondary, label, notes }
--
-- Run once in the Supabase SQL editor. Safe to re-run.

alter table customer_profiles
  add column if not exists static_ips jsonb not null default '[]'::jsonb;

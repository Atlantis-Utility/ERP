-- When a customer is open.
--
-- Typed in rather than fetched. Google has these hours and charges for the
-- API that returns them; OpenStreetMap, which is free, carries none for
-- businesses like these - checked against the real address list, the
-- addresses geocode and the hours come back empty every time. So the edit
-- drawer puts a Google Maps search link beside the fields and somebody
-- copies them over once.
--
-- Shape, on the existing customer overlay row:
--   { "days": [ { "closed": bool, "open": "HH:MM", "close": "HH:MM" } x7 ],
--     "note": "Closed 12-1 for lunch" }
-- Sunday first, to match JavaScript's Date.getDay().
--
-- Run once in the Supabase SQL editor. Safe to re-run.

alter table customer_profiles
  add column if not exists hours jsonb not null default '{}'::jsonb;

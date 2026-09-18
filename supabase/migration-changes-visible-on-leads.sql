-- A correction proposed on a campaign sheet shows on the lead itself.
--
-- Run AFTER supabase/migration-campaign-approvals.sql. Run once in the
-- Supabase SQL editor. Safe to re-run.
--
-- Why: a campaign is a view onto the lead database, not a copy of it. When
-- an editor corrects a company's name or number while calling a sheet, the
-- Leads tab kept showing the old value and gave no sign anything had been
-- proposed, so the same lead read differently depending on which page you
-- were on, and only an administrator or the person who typed it could see
-- the pending edit at all. Several campaigns handed to several people made
-- that worse: each sheet knew about its own corrections and nothing else.
--
-- The change is one policy. Pending corrections are now readable by anyone
-- who can read the lead they're about, whatever their campaign access:
--
--   exists (select 1 from leads l where l.id = r.lead_id)
--
-- A subquery in a policy is itself subject to the other table's RLS, so
-- "can read the lead" is exactly the leads read policy, evaluated for the
-- caller. Nothing widens: someone who can't see a lead still can't see what
-- was proposed about it.
--
-- Approval is untouched. The lead's stored value still only changes when an
-- administrator approves (lead_changes_approve); what's visible everywhere
-- now is that a change is waiting, and what it would do.

drop policy if exists "admin or requester can read change requests" on lead_change_requests;
drop policy if exists "read change requests for a readable lead" on lead_change_requests;

create policy "read change requests for a readable lead" on lead_change_requests
  for select using (exists (select 1 from leads l where l.id = lead_change_requests.lead_id));

-- Writes stay closed: every insert and update goes through
-- campaign_request_change / lead_changes_approve / lead_changes_reject,
-- which check campaign rights and administrator status themselves.

-- The Leads page asks for the pending rows of the page it is showing, so it
-- needs this index on the lead rather than on the campaign.
create index if not exists lead_change_requests_lead_pending_idx
  on lead_change_requests (lead_id) where status = 'pending';

-- ── The import's duplicate index carries the address ─────────────────────
--
-- A business licence list names a company once per permit it holds, so the
-- Holiday Inn on Esplanade arrived six times: same company, same address,
-- same owner, differing only in businessType ("HOTEL, MOTEL", "BANQUET
-- FACILITY", "WASTEWATER PERMIT"). 917 leads were duplicates of that shape.
--
-- Matching on company plus contact name alone can't see it, because two rows
-- for one company with no contact named are ambiguous and were treated as
-- new. The importer now matches on the address as well, which needs it here.
--
-- Dropped rather than replaced: CREATE OR REPLACE cannot change a function's
-- return type.
drop function if exists leads_dedupe_index();

create or replace function leads_dedupe_index()
returns table (id text, company_name text, poc_name text, street text, city text, zip text)
language sql stable
as $$
  select l.id, l.company_name, l.data->>'pocName', l.data->>'street', l.city, l.data->>'zip'
    from leads l;
$$;

-- Already published by migration-campaign-approvals.sql, repeated here
-- because the Leads page now listens to it too and a database that somehow
-- missed it would show corrections only after a reload.
do $$
begin
  begin
    alter publication supabase_realtime add table lead_change_requests;
  exception
    when duplicate_object then null;
  end;
end $$;

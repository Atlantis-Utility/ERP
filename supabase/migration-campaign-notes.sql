-- Notes on a campaign row.
--
-- The sheet already has two free-text columns, and both are about a call:
-- "Caller Feedback / Prospect's Stated Problem" is what the prospect said,
-- and "Next Action" is what to do about it. Notes is for what's true about
-- the row itself and outlives any one call — "gatekeeper won't put calls
-- through", "two locations, this is the Oxnard one".
--
-- Run this before deploying the matching client change: the sheet reads the
-- column through campaign_rows and writes it straight to campaign_leads.

alter table campaign_leads add column if not exists notes text;

-- campaign_rows returns one more column, and a function's return type can't
-- be changed by CREATE OR REPLACE, so it's dropped by name first — same
-- reason as the drop block in migration-campaign-approvals.sql. Nothing
-- depends on it structurally.
do $$
declare
  r record;
begin
  for r in
    select oid::regprocedure as sig
      from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname = 'campaign_rows'
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;

-- Unchanged from migration-campaign-approvals.sql apart from cl.notes. Keep
-- the two in step if either changes.
create or replace function campaign_rows(p_campaign_id uuid,
  p_search      text default null,
  p_rep         text default null,
  p_outcome     text default null,
  p_uncalled    boolean default false,
  p_due         boolean default false,
  p_limit       int default 100,
  p_offset      int default 0)
returns table (row_id            uuid,
  lead_id           text,
  row_no            int,
  company_name      text,
  contact_name      text,
  address1          text,
  city              text,
  state             text,
  zip               text,
  phone             text,
  email             text,
  category          text,
  source            text,
  call_date         date,
  call_outcome      text,
  caller_feedback   text,
  interested_in     text,
  follow_up_date    date,
  assigned_rep      text,
  assigned_rep_name text,
  attempts          int,
  best_time         text,
  next_action       text,
  do_not_call       boolean,
  notes             text,
  updated_at        timestamptz,
  updated_by_name   text,
  -- field -> proposed value, for every correction on this row still waiting
  -- on a reviewer. The sheet shows these in place, tagged, so the person who
  -- typed one sees their own correction rather than the old value.
  pending           jsonb)
language plpgsql stable security definer set search_path = public, auth
as $$
begin
  if campaign_level(p_campaign_id) is null then
    return;
  end if;

  return query
  select
    cl.id, cl.lead_id, cl.row_no,
    l.data->>'companyName',
    l.data->>'pocName',
    l.data->>'street',
    l.data->>'city',
    l.data->>'state',
    l.data->>'zip',
    l.data->>'phone',
    l.data->>'email',
    l.data->>'businessType',
    l.data->>'source',
    cl.call_date, cl.call_outcome, cl.caller_feedback, cl.interested_in,
    cl.follow_up_date, cl.assigned_rep, cl.assigned_rep_name,
    cl.attempts, cl.best_time, cl.next_action, cl.do_not_call, cl.notes,
    cl.updated_at, cl.updated_by_name,
    p.pending
  from campaign_leads cl
  join leads l on l.id = cl.lead_id
  left join lateral (
    select jsonb_object_agg(r.field, r.new_value) as pending
      from lead_change_requests r
     where r.lead_id = cl.lead_id and r.status = 'pending'
  ) p on true
  where cl.campaign_id = p_campaign_id
    and (p_search is null or p_search = '' or l.search_text like '%' || lower(p_search) || '%')
    and (p_rep is null or p_rep = '' or cl.assigned_rep = p_rep)
    and (p_outcome is null or p_outcome = '' or cl.call_outcome = p_outcome)
    and (not coalesce(p_uncalled, false) or cl.call_date is null)
    and (not coalesce(p_due, false) or (cl.follow_up_date is not null and cl.follow_up_date <= current_date))
  order by cl.row_no, cl.id
  limit greatest(1, least(coalesce(p_limit, 100), 500))
 offset greatest(0, coalesce(p_offset, 0));
end;
$$;

-- No policy change: "editors can fill the sheet" (migration-campaigns.sql)
-- is a whole-row update policy, so an editor who can fill in an outcome can
-- fill in a note. campaign_leads_guard_rep only guards assigned_rep.

-- Follow-ups you can actually find.
--
-- The sheet could filter to follow-ups that had come round and nothing
-- else, so a caller who booked a call for next Tuesday had no way to see
-- it: the row they had just scheduled vanished from the only filter there
-- was. Both sheet functions take p_scheduled now - every row with a
-- follow-up date, whenever it falls.
--
-- And the dashboard counted lead-level follow-up dates while the team sets
-- follow-ups on call sheets, so the tile read a number from somewhere
-- nobody was working. my_follow_ups() counts the sheets instead, per
-- campaign, so the panel can link to the one it is talking about.
--
-- Run once in the Supabase SQL editor. Safe to re-run.

-- Dropped by name first: adding a parameter to a function makes an overload
-- rather than replacing it, and two versions differing only by a defaulted
-- argument make every call ambiguous.
do $$
declare
  r record;
begin
  for r in
    select oid::regprocedure as sig
      from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname in ('campaign_rows', 'campaign_stats')
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;

create or replace function campaign_rows(p_campaign_id uuid,
  p_search      text default null,
  p_rep         text default null,
  p_outcome     text default null,
  p_uncalled    boolean default false,
  p_due         boolean default false,
  -- Any follow-up at all, not only one that has come round. Somebody who
  -- booked a call for next Tuesday cannot find it with "due".
  p_scheduled   boolean default false,
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
    cl.attempts, cl.best_time, cl.next_action, cl.do_not_call,
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
    and (not coalesce(p_scheduled, false) or cl.follow_up_date is not null)
  order by cl.row_no, cl.id
  limit greatest(1, least(coalesce(p_limit, 100), 500))
 offset greatest(0, coalesce(p_offset, 0));
end;
$$;

create or replace function campaign_stats(p_campaign_id uuid,
  p_search      text default null,
  p_rep         text default null,
  p_outcome     text default null,
  p_uncalled    boolean default false,
  p_due         boolean default false,
  p_scheduled   boolean default false)
returns table (total       bigint,
  called      bigint,
  interested  bigint,
  follow_ups  bigint,
  unassigned  bigint,
  do_not_call bigint,
  pending     bigint)
language plpgsql stable security definer set search_path = public, auth
as $$
begin
  if campaign_level(p_campaign_id) is null then
    return;
  end if;

  return query
  select
    count(*)::bigint,
    count(*) filter (where cl.call_date is not null)::bigint,
    count(*) filter (where coalesce(cl.interested_in, '') <> '')::bigint,
    count(*) filter (where cl.follow_up_date is not null and cl.follow_up_date <= current_date)::bigint,
    count(*) filter (where cl.assigned_rep is null)::bigint,
    count(*) filter (where cl.do_not_call)::bigint,
    -- Rows with a correction waiting on a reviewer, not the number of
    -- corrections: it answers "how much of this sheet is in question".
    count(*) filter (where exists (select 1 from lead_change_requests r
                                    where r.lead_id = cl.lead_id and r.status = 'pending'))::bigint
  from campaign_leads cl
  join leads l on l.id = cl.lead_id
  where cl.campaign_id = p_campaign_id
    and (p_search is null or p_search = '' or l.search_text like '%' || lower(p_search) || '%')
    and (p_rep is null or p_rep = '' or cl.assigned_rep = p_rep)
    and (p_outcome is null or p_outcome = '' or cl.call_outcome = p_outcome)
    and (not coalesce(p_uncalled, false) or cl.call_date is null)
    and (not coalesce(p_due, false) or (cl.follow_up_date is not null and cl.follow_up_date <= current_date))
    and (not coalesce(p_scheduled, false) or cl.follow_up_date is not null);
end;
$$;

-- ── What is waiting for me ───────────────────────────────────────────────
-- Follow-ups on the sheets this person can open, per campaign, so the
-- dashboard can say "14 due" and send them to the sheet that holds them.
-- Definer rights, scoped by my_campaign_ids() exactly as the row policy is.
create or replace function my_follow_ups()
returns table (campaign_id uuid, campaign_name text, scheduled bigint, due bigint)
language sql stable security definer set search_path = public, auth
as $$
  select c.id,
         c.name,
         count(*) filter (where cl.follow_up_date is not null)::bigint,
         count(*) filter (where cl.follow_up_date is not null
                            and cl.follow_up_date <= current_date)::bigint
    from campaigns c
    join campaign_leads cl on cl.campaign_id = c.id
   where (select erp_is_admin()) or c.id in (select my_campaign_ids())
   group by c.id, c.name
  having count(*) filter (where cl.follow_up_date is not null) > 0
   order by 4 desc, 3 desc;
$$;

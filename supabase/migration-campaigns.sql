-- Campaigns: a named working list of leads, shared with specific people at
-- read or edit level, worked as a call sheet.
--
-- Run AFTER supabase/migration-record-access.sql, this file reuses its
-- identity helpers (erp_is_admin, erp_actor_employee_id) and rewrites the
-- `leads` read policy to add a campaign branch.
--
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Why campaign_leads carries its own call fields rather than writing them
-- onto the lead: the same company can sit in several campaigns, and each one
-- is a separate outreach with its own call date, outcome and rep. Putting
-- them on the lead would mean the second campaign overwrites the first's
-- record of what happened.

create table if not exists campaigns (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text,
  status          text not null default 'active' check (status in ('active', 'paused', 'done')),
  created_by      text,
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists campaigns_status_idx on campaigns (status, created_at desc);

-- Who can work a campaign. 'editor' fills in the sheet; 'viewer' reads it.
create table if not exists campaign_grants (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references campaigns(id) on delete cascade,
  employee_id     text not null references employees(id) on delete cascade,
  level           text not null check (level in ('editor', 'viewer')),
  granted_by      text,
  granted_by_name text,
  granted_at      timestamptz not null default now(),
  unique (campaign_id, employee_id)
);

create index if not exists campaign_grants_employee_idx on campaign_grants (employee_id);

-- One row of the call sheet: the lead, plus what happened when we called it.
create table if not exists campaign_leads (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references campaigns(id) on delete cascade,
  lead_id           text not null references leads(id) on delete cascade,
  -- The "No." column. Stable per campaign so the sheet doesn't renumber
  -- itself when someone filters or removes a row.
  --
  -- Named row_no, not "position": POSITION is a reserved word in SQL (the
  -- position(x in y) function), and while CREATE TABLE tolerates it as a
  -- column name, a RETURNS TABLE column list does not, campaign_rows below
  -- fails to parse with it.
  row_no            int not null default 0,
  call_date         date,
  call_outcome      text,
  caller_feedback   text,
  interested_in     text,
  follow_up_date    date,
  assigned_rep      text,
  assigned_rep_name text,
  -- Beyond the asked-for columns, the things a caller actually needs on a
  -- sheet like this:
  --   attempts, how many times we've tried, the difference between
  --                     "no answer once" and "chased six times"
  --   best_time, when they said to call back ("after 4pm", "Tues am")
  --   next_action, the one thing to do next, per row
  --   do_not_call, an explicit opt-out, so it's a flag to respect rather
  --                     than a note someone has to read and remember
  attempts          int not null default 0,
  best_time         text,
  next_action       text,
  do_not_call       boolean not null default false,
  updated_at        timestamptz not null default now(),
  updated_by        text,
  updated_by_name   text,
  -- A lead appears at most once in a given campaign, so adding a selection
  -- that overlaps what's already there is a no-op rather than a duplicate.
  unique (campaign_id, lead_id)
);

-- Renames the column for a database created from the earlier version of this
-- file, which used the reserved word.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'campaign_leads' and column_name = 'position'
  ) and not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'campaign_leads' and column_name = 'row_no'
  ) then
    alter table campaign_leads rename column position to row_no;
  end if;
end $$;

-- Added separately from CREATE TABLE so a database that ran an earlier
-- version of this file picks the new columns up too.
alter table campaign_leads add column if not exists row_no int not null default 0;
alter table campaign_leads add column if not exists attempts int not null default 0;
alter table campaign_leads add column if not exists best_time text;
alter table campaign_leads add column if not exists next_action text;
alter table campaign_leads add column if not exists do_not_call boolean not null default false;
alter table campaign_leads add column if not exists updated_by_name text;

create index if not exists campaign_leads_campaign_idx on campaign_leads (campaign_id, row_no);
create index if not exists campaign_leads_lead_idx on campaign_leads (lead_id);
create index if not exists campaign_leads_rep_idx on campaign_leads (assigned_rep);
create index if not exists campaign_leads_follow_up_idx on campaign_leads (follow_up_date);

-- ── Access helpers ───────────────────────────────────────────────────────
-- SECURITY DEFINER for the same reason as the lead helpers: these are read
-- from inside policies on other tables, and as invoker functions they would
-- re-enter those tables' policies (campaign_leads → campaigns →
-- campaign_grants) and recurse.

-- Campaign ids the caller has an explicit grant on. Argument-free so it's
-- evaluated once per query, not once per row.
create or replace function my_campaign_ids(p_editor_only boolean default false)
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select g.campaign_id
    from campaign_grants g
   where g.employee_id = (select erp_actor_employee_id())
     and (not p_editor_only or g.level = 'editor');
$$;

-- 'admin' | 'editor' | 'viewer', or NULL when the caller can't see it.
create or replace function campaign_level(p_campaign_id uuid) returns text
language sql stable security definer set search_path = public
as $$
  select case
    when (select erp_is_admin()) then 'admin'
    else (
      select g.level from campaign_grants g
       where g.campaign_id = p_campaign_id
         and g.employee_id = (select erp_actor_employee_id())
       limit 1)
  end;
$$;

-- Leads that appear in a campaign the caller can see.
--
-- This is what makes a campaign workable by someone who owns none of its
-- leads: being given a campaign grants sight of the leads on its sheet, and
-- nothing else. Without it a rep could open a campaign and see rows of blanks
-- where the leads policy filtered the companies out from under them.
create or replace function leads_campaign_lead_ids()
returns setof text
language sql stable security definer set search_path = public
as $$
  select cl.lead_id
    from campaign_leads cl
   where cl.campaign_id in (select my_campaign_ids());
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table campaigns       enable row level security;
alter table campaign_grants enable row level security;
alter table campaign_leads  enable row level security;

drop policy if exists "granted or admin can read campaigns" on campaigns;
drop policy if exists "admin can create campaigns" on campaigns;
drop policy if exists "admin can update campaigns" on campaigns;
drop policy if exists "admin can delete campaigns" on campaigns;

create policy "granted or admin can read campaigns" on campaigns
  for select using ((select erp_is_admin()) or id in (select my_campaign_ids()));

-- Creating, renaming and deleting a campaign is an administrator act: it
-- decides what work exists and who it's handed to. Filling the sheet in is
-- not, that's the editor grant below.
create policy "admin can create campaigns" on campaigns
  for insert with check ((select erp_is_admin()));
create policy "admin can update campaigns" on campaigns
  for update using ((select erp_is_admin())) with check ((select erp_is_admin()));
create policy "admin can delete campaigns" on campaigns
  for delete using ((select erp_is_admin()));

drop policy if exists "own, same-campaign, or admin can read grants" on campaign_grants;
drop policy if exists "admin can grant campaign" on campaign_grants;
drop policy if exists "admin can change campaign grant" on campaign_grants;
drop policy if exists "admin can revoke campaign" on campaign_grants;

create policy "own, same-campaign, or admin can read grants" on campaign_grants
  for select using ((select erp_is_admin())
    or employee_id = (select erp_actor_employee_id())
    -- Anyone on the campaign can see who else is on it.
    or campaign_id in (select my_campaign_ids()));
create policy "admin can grant campaign" on campaign_grants
  for insert with check ((select erp_is_admin()));
create policy "admin can change campaign grant" on campaign_grants
  for update using ((select erp_is_admin())) with check ((select erp_is_admin()));
create policy "admin can revoke campaign" on campaign_grants
  for delete using ((select erp_is_admin()));

drop policy if exists "readable with the campaign" on campaign_leads;
drop policy if exists "editors can add rows" on campaign_leads;
drop policy if exists "editors can fill the sheet" on campaign_leads;
drop policy if exists "editors can remove rows" on campaign_leads;

create policy "readable with the campaign" on campaign_leads
  for select using ((select erp_is_admin()) or campaign_id in (select my_campaign_ids()));

-- Editors work the sheet: add rows, fill in call results, remove rows.
create policy "editors can add rows" on campaign_leads
  for insert with check ((select erp_is_admin()) or campaign_id in (select my_campaign_ids(true)));
create policy "editors can fill the sheet" on campaign_leads
  for update using (
    (select erp_is_admin()) or campaign_id in (select my_campaign_ids(true))
  ) with check (
    (select erp_is_admin()) or campaign_id in (select my_campaign_ids(true))
  );
create policy "editors can remove rows" on campaign_leads
  for delete using ((select erp_is_admin()) or campaign_id in (select my_campaign_ids(true)));

-- ── leads: add the campaign branch to the read policy ────────────────────
-- Recreated wholesale rather than added to, because a policy's expression
-- can't be appended to. Everything else about it is unchanged from
-- migration-record-access.sql, keep the two in step if either changes.
drop policy if exists "assigned, granted, or admin can read" on leads;
create policy "assigned, granted, or admin can read" on leads
  for select using ((select erp_is_admin())
    or (assigned_to is not null and assigned_to = (select erp_actor_employee_id()))
    or (select leads_has_global_grant())
    or id in (select leads_granted_ids())
    or id in (select leads_campaign_lead_ids()));

-- ── Queries ──────────────────────────────────────────────────────────────
-- Invoker rights throughout, so RLS scopes every one of these to what the
-- caller may see.

do $$
declare
  r record;
begin
  for r in
    select oid::regprocedure as sig
      from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname in ('campaigns_list', 'campaign_rows', 'campaign_add_leads', 'campaign_stats',
         'campaign_selection_matches', 'campaign_selection_count', 'leads_field_values',
         'campaign_renumber')
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;

-- The campaign list, with the row count and the caller's own level, so the
-- UI doesn't need a query per campaign to know what it may offer.
create or replace function campaigns_list()
returns table (id              uuid,
  name            text,
  description     text,
  status          text,
  created_by_name text,
  created_at      timestamptz,
  lead_count      bigint,
  called_count    bigint,
  my_level        text)
language sql stable
as $$
  select
    c.id, c.name, c.description, c.status, c.created_by_name, c.created_at,
    (select count(*) from campaign_leads cl where cl.campaign_id = c.id)::bigint,
    (select count(*) from campaign_leads cl
      where cl.campaign_id = c.id and cl.call_date is not null)::bigint,
    campaign_level(c.id)
  from campaigns c
  order by c.created_at desc;
$$;

-- ── Building a campaign from criteria ────────────────────────────────────
-- Picking leads by city / state / category / source / stage / priority /
-- owner / tag, expressed once so the "how many match?" preview and the
-- actual insert can't disagree, a preview that says 2,431 and then adds a
-- different set is worse than no preview.
create or replace function campaign_selection_matches(p_row         leads,
  p_search      text,
  p_status      text,
  p_assigned_to text,
  p_priority    text,
  p_source      text,
  p_city        text,
  p_state       text,
  p_category    text,
  p_tag         text,
  p_unassigned_only boolean,
  p_overdue     boolean,
  p_stale       boolean,
  p_stale_days  int) returns boolean
language sql stable
as $$
  select
    (p_search is null or p_search = '' or p_row.search_text like '%' || lower(p_search) || '%')
    and (p_status is null or p_status = '' or p_row.status = p_status)
    and (p_assigned_to is null or p_assigned_to = '' or p_row.assigned_to = p_assigned_to)
    and (not coalesce(p_unassigned_only, false) or p_row.assigned_to is null)
    and (p_priority is null or p_priority = '' or p_row.priority = p_priority)
    and (p_source is null or p_source = '' or p_row.source = p_source)
    -- City/state/category are matched case-insensitively: they're free text
    -- on the lead (typed by hand, or whatever a CSV carried), so "boston"
    -- and "Boston" are the same place.
    and (p_city is null or p_city = '' or lower(coalesce(p_row.data->>'city','')) = lower(p_city))
    and (p_state is null or p_state = '' or lower(coalesce(p_row.data->>'state','')) = lower(p_state))
    and (p_category is null or p_category = '' or lower(coalesce(p_row.data->>'businessType','')) = lower(p_category))
    and (p_tag is null or p_tag = ''
      or (jsonb_typeof(p_row.data->'tags') = 'array'
        and exists (select 1 from jsonb_array_elements_text(p_row.data->'tags') t
           where lower(t) = lower(p_tag))))
    -- Mirrors leads_matches so the Leads page's own "overdue" / "gone quiet"
    -- toggles survive being carried into a campaign. Without these, "add
    -- everything matching" would quietly add the leads those toggles had
    -- filtered out.
    and (not coalesce(p_overdue, false)
      or (p_row.follow_up_date is not null
          and p_row.follow_up_date < current_date
          and not leads_is_terminal(p_row.status)))
    and (not coalesce(p_stale, false)
      or (not leads_is_terminal(p_row.status)
          and p_row.updated_at < now() - make_interval(days => coalesce(p_stale_days, 14))));
$$;

-- How many leads a criteria set would add, and how many of those are already
-- on the sheet, so the dialog can say "adds 812 (39 already here)".
create or replace function campaign_selection_count(p_campaign_id uuid default null,
  p_search      text default null,
  p_status      text default null,
  p_assigned_to text default null,
  p_priority    text default null,
  p_source      text default null,
  p_city        text default null,
  p_state       text default null,
  p_category    text default null,
  p_tag         text default null,
  p_unassigned_only boolean default false,
  p_overdue     boolean default false,
  p_stale       boolean default false,
  p_stale_days  int default 14) returns table (matching bigint, already_added bigint)
language sql stable
as $$
  select
    count(*)::bigint,
    count(*) filter (where p_campaign_id is not null and exists (select 1 from campaign_leads cl
         where cl.campaign_id = p_campaign_id and cl.lead_id = l.id))::bigint
  from leads l
  where campaign_selection_matches(l, p_search, p_status, p_assigned_to, p_priority,
                                   p_source, p_city, p_state, p_category, p_tag,
                                   p_unassigned_only, p_overdue, p_stale, p_stale_days);
$$;

-- Distinct values for the criteria pickers, with counts, so a campaign is
-- built by choosing from what's actually in the data instead of typing a city
-- name and hoping it matches. Field name is whitelisted, never interpolated.
create or replace function leads_field_values(p_field text, p_limit int default 200)
returns table (value text, n bigint)
language plpgsql stable
as $$
begin
  if p_field not in ('city', 'state', 'businessType', 'source', 'priority') then
    raise exception 'Unknown field: %', p_field;
  end if;

  return query
    select v.value, count(*)::bigint
      from leads l
      cross join lateral (select nullif(btrim(l.data->>p_field), '') as value) v
     where v.value is not null
     group by v.value
     order by count(*) desc, v.value
     limit greatest(1, least(coalesce(p_limit, 200), 1000));
end;
$$;

-- Adds leads to a campaign, from an explicit id list or from a criteria set,
-- so "add all 4,000 matching" is one statement. Numbering continues from the
-- campaign's current high-water mark, and leads already on the sheet are
-- skipped. Returns how many rows were actually added.
create or replace function campaign_add_leads(p_campaign_id uuid,
  p_ids         text[] default null,
  p_search      text default null,
  p_status      text default null,
  p_assigned_to text default null,
  p_priority    text default null,
  p_source      text default null,
  p_city        text default null,
  p_state       text default null,
  p_category    text default null,
  p_tag         text default null,
  p_unassigned_only boolean default false,
  p_overdue     boolean default false,
  p_stale       boolean default false,
  p_stale_days  int default 14,
  p_limit       int default null) returns bigint
language plpgsql
as $$
declare
  v_start int;
  v_count bigint;
begin
  select coalesce(max(row_no), 0) into v_start
    from campaign_leads where campaign_id = p_campaign_id;

  with candidate as (
    select l.id,
           row_number() over (order by l.company_name nulls last, l.id) as n
      from leads l
     where (p_ids is null or l.id = any(p_ids))
       and (p_ids is not null
         or campaign_selection_matches(l, p_search, p_status, p_assigned_to, p_priority,
                                       p_source, p_city, p_state, p_category, p_tag,
                                       p_unassigned_only, p_overdue, p_stale, p_stale_days))
       and not exists (
         select 1 from campaign_leads cl
          where cl.campaign_id = p_campaign_id and cl.lead_id = l.id
       )
     -- An optional ceiling, for "take the first 500 that match" rather than
     -- committing to the whole set.
     limit case when p_limit is null then null else greatest(1, p_limit) end
  ), inserted as (
    insert into campaign_leads (campaign_id, lead_id, row_no)
    select p_campaign_id, c.id, v_start + c.n::int from candidate c
    returning 1
  )
  select count(*) into v_count from inserted;

  update campaigns set updated_at = now() where id = p_campaign_id;
  return v_count;
end;
$$;

-- One page of the call sheet. The lead's own fields (company, address, phone,
-- category, source) are read through the join so an edit to the lead shows up
-- here, rather than being copied onto the row at add time and going stale.
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
  updated_at        timestamptz,
  updated_by_name   text)
language sql stable
as $$
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
    cl.updated_at, cl.updated_by_name
  from campaign_leads cl
  join leads l on l.id = cl.lead_id
  where cl.campaign_id = p_campaign_id
    and (p_search is null or p_search = '' or l.search_text like '%' || lower(p_search) || '%')
    and (p_rep is null or p_rep = '' or cl.assigned_rep = p_rep)
    and (p_outcome is null or p_outcome = '' or cl.call_outcome = p_outcome)
    and (not coalesce(p_uncalled, false) or cl.call_date is null)
    and (not coalesce(p_due, false) or (cl.follow_up_date is not null and cl.follow_up_date <= current_date))
  order by cl.row_no, cl.id
  limit greatest(1, least(coalesce(p_limit, 100), 500))
 offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function campaign_stats(p_campaign_id uuid,
  p_search      text default null,
  p_rep         text default null,
  p_outcome     text default null,
  p_uncalled    boolean default false,
  p_due         boolean default false)
returns table (total       bigint,
  called      bigint,
  interested  bigint,
  follow_ups  bigint,
  unassigned  bigint,
  do_not_call bigint)
language sql stable
as $$
  select
    count(*)::bigint,
    count(*) filter (where cl.call_date is not null)::bigint,
    count(*) filter (where coalesce(cl.interested_in, '') <> '')::bigint,
    count(*) filter (where cl.follow_up_date is not null and cl.follow_up_date <= current_date)::bigint,
    count(*) filter (where cl.assigned_rep is null)::bigint,
    count(*) filter (where cl.do_not_call)::bigint
  from campaign_leads cl
  join leads l on l.id = cl.lead_id
  where cl.campaign_id = p_campaign_id
    and (p_search is null or p_search = '' or l.search_text like '%' || lower(p_search) || '%')
    and (p_rep is null or p_rep = '' or cl.assigned_rep = p_rep)
    and (p_outcome is null or p_outcome = '' or cl.call_outcome = p_outcome)
    and (not coalesce(p_uncalled, false) or cl.call_date is null)
    and (not coalesce(p_due, false) or (cl.follow_up_date is not null and cl.follow_up_date <= current_date));
$$;

-- Closes gaps in the "No." column after rows have been removed, so the sheet
-- reads 1..n again. Deliberately explicit rather than automatic: renumbering
-- silently while someone is reading row 400 is disorienting.
create or replace function campaign_renumber(p_campaign_id uuid) returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  with ordered as (
    select id, row_number() over (order by row_no, id) as n
      from campaign_leads
     where campaign_id = p_campaign_id), updated as (update campaign_leads cl
       set row_no = o.n::int
      from ordered o
     where cl.id = o.id and cl.row_no <> o.n::int
    returning 1
  )
  select count(*) into v_count from updated;
  return v_count;
end;
$$;

-- ── Realtime ─────────────────────────────────────────────────────────────
do $$
begin
  begin alter publication supabase_realtime add table campaigns; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table campaign_grants; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table campaign_leads; exception when duplicate_object then null; end;
end $$;

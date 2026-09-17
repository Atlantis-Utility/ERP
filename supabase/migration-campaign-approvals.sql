-- ════════════════════════════════════════════════════════════════════════
--  Campaign edits with review, a city filter, and a tighter lead browse
--
--  Run after migration-record-access.sql and migration-campaigns.sql. Safe
--  to run more than once.
--
--  Three changes, in one file because they all touch the same functions:
--
--  1. A campaign no longer grants its members access to the leads on it via
--     the leads table. Being on a shared campaign used to make every lead in
--     it readable on the Leads page as well, so a caller given one campaign
--     of 10,000 rows could browse all 10,000 leads. The sheet still shows
--     what it must; see campaign_rows/campaign_stats below.
--
--  2. City becomes a filter, like state and category already were.
--
--  3. Campaign editors can correct the lead facts on a sheet (a wrong
--     company name, a number that reaches the wrong desk), but a correction
--     is recorded as a request rather than written to the lead. An
--     administrator reviews before and after, then approves or rejects,
--     singly or in bulk.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. City as a filterable column ───────────────────────────────────────

alter table leads add column if not exists city text
  generated always as (data->>'city') stored;

create index if not exists leads_city_idx on leads (city);

-- ── 2. Drop the functions whose signatures change ────────────────────────
-- Every one of these gains p_city. A new parameter can't be added by CREATE
-- OR REPLACE (it would create a second overload, which PostgREST then can't
-- choose between), so they're dropped by name first. Nothing depends on them
-- structurally: their bodies are strings, so Postgres records no dependency.

do $$
declare
  r record;
begin
  for r in
    select oid::regprocedure as sig
      from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname in ('leads_matches', 'leads_search', 'leads_stats', 'leads_stage_counts',
         'leads_apply_assign', 'leads_apply_status', 'leads_apply_delete', 'leads_apply_grant',
         'campaign_rows', 'campaign_stats')
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;

-- ── 3. The filter predicate, with city ───────────────────────────────────
-- p_city is last and defaults to null so the existing nine-argument calls
-- elsewhere keep resolving against it.
create or replace function leads_matches(p_row          leads,
  p_search       text,
  p_status       text,
  p_assigned_to  text,
  p_priority     text,
  p_source       text,
  p_overdue      boolean,
  p_stale        boolean,
  p_stale_days   int,
  p_city         text default null) returns boolean
language sql stable
as $$
  select
    (p_search is null or p_search = '' or p_row.search_text like '%' || lower(p_search) || '%')
    and (p_status is null or p_status = '' or p_row.status = p_status)
    -- 'unassigned' is a real thing to filter for, and it can't be expressed
    -- as an employee id.
    and (p_assigned_to is null or p_assigned_to = ''
      or (p_assigned_to = 'unassigned' and p_row.assigned_to is null)
      or p_row.assigned_to = p_assigned_to)
    and (p_priority is null or p_priority = '' or p_row.priority = p_priority)
    and (p_source is null or p_source = '' or p_row.source = p_source)
    -- Case-insensitive: an imported list and a hand-typed lead disagree on
    -- whether a city is "Oxnard" or "OXNARD", and picking from the facet
    -- list should match both.
    and (p_city is null or p_city = '' or lower(coalesce(p_row.city, '')) = lower(p_city))
    and (not coalesce(p_overdue, false)
      or (p_row.follow_up_date is not null
          and p_row.follow_up_date < current_date
          and not leads_is_terminal(p_row.status)))
    and (not coalesce(p_stale, false)
      or (not leads_is_terminal(p_row.status)
          and p_row.updated_at < now() - make_interval(days => coalesce(p_stale_days, 14))));
$$;

-- ── 4. Reads, with city ──────────────────────────────────────────────────

create or replace function leads_search(p_search       text default null,
  p_status       text default null,
  p_assigned_to  text default null,
  p_priority     text default null,
  p_source       text default null,
  p_overdue      boolean default false,
  p_stale        boolean default false,
  p_stale_days   int default 14,
  p_city         text default null,
  p_sort         text default 'updated_at',
  p_desc         boolean default true,
  p_limit        int default 50,
  p_offset       int default 0) returns table (id text, status text, data jsonb, access_level text)
language sql stable
as $$
  -- Identity is resolved once, in a CTE, and joined on, rather than calling
  -- leads_access_level(l) per row. Those helpers each run their own queries
  -- against employees / user_profiles / auth.users, so a per-row call turns
  -- one page of 50 leads into hundreds of nested queries, and a count over
  -- 10,000 into tens of thousands (which is what made this time out at
  -- 57014 before).
  with actor as (select
      (select erp_is_admin())                  as is_admin,
      (select erp_actor_employee_id())         as employee_id,
      (select leads_has_global_grant(true))    as global_editor)
  select
    l.id, l.status, l.data,
    case
      when a.is_admin then 'admin'
      when l.assigned_to is not null and l.assigned_to = a.employee_id then 'owner'
      when a.global_editor then 'editor'
      when l.id in (select leads_granted_ids(true)) then 'editor'
      else 'viewer'
    end
    from leads l
   cross join actor a
   where leads_matches(l, p_search, p_status, p_assigned_to, p_priority, p_source, p_overdue, p_stale, p_stale_days, p_city)
   order by
     case when p_sort = 'company_name'    and p_desc then l.company_name    end desc nulls last,
     case when p_sort = 'company_name'    and not p_desc then l.company_name end asc  nulls last,
     case when p_sort = 'follow_up_date'  and p_desc then l.follow_up_date   end desc nulls last,
     case when p_sort = 'follow_up_date'  and not p_desc then l.follow_up_date end asc nulls last,
     case when p_sort not in ('company_name','follow_up_date') and p_desc then l.updated_at end desc nulls last,
     case when p_sort not in ('company_name','follow_up_date') and not p_desc then l.updated_at end asc nulls last,
     -- Final tiebreak so paging can't repeat or skip a row when the sort key
     -- ties (thousands of imported leads share an updated_at to the second).
     l.id
   limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function leads_stats(p_search       text default null,
  p_status       text default null,
  p_assigned_to  text default null,
  p_priority     text default null,
  p_source       text default null,
  p_overdue      boolean default false,
  p_stale        boolean default false,
  p_stale_days   int default 14,
  p_city         text default null) returns table (total            bigint,
  appointments     bigint,
  not_interested   bigint,
  overdue          bigint,
  stale        bigint,
  unassigned   bigint)
language sql stable
as $$
  select
    count(*)::bigint,
    count(*) filter (where l.status = 'appointment')::bigint,
    count(*) filter (where l.status in ('not_interested', 'do_not_call'))::bigint,
    count(*) filter (where l.follow_up_date is not null
        and l.follow_up_date < current_date
        and not leads_is_terminal(l.status))::bigint,
    count(*) filter (where not leads_is_terminal(l.status)
        and l.updated_at < now() - make_interval(days => coalesce(p_stale_days, 14)))::bigint,
    count(*) filter (where l.assigned_to is null)::bigint
  from leads l
  where leads_matches(l, p_search, p_status, p_assigned_to, p_priority, p_source, p_overdue, p_stale, p_stale_days, p_city);
$$;

create or replace function leads_stage_counts(p_search       text default null,
  p_assigned_to  text default null,
  p_priority     text default null,
  p_source       text default null,
  p_overdue      boolean default false,
  p_stale        boolean default false,
  p_stale_days   int default 14,
  p_city         text default null) returns table (status text, n bigint)
language sql stable
as $$
  select l.status, count(*)::bigint
    from leads l
   where leads_matches(l, p_search, null, p_assigned_to, p_priority, p_source, p_overdue, p_stale, p_stale_days, p_city)
   group by l.status;
$$;

-- ── 5. Bulk writes, with city ────────────────────────────────────────────
-- Unchanged except for the added filter argument: see the notes in
-- migration-record-access.sql for why these take a filter set rather than an
-- id list, and why they return a row count.

create or replace function leads_apply_assign(p_employee_id   text,
  p_employee_name text,
  p_ids           text[] default null,
  p_search        text default null,
  p_status        text default null,
  p_assigned_to   text default null,
  p_priority      text default null,
  p_source        text default null,
  p_overdue       boolean default false,
  p_stale         boolean default false,
  p_stale_days    int default 14,
  p_city          text default null) returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  with updated as (
    update leads l
       set data = l.data
                  -- Writing NULL as a JSON null (not dropping the key) keeps
                  -- the generated assigned_to column NULL, which is what
                  -- "unassigned" has to mean for the read policy.
                  || jsonb_build_object('assignedTo', to_jsonb(p_employee_id),
                       'assignedToName', to_jsonb(p_employee_name),
                       'updatedAt', to_jsonb(now())),
           updated_at = now()
     where (p_ids is null or l.id = any(p_ids))
       and (p_ids is not null or leads_matches(l, p_search, p_status, p_assigned_to, p_priority, p_source, p_overdue, p_stale, p_stale_days, p_city))
       and coalesce(l.assigned_to, '') <> coalesce(p_employee_id, '')
    returning 1
  )
  select count(*) into v_count from updated;
  return v_count;
end;
$$;

create or replace function leads_apply_status(p_new_status   text,
  p_ids          text[] default null,
  p_search       text default null,
  p_status       text default null,
  p_assigned_to  text default null,
  p_priority     text default null,
  p_source       text default null,
  p_overdue      boolean default false,
  p_stale        boolean default false,
  p_stale_days   int default 14,
  p_city         text default null) returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  if p_new_status not in ('new','contacted','follow_up','interested','appointment','not_interested','do_not_call') then
    raise exception 'Unknown lead stage: %', p_new_status;
  end if;

  with updated as (
    update leads l
       set status = p_new_status,
           data = l.data || jsonb_build_object('status', p_new_status, 'updatedAt', to_jsonb(now())),
           updated_at = now()
     where (p_ids is null or l.id = any(p_ids))
       and (p_ids is not null or leads_matches(l, p_search, p_status, p_assigned_to, p_priority, p_source, p_overdue, p_stale, p_stale_days, p_city))
       and l.status <> p_new_status
    returning 1
  )
  select count(*) into v_count from updated;
  return v_count;
end;
$$;

create or replace function leads_apply_delete(p_ids          text[] default null,
  p_search       text default null,
  p_status       text default null,
  p_assigned_to  text default null,
  p_priority     text default null,
  p_source       text default null,
  p_overdue      boolean default false,
  p_stale        boolean default false,
  p_stale_days   int default 14,
  p_city         text default null) returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  with deleted as (
    delete from leads l
     where (p_ids is null or l.id = any(p_ids))
       and (p_ids is not null or leads_matches(l, p_search, p_status, p_assigned_to, p_priority, p_source, p_overdue, p_stale, p_stale_days, p_city))
    returning 1
  )
  select count(*) into v_count from deleted;
  return v_count;
end;
$$;

create or replace function leads_apply_grant(p_employee_id     text,
  p_level           text,
  p_granted_by      text default null,
  p_granted_by_name text default null,
  p_ids             text[] default null,
  p_search          text default null,
  p_status          text default null,
  p_assigned_to     text default null,
  p_priority        text default null,
  p_source          text default null,
  p_overdue         boolean default false,
  p_stale           boolean default false,
  p_stale_days      int default 14,
  p_city            text default null) returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  if p_level not in ('editor', 'viewer') then
    raise exception 'Unknown access level: %', p_level;
  end if;

  delete from lead_grants g
   where g.employee_id = p_employee_id
     and g.lead_id in (
       select l.id from leads l
        where (p_ids is null or l.id = any(p_ids))
          and (p_ids is not null or leads_matches(l, p_search, p_status, p_assigned_to, p_priority, p_source, p_overdue, p_stale, p_stale_days, p_city)));

  with inserted as (
    insert into lead_grants (lead_id, employee_id, level, granted_by, granted_by_name)
    select l.id, p_employee_id, p_level, p_granted_by, p_granted_by_name
      from leads l
     where (p_ids is null or l.id = any(p_ids))
       and (p_ids is not null or leads_matches(l, p_search, p_status, p_assigned_to, p_priority, p_source, p_overdue, p_stale, p_stale_days, p_city))
       -- The owner already has full access; a grant on top would be noise in
       -- the "who can see this" list.
       and coalesce(l.assigned_to, '') <> p_employee_id
    returning 1
  )
  select count(*) into v_count from inserted;
  return v_count;
end;
$$;

-- ── 6. The leads read policy loses its campaign branch ───────────────────
-- Being on a campaign is access to that campaign's sheet, not to the lead
-- records behind it. The Leads page is now exactly "assigned to me, shared
-- with me, or I'm an administrator", which is what it says it is.
drop policy if exists "assigned, granted, or admin can read" on leads;
create policy "assigned, granted, or admin can read" on leads
  for select using ((select erp_is_admin())
    or (assigned_to is not null and assigned_to = (select erp_actor_employee_id()))
    or (select leads_has_global_grant())
    or id in (select leads_granted_ids()));

drop function if exists leads_campaign_lead_ids() cascade;

-- ── 7. Change requests ───────────────────────────────────────────────────

create table if not exists lead_change_requests (
  id                uuid primary key default gen_random_uuid(),
  lead_id           text not null references leads(id) on delete cascade,
  -- Which sheet the correction came from, for the reviewer's context. Kept
  -- nullable so deleting a campaign doesn't discard a pending correction.
  campaign_id       uuid references campaigns(id) on delete set null,
  field             text not null,
  old_value         text,
  new_value         text,
  status            text not null default 'pending',
  requested_by      text,
  requested_by_name text,
  requested_at      timestamptz not null default now(),
  reviewed_by       text,
  reviewed_by_name  text,
  reviewed_at       timestamptz,
  constraint lead_change_requests_status_chk check (status in ('pending', 'approved', 'rejected')),
  -- The editable set. Anything that decides who can see a lead (assignedTo)
  -- or what stage it's at is deliberately absent: those are not corrections
  -- to a company's details, and reassignment stays an administrator's call.
  constraint lead_change_requests_field_chk check (field in ('companyName', 'dba', 'pocName', 'pocTitle',
    'phone', 'email', 'website', 'street', 'city', 'state', 'zip', 'businessType', 'description'))
);

-- One pending request per field per lead: editing the same cell again
-- replaces what was proposed rather than queueing a second opinion.
create unique index if not exists lead_change_requests_pending_uq
  on lead_change_requests (lead_id, field) where status = 'pending';
create index if not exists lead_change_requests_campaign_idx
  on lead_change_requests (campaign_id) where status = 'pending';
create index if not exists lead_change_requests_queue_idx
  on lead_change_requests (status, requested_at desc);

alter table lead_change_requests enable row level security;

-- Reads are for the reviewer and the person who asked. Everyone else sees
-- pending edits only through campaign_rows, which is scoped to a campaign
-- they already hold.
drop policy if exists "admin or requester can read change requests" on lead_change_requests;
create policy "admin or requester can read change requests" on lead_change_requests
  for select using ((select erp_is_admin())
    or requested_by = (select erp_actor_employee_id()));

-- No insert/update/delete policies on purpose: every write goes through the
-- functions below, which check campaign rights themselves. Without a policy
-- the table is closed, so there is no path that skips those checks.

-- ── 8. Proposing a change ────────────────────────────────────────────────

create or replace function campaign_request_change(p_campaign_id uuid,
  p_lead_id     text,
  p_field       text,
  p_new_value   text) returns text
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_admin boolean := erp_is_admin();
  v_level text;
  v_actor text    := erp_actor_employee_id();
  v_name  text    := erp_actor_employee_name();
  v_old   text;
  v_new   text    := nullif(btrim(coalesce(p_new_value, '')), '');
begin
  -- Definer rights, so the field whitelist and the campaign check below are
  -- the only way in. The check constraint on the table backs up the list.
  if p_field not in ('companyName', 'dba', 'pocName', 'pocTitle', 'phone', 'email', 'website',
    'street', 'city', 'state', 'zip', 'businessType', 'description') then
    raise exception 'Field % cannot be edited from a campaign sheet', p_field;
  end if;

  if not exists (select 1 from campaign_leads cl
                  where cl.campaign_id = p_campaign_id and cl.lead_id = p_lead_id) then
    raise exception 'That lead is not on this campaign';
  end if;

  v_level := campaign_level(p_campaign_id);
  if not v_admin and coalesce(v_level, '') <> 'editor' then
    raise exception 'You have read-only access to this campaign';
  end if;

  select nullif(btrim(l.data->>p_field), '') into v_old from leads l where l.id = p_lead_id;

  -- Typing a value back to what it already was is not a change. Clearing any
  -- pending request for the field covers "I made a mistake, put it back".
  if coalesce(v_old, '') = coalesce(v_new, '') then
    delete from lead_change_requests
     where lead_id = p_lead_id and field = p_field and status = 'pending';
    return 'unchanged';
  end if;

  -- An administrator is the reviewer, so their own edit needs no review.
  if v_admin then
    update leads
       set data = data || jsonb_build_object(p_field, v_new, 'updatedAt', to_jsonb(now())),
           updated_at = now()
     where id = p_lead_id;

    insert into lead_activity (lead_id, actor_id, actor_name, kind, summary, detail)
    values (p_lead_id, v_actor, v_name, 'update',
      format('%s changed on a campaign sheet', p_field),
      jsonb_build_object('field', p_field, 'from', v_old, 'to', v_new, 'campaignId', p_campaign_id));

    delete from lead_change_requests
     where lead_id = p_lead_id and field = p_field and status = 'pending';
    return 'applied';
  end if;

  insert into lead_change_requests (lead_id, campaign_id, field, old_value, new_value,
    requested_by, requested_by_name)
  values (p_lead_id, p_campaign_id, p_field, v_old, v_new, v_actor, v_name)
  on conflict (lead_id, field) where status = 'pending'
  do update set new_value         = excluded.new_value,
                old_value         = excluded.old_value,
                campaign_id       = excluded.campaign_id,
                requested_by      = excluded.requested_by,
                requested_by_name = excluded.requested_by_name,
                requested_at      = now();
  return 'pending';
end;
$$;

-- ── 9. Reviewing ─────────────────────────────────────────────────────────

-- The queue, with enough context to judge an entry without opening the lead.
create or replace function lead_changes_pending(p_campaign_id uuid default null,
  p_limit int default 500)
returns table (id uuid,
  lead_id           text,
  campaign_id       uuid,
  campaign_name     text,
  company_name      text,
  field             text,
  old_value         text,
  new_value         text,
  requested_by_name text,
  requested_at      timestamptz)
language sql stable security definer set search_path = public, auth
as $$
  select r.id, r.lead_id, r.campaign_id, c.name, l.company_name, r.field,
         r.old_value, r.new_value, r.requested_by_name, r.requested_at
    from lead_change_requests r
    join leads l on l.id = r.lead_id
    left join campaigns c on c.id = r.campaign_id
   where r.status = 'pending'
     and (select erp_is_admin())
     and (p_campaign_id is null or r.campaign_id = p_campaign_id)
   order by l.company_name, r.requested_at
   limit greatest(1, least(coalesce(p_limit, 500), 2000));
$$;

-- How many are waiting. An administrator gets the review count, anyone else
-- gets their own outstanding requests, which is what their sheet reports.
create or replace function lead_changes_pending_count(p_campaign_id uuid default null)
returns bigint
language sql stable security definer set search_path = public, auth
as $$
  select count(*)::bigint
    from lead_change_requests r
   where r.status = 'pending'
     and (p_campaign_id is null or r.campaign_id = p_campaign_id)
     and ((select erp_is_admin()) or r.requested_by = (select erp_actor_employee_id()));
$$;

-- Applies pending changes and records each one on the lead's history.
-- p_ids null with a campaign means "approve everything on this sheet";
-- both null means the whole queue, which is what Approve all does.
create or replace function lead_changes_approve(p_ids uuid[] default null,
  p_campaign_id uuid default null) returns bigint
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_actor text := erp_actor_employee_id();
  v_name  text := erp_actor_employee_name();
  v_count bigint := 0;
  r       record;
begin
  if not erp_is_admin() then
    raise exception 'Only an administrator can approve a change';
  end if;

  for r in
    select * from lead_change_requests q
     where q.status = 'pending'
       and (p_ids is null or q.id = any(p_ids))
       and (p_campaign_id is null or q.campaign_id = p_campaign_id)
     order by q.lead_id, q.field
  loop
    update leads
       set data = data || jsonb_build_object(r.field, r.new_value, 'updatedAt', to_jsonb(now())),
           updated_at = now()
     where id = r.lead_id;

    insert into lead_activity (lead_id, actor_id, actor_name, kind, summary, detail)
    values (r.lead_id, v_actor, v_name, 'update',
      format('%s updated, approved from a campaign sheet', r.field),
      jsonb_build_object('field', r.field, 'from', r.old_value, 'to', r.new_value,
        'requestedBy', r.requested_by_name, 'campaignId', r.campaign_id));

    update lead_change_requests
       set status = 'approved', reviewed_by = v_actor, reviewed_by_name = v_name, reviewed_at = now()
     where id = r.id;

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Turns requests down. The lead is untouched, and the sheet stops showing
-- the proposed value, so the reader sees what's actually on file again.
create or replace function lead_changes_reject(p_ids uuid[] default null,
  p_campaign_id uuid default null) returns bigint
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_count bigint;
begin
  if not erp_is_admin() then
    raise exception 'Only an administrator can reject a change';
  end if;

  with rejected as (
    update lead_change_requests q
       set status = 'rejected',
           reviewed_by = erp_actor_employee_id(),
           reviewed_by_name = erp_actor_employee_name(),
           reviewed_at = now()
     where q.status = 'pending'
       and (p_ids is null or q.id = any(p_ids))
       and (p_campaign_id is null or q.campaign_id = p_campaign_id)
    returning 1
  )
  select count(*) into v_count from rejected;
  return v_count;
end;
$$;

-- ── 10. The sheet ────────────────────────────────────────────────────────
-- Both of these now run with definer rights and check campaign access
-- themselves. They have to: the sheet's whole purpose is to show the lead
-- facts for its rows, and since step 6 a campaign grant no longer carries
-- any access to the leads table. The guard is campaign_level(), which is
-- non-null only for an administrator or someone the campaign was shared
-- with, so this reads no wider than the campaign itself.

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
  p_due         boolean default false)
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
    and (not coalesce(p_due, false) or (cl.follow_up_date is not null and cl.follow_up_date <= current_date));
end;
$$;

-- ── 11. Realtime ─────────────────────────────────────────────────────────
-- So a reviewer's approval reaches an open sheet, and a new request reaches
-- an open review queue.
do $$
begin
  begin
    alter publication supabase_realtime add table lead_change_requests;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;

-- Columns a campaign owns: renamed headings, and columns of its own.
--
-- The call sheet's columns were the same twenty for every campaign, which
-- is wrong twice over. A campaign imported from somebody's spreadsheet has
-- columns that sheet had and this one doesn't ("Connection", "Accepted",
-- "Messaged", "Source"), and a team that calls the point of contact "the
-- decision maker" shouldn't have to read "Contact Name".
--
-- So a campaign carries its own column setup, and each row carries the
-- values for the columns that setup adds:
--
--   campaigns.columns = {
--     "labels": { "contact": "Decision maker" },   -- renamed built-ins
--     "extra":  [ { "id": "c1", "label": "Source" } ]
--   }
--   campaign_leads.extra = { "c1": "Ventura Chamber of Commerce Directory" }
--
-- Values live on the row rather than on the lead on purpose: "did they
-- accept the connection request" is about this campaign's outreach, not a
-- fact about the business, and the same lead can sit on two campaigns.

alter table campaigns      add column if not exists columns jsonb not null default '{}'::jsonb;
alter table campaign_leads add column if not exists extra   jsonb not null default '{}'::jsonb;

-- ── Who may change the setup ─────────────────────────────────────────────
-- Renaming a campaign and editing its columns is work on the sheet, so an
-- editor can do it. The table policy still says administrators only
-- (migration-campaigns.sql), and this is deliberately the one way past it:
-- a definer function that checks the campaign grant itself, the same shape
-- as campaign_rows and the approval functions.
create or replace function campaign_set_meta(p_campaign_id uuid,
  p_name        text  default null,
  p_description text  default null,
  p_columns     jsonb default null)
returns void
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_level text;
begin
  v_level := campaign_level(p_campaign_id);
  -- Null means no access at all, and `null not in (...)` is null rather
  -- than true, so it has to be spelled out or nobody is stopped.
  if v_level is null or v_level not in ('admin', 'editor') then
    raise exception 'Only someone this campaign was shared with as an editor can change it';
  end if;

  update campaigns
     set name        = coalesce(nullif(btrim(p_name), ''), name),
         -- An empty description is a real value (clear it); null means
         -- "leave it alone", which is how the client omits a field.
         description = case when p_description is null then description
                            else nullif(btrim(p_description), '') end,
         columns     = coalesce(p_columns, columns)
   where id = p_campaign_id;
end;
$$;

-- ── The two readers gain the new fields ──────────────────────────────────
-- Both return one more column, and a function's return type can't be
-- changed by CREATE OR REPLACE, so they are dropped by name first — the
-- same reason as the drop block in migration-campaign-approvals.sql.
do $$
declare
  r record;
begin
  for r in
    select oid::regprocedure as sig
      from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname in ('campaigns_list', 'campaign_rows')
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;

-- Unchanged from migration-campaigns.sql apart from c.columns.
create or replace function campaigns_list()
returns table (id              uuid,
  name            text,
  description     text,
  status          text,
  created_by_name text,
  created_at      timestamptz,
  lead_count      bigint,
  called_count    bigint,
  my_level        text,
  columns         jsonb)
language sql stable
as $$
  select
    c.id, c.name, c.description, c.status, c.created_by_name, c.created_at,
    (select count(*) from campaign_leads cl where cl.campaign_id = c.id)::bigint,
    (select count(*) from campaign_leads cl
      where cl.campaign_id = c.id and cl.call_date is not null)::bigint,
    campaign_level(c.id),
    c.columns
  from campaigns c
  order by c.created_at desc;
$$;

-- Unchanged from migration-campaign-notes.sql apart from cl.extra.
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
  -- Values for the columns this campaign added, keyed by column id.
  extra             jsonb,
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
    coalesce(cl.extra, '{}'::jsonb),
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

-- No policy change for the values themselves: "editors can fill the sheet"
-- (migration-campaigns.sql) is a whole-row update policy, so an editor who
-- can type an outcome can type into a column the campaign added.

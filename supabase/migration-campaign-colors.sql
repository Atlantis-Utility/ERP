-- Colour on a call sheet, and a locked row.
--
-- Two things people do to a spreadsheet that the call sheet couldn't. They
-- highlight: this one's hot, this one's a bad number, these three are the
-- same parent company. And the highlight means something, so the sheet has
-- to say what — a colour nobody can name is noise.
--
-- A campaign names its own colours (in campaigns.columns, beside the
-- headings it renames), and each row says which colour goes where:
--
--   campaign_leads.colors = { "__row": "p1", "phone": "p2" }
--
-- "__row" paints the whole row; a column key paints that one cell, and
-- wins over the row. Values are ids into the campaign's palette rather than
-- colours themselves, so renaming "Hot lead" to "Call back today" changes
-- every row at once and the swatch can't drift from its meaning.

alter table campaign_leads add column if not exists colors jsonb not null default '{}'::jsonb;

-- ── Painting a selection ─────────────────────────────────────────────────
-- Colouring 250 selected rows one request each is 250 round trips; this is
-- one. Invoker rights on purpose: "editors can fill the sheet" already
-- decides who may write to these rows, and this must not reach further.
create or replace function campaign_rows_set_color(p_row_ids uuid[], p_color text default null)
returns bigint
language sql
as $$
  with painted as (
    update campaign_leads
       set colors = case
             when p_color is null or p_color = '' then colors - '__row'
             else jsonb_set(coalesce(colors, '{}'::jsonb), '{__row}', to_jsonb(p_color), true)
           end,
           updated_at = now()
     where id = any(p_row_ids)
    returning 1
  )
  select count(*)::bigint from painted;
$$;

-- ── The sheet reader gains the colours ───────────────────────────────────
-- One more returned column, so it has to be dropped and rebuilt rather than
-- replaced — same as migration-campaign-columns.sql.
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

-- Unchanged from migration-campaign-columns.sql apart from cl.colors.
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
  extra             jsonb,
  -- column key -> palette colour id, with "__row" for the whole row.
  colors            jsonb,
  updated_at        timestamptz,
  updated_by_name   text,
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
    coalesce(cl.colors, '{}'::jsonb),
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

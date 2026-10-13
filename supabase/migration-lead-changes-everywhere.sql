-- One door for a company's details, and none for the call sheet.
--
-- Two decisions, and they are the same decision from two sides:
--
--   A company's details - its name, contact, phone, email, address,
--   category - are the master record. A member proposing a correction to
--   one is a proposal wherever they make it, and an administrator approves
--   it. That already worked from a campaign sheet; it now works from the
--   Leads page too, through the same queue, and the trigger below is what
--   makes it a rule rather than a convention.
--
--   Everything that belongs to a campaign is the caller's to fill in
--   without asking: outcomes, notes, feedback, follow-ups, attempts,
--   colours, do-not-call, the sheet's own columns - and now who works a
--   row, which was administrator-only and had no business being so. A sheet
--   you can be blocked out of mid-call is not a sheet.
--
-- Run once in the Supabase SQL editor. Safe to re-run.

-- ── Proposing a change from outside a campaign ───────────────────────────
-- Same queue, same review, campaign_id left null so the review screen can
-- say where it came from. The permission question is different, though:
-- there is no campaign level to read, so this asks the question the leads
-- update policy asks - may this person edit this lead at all?
create or replace function lead_request_change(p_lead_id   text,
  p_field     text,
  p_new_value text)
returns text
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_admin boolean := erp_is_admin();
  v_actor text    := erp_actor_employee_id();
  v_name  text    := erp_actor_employee_name();
  v_old   text;
  v_new   text    := nullif(btrim(coalesce(p_new_value, '')), '');
begin
  -- Definer rights, so this whitelist is the only way in. The table's check
  -- constraint backs it up.
  if p_field not in ('companyName', 'dba', 'pocName', 'pocTitle', 'phone', 'email', 'website',
    'street', 'city', 'state', 'zip', 'businessType', 'description') then
    raise exception 'Field % cannot be proposed', p_field;
  end if;

  if not exists (
    select 1 from leads l
     where l.id = p_lead_id
       and (v_admin
         or (l.assigned_to is not null and l.assigned_to = v_actor)
         or (select leads_has_global_grant(true))
         or l.id in (select leads_granted_ids(true)))
  ) then
    raise exception 'You cannot edit that lead';
  end if;

  select nullif(btrim(l.data->>p_field), '') into v_old from leads l where l.id = p_lead_id;

  -- Typing a value back to what it already was is not a change, and it
  -- clears anything pending for the field: "I made a mistake, put it back".
  if coalesce(v_old, '') = coalesce(v_new, '') then
    delete from lead_change_requests
     where lead_id = p_lead_id and field = p_field and status = 'pending';
    return 'unchanged';
  end if;

  -- An administrator is the reviewer, so from the Leads page their own edit
  -- is simply the change. There is no second party to inform, unlike on a
  -- shared sheet where a correction should read as a correction whoever
  -- typed it.
  if v_admin then
    update leads
       set data = jsonb_set(data, array[p_field], coalesce(to_jsonb(v_new), 'null'::jsonb), true),
           updated_at = now()
     where id = p_lead_id;
    delete from lead_change_requests
     where lead_id = p_lead_id and field = p_field and status = 'pending';
    return 'applied';
  end if;

  insert into lead_change_requests (lead_id, campaign_id, field, old_value, new_value,
    requested_by, requested_by_name)
  values (p_lead_id, null, p_field, v_old, v_new, v_actor, v_name)
  on conflict (lead_id, field) where status = 'pending'
  do update set new_value         = excluded.new_value,
                old_value         = excluded.old_value,
                campaign_id       = null,
                requested_by      = excluded.requested_by,
                requested_by_name = excluded.requested_by_name,
                requested_at      = now();
  return 'pending';
end;
$$;

-- ── The backstop ─────────────────────────────────────────────────────────
-- Without this the gate is a convention in the client: anybody could write
-- a company's phone number straight to the table with their own token and
-- never appear in the queue. A member's update is refused if it changes one
-- of the gated fields, and the message says where the change went instead,
-- because "permission denied" tells somebody nothing they can act on.
--
-- Approvals pass: lead_changes_approve runs as an administrator, who is
-- exempt. So does the service-role key (auth.uid() null), which is the
-- imports and the API routes.
create or replace function leads_guard_details() returns trigger
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_field text;
begin
  if auth.uid() is null or (select erp_is_admin()) then
    return new;
  end if;
  foreach v_field in array array['companyName', 'dba', 'pocName', 'pocTitle', 'phone', 'email',
    'website', 'street', 'city', 'state', 'zip', 'businessType', 'description']
  loop
    if coalesce(new.data->>v_field, '') <> coalesce(old.data->>v_field, '') then
      raise exception 'A company''s details need an administrator''s approval. Your change has been proposed instead.';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists leads_guard_details_trg on leads;
create trigger leads_guard_details_trg
  before update on leads
  for each row execute function leads_guard_details();

-- ── The call sheet, unrestricted ─────────────────────────────────────────
-- Who works a row was an administrator's call. On a sheet two people share
-- that means one of them is stuck asking, mid-call, for a row to be handed
-- over - so it goes. Anyone who can edit the campaign can now assign its
-- rows, which is what "editor" ought to have meant.
drop trigger if exists campaign_leads_guard_rep_trg on campaign_leads;
drop function if exists campaign_leads_guard_rep();

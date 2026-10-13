-- "Only a leads administrator can reassign a lead" - on every edit.
--
-- The guard that keeps reassignment to administrators was comparing
-- leads.assigned_to, which is a GENERATED column (data->>'assignedTo').
-- PostgreSQL computes generated columns *after* BEFORE triggers run, so
-- inside this trigger new.assigned_to is always null while old.assigned_to
-- holds the stored owner. Every update to an owned lead therefore looked
-- like somebody clearing its owner, and anyone who is not an administrator
-- was refused.
--
-- Not a narrow break: a member could not change a field, add a next step,
-- or move their own lead's stage. Administrators were unaffected (they pass
-- the check either way), which is why it went unnoticed - and why it was
-- reported as "I can't log a follow-up".
--
-- The fix is to read the value the trigger can actually see: the jsonb the
-- generated column is derived from. The column itself is correct and stays
-- as it is - the policies and indexes that use it run on the stored row,
-- where it is computed.
--
-- Run once in the Supabase SQL editor. Safe to re-run.

create or replace function leads_guard_reassign() returns trigger
language plpgsql security definer set search_path = public, auth
as $$
begin
  -- data->>'assignedTo', not assigned_to: the generated column is not
  -- populated yet at BEFORE-trigger time. This is the same value, read from
  -- the place that has it.
  if coalesce(new.data->>'assignedTo', '') <> coalesce(old.data->>'assignedTo', '') then
    -- auth.uid() is null for the service-role key (API routes, SQL editor,
    -- scripts), which is already trusted server-side and must stay able to
    -- run bulk reassignment.
    if auth.uid() is not null and not (select erp_is_admin()) then
      raise exception 'Only a leads administrator can reassign a lead';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_guard_reassign_trg on leads;
create trigger leads_guard_reassign_trg
  before update on leads
  for each row execute function leads_guard_reassign();

-- Record-level access control for leads and tasks.
--
--   * leads: per-lead ownership, read-only sharing, an append-only activity
--               trail, and real enforcement of all three.
--   * tasks: you see the tasks you're assigned to (or created);
--               administrators see everything.
--
-- Run once in the Supabase SQL editor. Safe to re-run: every statement is
-- idempotent (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS first).
--
-- Why this is RLS and not UI filtering: `leads` and `tasks` were both under a
-- blanket "authenticated read/write" policy, so any member could read every
-- row straight off the REST API no matter what the page chose to render, the
-- caveat lib/visibility.ts documents for itself. Assignment is a
-- confidentiality boundary, so it has to hold at the database.

-- ════════════════════════════════════════════════════════════════════════
--  Shared identity layer
-- ════════════════════════════════════════════════════════════════════════

-- Which employees row is the caller? Mirrors lib/hooks/use-current-employee-id.ts:
-- user_profiles.employee_id when it's actually linked, else match on email,
-- because that column is null in practice for every account created before
-- its employee record existed.
--
-- SECURITY DEFINER throughout this file: these read employees /
-- user_profiles / lead_grants from inside policies ON other tables. As plain
-- SECURITY INVOKER functions each read would re-enter those tables' own
-- policies, which is both slower and a recursion hazard once lead_grants is
-- itself protected by a policy that consults leads.
create or replace function erp_actor_employee_id() returns text
language sql stable security definer set search_path = public, auth
as $$
  select coalesce(
    (select up.employee_id from user_profiles up
      where up.uid = auth.uid() and up.employee_id is not null),
    (select e.id from employees e
      where lower(e.email) = lower((select u.email from auth.users u where u.id = auth.uid()))
      limit 1));
$$;

-- Tasks, projects and tickets store assignees as employee *names*, not ids
-- (see AddTaskDrawer, which builds its picker from emp.name), so name is the
-- identity those policies have to compare against.
create or replace function erp_actor_employee_name() returns text
language sql stable security definer set search_path = public
as $$
  select e.name from employees e where e.id = (select erp_actor_employee_id());
$$;

-- Administrator. Deliberately NOT the existing is_admin(), which reads
-- user_profiles.is_admin, auth-context.tsx inserts that as true for every
-- first-time login, so is_admin() is true for ordinary staff and would hand
-- every member every lead and everyone else's tasks.
--
-- Mirrors the app's own isUnrestricted (auth-context.tsx): if the caller has
-- an employees row, its accessRole decides, full stop; only a login with no
-- employees row at all falls back to user_profiles.is_admin, which is the
-- bootstrap-admin case the app treats the same way.
create or replace function erp_is_admin() returns boolean
language sql stable security definer set search_path = public, auth
as $$
  select case
    when (select erp_actor_employee_id()) is not null then coalesce(
      (select (e.data->>'accessRole') = 'Administrator'
         from employees e where e.id = (select erp_actor_employee_id())),
      false
    )
    else coalesce((select up.is_admin from user_profiles up where up.uid = auth.uid()), false)
  end;
$$;

-- ════════════════════════════════════════════════════════════════════════
--  Leads
-- ════════════════════════════════════════════════════════════════════════

-- ── leads: a queryable owner column ──────────────────────────────────────
-- The app keeps every lead field inside `data` jsonb and mirrors only
-- `status` to a real column. RLS needs the assignee as a column, and if that
-- column could drift from data->>'assignedTo' the policy and the UI would
-- disagree about who owns a lead, a member could keep a lead visible to
-- themselves while showing it as someone else's. GENERATED ALWAYS makes
-- drift structurally impossible: it is always exactly the jsonb value, and
-- no client can write it directly.
alter table leads
  add column if not exists assigned_to text
  generated always as (data->>'assignedTo') stored;

create index if not exists leads_assigned_to_idx on leads (assigned_to);

-- ── lead_grants: explicit access, on one lead or on all of them ──────────
-- level 'editor' = can work the lead (same rights as the assignee);
-- level 'viewer' = read-only, the "grant read only access" case.
-- lead_id NULL = the grant covers every lead, which is how an admin gives
-- someone (a manager, an analyst) read-only sight of every lead
-- without assigning them anything.
create table if not exists lead_grants (
  id              uuid primary key default gen_random_uuid(),
  lead_id         text references leads(id) on delete cascade,
  employee_id     text not null references employees(id) on delete cascade,
  level           text not null check (level in ('editor', 'viewer')),
  granted_by      text,
  granted_by_name text,
  granted_at      timestamptz not null default now()
);

-- One grant per (lead, employee), and one org-wide grant per employee.
-- Two partial indexes rather than a plain unique constraint because NULL
-- lead_id would otherwise never collide with itself.
create unique index if not exists lead_grants_lead_employee_key
  on lead_grants (lead_id, employee_id) where lead_id is not null;
create unique index if not exists lead_grants_all_employee_key
  on lead_grants (employee_id) where lead_id is null;
create index if not exists lead_grants_employee_idx on lead_grants (employee_id);

-- The caller's effective grant on a lead: 'editor' wins over 'viewer', and
-- an org-wide grant counts. NULL means no grant at all.
--
-- Used for single-lead checks (lead_notes, lead_activity). The table policies
-- on `leads` itself deliberately do NOT use this: called per row it becomes
-- one subquery per lead, which at ten thousand leads is ten thousand
-- subqueries per page load. They use the uncorrelated set-returning pair
-- below instead, which Postgres evaluates once and hashes.
create or replace function leads_grant_level(p_lead_id text) returns text
language sql stable security definer set search_path = public
as $$
  select g.level
    from lead_grants g
   where g.employee_id = (select erp_actor_employee_id())
     and (g.lead_id = p_lead_id or g.lead_id is null)
   order by case g.level when 'editor' then 0 else 1 end
   limit 1;
$$;

-- Lead ids the caller holds a per-lead grant on. Takes no arguments, so it's
-- evaluated once per query rather than once per row.
create or replace function leads_granted_ids(p_editor_only boolean default false)
returns setof text
language sql stable security definer set search_path = public
as $$
  select g.lead_id
    from lead_grants g
   where g.employee_id = (select erp_actor_employee_id())
     and g.lead_id is not null
     and (not p_editor_only or g.level = 'editor');
$$;

-- Does the caller hold an all-leads grant (any level, or editor only)?
create or replace function leads_has_global_grant(p_editor_only boolean default false)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from lead_grants g
     where g.employee_id = (select erp_actor_employee_id())
       and g.lead_id is null
       and (not p_editor_only or g.level = 'editor'));
$$;

create or replace function leads_can_read(p_lead_id text) returns boolean
language sql stable security definer set search_path = public
as $$
  select (select erp_is_admin())
    or exists (select 1 from leads l
       where l.id = p_lead_id
         and l.assigned_to is not null
         and l.assigned_to = (select erp_actor_employee_id()))
    or leads_grant_level(p_lead_id) is not null;
$$;

create or replace function leads_can_write(p_lead_id text) returns boolean
language sql stable security definer set search_path = public
as $$
  select (select erp_is_admin())
    or exists (select 1 from leads l
       where l.id = p_lead_id
         and l.assigned_to is not null
         and l.assigned_to = (select erp_actor_employee_id()))
    or leads_grant_level(p_lead_id) = 'editor';
$$;

-- ── lead_activity: append-only trail ─────────────────────────────────────
-- Every stage move, reassignment, field edit and grant change lands here so
-- a manager can see how a lead was worked, not just its current state.
create table if not exists lead_activity (
  id          uuid primary key default gen_random_uuid(),
  lead_id     text not null references leads(id) on delete cascade,
  actor_id    text,
  actor_name  text,
  -- created | stage | assigned | field | note | grant | import
  kind        text not null,
  summary     text not null,
  detail      jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists lead_activity_lead_idx on lead_activity (lead_id, created_at desc);

-- ── Leads RLS ────────────────────────────────────────────────────────────

alter table leads         enable row level security;
alter table lead_notes    enable row level security;
alter table lead_grants   enable row level security;
alter table lead_activity enable row level security;

-- Replaces the blanket "any authenticated user" policy from
-- migration-leads.sql. Dropping it is the whole point of this file, leaving
-- it in place would keep a permissive OR-branch that grants everyone
-- everything regardless of the policies below (Postgres ORs permissive
-- policies together).
drop policy if exists "authenticated read/write" on leads;
drop policy if exists "authenticated read/write" on lead_notes;
drop policy if exists "assigned, granted, or admin can read" on leads;
drop policy if exists "assignee or admin can insert" on leads;
drop policy if exists "assignee, editor, or admin can update" on leads;
drop policy if exists "admin can delete" on leads;

-- Read: admins see every lead; everyone else sees leads assigned to
-- them plus anything explicitly granted (either level).
create policy "assigned, granted, or admin can read" on leads
  for select using ((select erp_is_admin())
    or (assigned_to is not null and assigned_to = (select erp_actor_employee_id()))
    or (select leads_has_global_grant())
    or id in (select leads_granted_ids()));

-- Create: an admin can create anything; a member can only create a lead
-- already assigned to themselves, so nobody can seed rows they then can't
-- see (or park leads on a teammate).
create policy "assignee or admin can insert" on leads
  for insert with check ((select erp_is_admin())
    or (assigned_to is not null and assigned_to = (select erp_actor_employee_id())));

-- Update: admin, the assignee, or an 'editor' grant. USING controls which
-- rows may be touched; WITH CHECK controls the result, so a member can't
-- update a lead into a state they'd no longer be allowed to hold. Who may
-- *change the assignee* is enforced by the trigger below, which is the only
-- place that can see the old and new value at once.
create policy "assignee, editor, or admin can update" on leads
  for update using ((select erp_is_admin())
    or (assigned_to is not null and assigned_to = (select erp_actor_employee_id()))
    or (select leads_has_global_grant(true))
    or id in (select leads_granted_ids(true))) with check ((select erp_is_admin())
    or (assigned_to is not null and assigned_to = (select erp_actor_employee_id()))
    or (select leads_has_global_grant(true))
    or id in (select leads_granted_ids(true)));

-- Delete: admins only. Deleting a lead destroys its notes and activity by
-- cascade, which is not something an assignee should be able to do to the
-- company's lead list.
create policy "admin can delete" on leads
  for delete using ((select erp_is_admin()));

-- Reassignment is an admin act. Without this an 'editor' grantee could
-- update a lead to set assignedTo = themselves and promote their own
-- read/write grant into ownership; RLS alone can't catch it because a single
-- policy expression sees either the old row or the new one, never both.
create or replace function leads_guard_reassign() returns trigger
language plpgsql security definer set search_path = public, auth
as $$
begin
  if coalesce(new.assigned_to, '') <> coalesce(old.assigned_to, '') then
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

-- lead_notes: unchanged semantics (private to the author unless shared with
-- named recipients), but enforced here instead of only in the drawer's
-- filter. Note that an administrator is deliberately NOT given blanket read,
-- these are personal working notes, and the app has always presented them
-- that way. Stage history and field changes live in lead_activity, which
-- admins do see in full.
create or replace function lead_note_visible(p_data jsonb) returns boolean
language sql stable security definer set search_path = public
as $$
  select p_data->>'authorId' = (select erp_actor_employee_id())
    or (jsonb_typeof(p_data->'recipientIds') = 'array'
      and exists (select 1 from jsonb_array_elements_text(p_data->'recipientIds') r
         where r = (select erp_actor_employee_id())));
$$;

drop policy if exists "author or recipient can read" on lead_notes;
drop policy if exists "author can insert" on lead_notes;
drop policy if exists "author can update" on lead_notes;
drop policy if exists "author can delete" on lead_notes;

create policy "author or recipient can read" on lead_notes
  for select using (lead_note_visible(data));

-- Authorship can't be forged: the row must claim the caller as its author,
-- and must hang off a lead the caller can actually see.
create policy "author can insert" on lead_notes
  for insert with check (data->>'authorId' = (select erp_actor_employee_id())
    and leads_can_read(data->>'leadId'));

create policy "author can update" on lead_notes
  for update using (data->>'authorId' = (select erp_actor_employee_id()))
  with check (data->>'authorId' = (select erp_actor_employee_id()));

create policy "author can delete" on lead_notes
  for delete using (data->>'authorId' = (select erp_actor_employee_id()));

-- lead_grants: only an admin may grant or revoke. A member may read their
-- own grants (so the UI can tell them a lead is read-only for them) and the
-- grant list of any lead they can already see (so an assignee knows who else
-- is looking at it).
drop policy if exists "own, same-lead, or admin can read grants" on lead_grants;
drop policy if exists "admin can grant" on lead_grants;
drop policy if exists "admin can change grant" on lead_grants;
drop policy if exists "admin can revoke" on lead_grants;

create policy "own, same-lead, or admin can read grants" on lead_grants
  for select using ((select erp_is_admin())
    or employee_id = (select erp_actor_employee_id())
    or (lead_id is not null and leads_can_read(lead_id)));
create policy "admin can grant" on lead_grants
  for insert with check ((select erp_is_admin()));
create policy "admin can change grant" on lead_grants
  for update using ((select erp_is_admin())) with check ((select erp_is_admin()));
create policy "admin can revoke" on lead_grants
  for delete using ((select erp_is_admin()));

-- lead_activity: administrators only.
--
-- Everyone who can work a lead still *writes* to it (that's how the trail
-- gets built), but only an administrator can read it back. It's an oversight
-- record of who did what and when, not something the people being recorded
-- need on screen, and a rep reading the trail would also see what other reps
-- did to leads they were later handed.
--
-- Immutable once written: no update policy at all, and delete is
-- administrator-only. An audit trail you can edit isn't one.
drop policy if exists "read activity for visible leads" on lead_activity;
drop policy if exists "admin can read activity" on lead_activity;
drop policy if exists "writers can append activity" on lead_activity;
drop policy if exists "admin can delete activity" on lead_activity;

create policy "admin can read activity" on lead_activity
  for select using ((select erp_is_admin()));
create policy "writers can append activity" on lead_activity
  for insert with check (leads_can_write(lead_id)
    and (actor_id is null or actor_id = (select erp_actor_employee_id()) or (select erp_is_admin())));
create policy "admin can delete activity" on lead_activity
  for delete using ((select erp_is_admin()));

-- ════════════════════════════════════════════════════════════════════════
--  Tasks
-- ════════════════════════════════════════════════════════════════════════
--
-- "You see what you're assigned" for the task board, enforced rather than
-- filtered. Assignees live in data->'assignees' as an array of employee
-- names, so the check is a name match, the same comparison
-- lib/visibility.ts makes client-side, and for the same reason (see its
-- note on why names and not ids).
--
-- Ticket-derived cards are covered by the same rule: TicketWatcher persists
-- a card per incoming ticket, and the board re-applies the live ticket's
-- assignee on read, so a card's assignee is whoever the ticket is assigned
-- to. Unassigned ones stay administrator-only, which is the triage case.

create or replace function task_assigned_to_actor(p_data jsonb) returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    -- No employee record means no name to match, so nothing matches and the
    -- board comes back empty rather than wide open.
    when (select erp_actor_employee_name()) is null then false
    when jsonb_typeof(p_data->'assignees') <> 'array' then false
    else exists (select 1 from jsonb_array_elements_text(p_data->'assignees') a
       -- Case- and whitespace-insensitive, matching the client comparison in
       -- lib/visibility.ts: these names are hand-picked strings, and " Yash
       -- Harale" must not read as a different person.
       where lower(btrim(a)) = lower(btrim((select erp_actor_employee_name()))))
  end;
$$;

alter table tasks enable row level security;

drop policy if exists "authenticated read/write" on tasks;
drop policy if exists "assignee, creator, or admin can read tasks" on tasks;
drop policy if exists "authenticated can create tasks" on tasks;
drop policy if exists "assignee, creator, or admin can update tasks" on tasks;
drop policy if exists "assignee, creator, or admin can delete tasks" on tasks;

-- Read: administrators see every task; everyone else sees the ones they're
-- assigned to, plus anything they created themselves (so a task you raise
-- before deciding who owns it doesn't vanish on you).
create policy "assignee, creator, or admin can read tasks" on tasks
  for select using ((select erp_is_admin())
    or task_assigned_to_actor(data)
    or (data->>'createdBy' is not null and data->>'createdBy' = (select erp_actor_employee_id())));

-- Create: left open to any authenticated user, on purpose. Creating a task
-- reveals nothing, and TicketWatcher (mounted for every signed-in user)
-- persists a card for each newly-arrived ticket with no assignee yet, if a
-- member's insert were refused, the ticket would already be marked synced
-- and its card would never be created for anyone. Provenance still can't be
-- forged: a stamped creator must be the caller.
create policy "authenticated can create tasks" on tasks
  for insert with check (auth.role() = 'authenticated'
    and (data->>'createdBy' is null or data->>'createdBy' = (select erp_actor_employee_id())));

-- Update: whoever can see it can work it. WITH CHECK is deliberately `true`:
-- USING has already restricted which rows may be touched, and the result has
-- to be allowed to no longer include the editor, handing a task off to a
-- teammate (or dropping yourself from it) is normal, and a mirrored WITH
-- CHECK would reject exactly that edit.
create policy "assignee, creator, or admin can update tasks" on tasks
  for update using (
    (select erp_is_admin())
    or task_assigned_to_actor(data)
    or (data->>'createdBy' is not null and data->>'createdBy' = (select erp_actor_employee_id()))
  ) with check (true);

create policy "assignee, creator, or admin can delete tasks" on tasks
  for delete using (
    (select erp_is_admin())
    or task_assigned_to_actor(data)
    or (data->>'createdBy' is not null and data->>'createdBy' = (select erp_actor_employee_id()))
  );

-- ════════════════════════════════════════════════════════════════════════
--  Closing the self-promotion hole
-- ════════════════════════════════════════════════════════════════════════
-- Everything above resolves "is this person an administrator" from
-- employees.data->>'accessRole'. But `employees` is still under a blanket
-- "authenticated read/write" policy, so without this guard any member could
-- simply write accessRole = 'Administrator' onto their own row and read the
-- every lead and everyone's tasks, the access controls above would be
-- decoration.
--
-- This enforces at the database what app/api/employees/[id]/access/route.ts
-- already says should be impossible ("Hiding the controls in the UI alone
-- wouldn't stop someone from editing the request directly and granting
-- themselves every page"). That admin-gated route keeps working: it uses the
-- service-role key, where auth.uid() is null.
--
-- Ordinary employee edits (name, phone, role, salary, …) are untouched.
create or replace function employees_guard_access_fields() returns trigger
language plpgsql security definer set search_path = public, auth
as $$
begin
  if auth.uid() is null or (select erp_is_admin()) then
    return new;
  end if;

  if coalesce(new.data->>'accessRole', '') <> coalesce(old.data->>'accessRole', '') then
    raise exception 'Only an administrator can change an access role';
  end if;

  if coalesce(new.data->'access', '[]'::jsonb) <> coalesce(old.data->'access', '[]'::jsonb) then
    raise exception 'Only an administrator can change page access';
  end if;

  return new;
end;
$$;

drop trigger if exists employees_guard_access_fields_trg on employees;
create trigger employees_guard_access_fields_trg
  before update on employees
  for each row execute function employees_guard_access_fields();

-- An INSERT can't be compared against a previous row, so a non-admin
-- creating an employee may not hand out an access role at creation time
-- either (the Employees page creates people as Contributor and grants
-- afterwards through the admin route).
create or replace function employees_guard_access_insert() returns trigger
language plpgsql security definer set search_path = public, auth
as $$
begin
  if auth.uid() is null or (select erp_is_admin()) then
    return new;
  end if;
  if coalesce(new.data->>'accessRole', 'Contributor') <> 'Contributor'
     or coalesce(jsonb_array_length(coalesce(new.data->'access', '[]'::jsonb)), 0) > 0 then
    raise exception 'Only an administrator can grant access on a new employee';
  end if;
  return new;
end;
$$;

drop trigger if exists employees_guard_access_insert_trg on employees;
create trigger employees_guard_access_insert_trg
  before insert on employees
  for each row execute function employees_guard_access_insert();

-- ════════════════════════════════════════════════════════════════════════
--  Leads at scale
-- ════════════════════════════════════════════════════════════════════════
-- Sized for tens of thousands of leads. Syncing the whole table to the
-- browser and filtering client-side (the pattern the rest of lib/db uses)
-- stops working somewhere around a couple of thousand rows: the payload,
-- the re-parse on every realtime change, and rendering the rows all grow
-- linearly. So the Leads page queries through the functions below instead,
-- filtering, sorting, counting and bulk writes all happen in the database,
-- and the client only ever holds one page.
--
-- Every function here is SECURITY INVOKER (the default) on purpose: that
-- makes RLS apply to the queries inside them, so a member's search, counts
-- and bulk actions silently scope to the leads they're allowed to touch.
-- Marking any of them SECURITY DEFINER would bypass the policies above and
-- hand out every lead.

-- Re-runnability across versions of this file: CREATE OR REPLACE FUNCTION
-- refuses to change a function's return type ("cannot change return type of
-- existing function"), so any earlier definition has to go first. Dropping by
-- OID covers every past signature without having to spell them out, and these
-- are only ever called from the app, so nothing in the database depends on
-- them.
do $$
declare
  r record;
begin
  for r in
    select oid::regprocedure as sig
      from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname in ('leads_search', 'leads_get', 'leads_stats', 'leads_stage_counts',
         'leads_access_level', 'leads_matches', 'leads_apply_assign',
         'leads_apply_status', 'leads_apply_delete', 'leads_apply_grant',
         'leads_grant_counts', 'leads_dedupe_index', 'leads_log_bulk_activity')
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;

-- Estimated deal value was dropped from the feature: these leads are tracked
-- as contacts to work, not as revenue. Removing the generated column too, so
-- a database that ran an earlier version of this file doesn't keep an unused
-- column (and an index) nothing reads. No data is lost, it was always
-- derived from `data`.
alter table leads drop column if exists estimated_value;

-- Casting jsonb text to a date/timestamp in a generated column has to be
-- immutable AND must not raise: one lead with "n/a" in a date field would
-- otherwise break every write to the table. These swallow bad values as NULL.
create or replace function erp_to_date(p_text text) returns date
language plpgsql immutable strict
as $$
begin
  return p_text::date;
exception when others then
  return null;
end;
$$;

-- Generated columns: the fields the page filters, sorts and aggregates by,
-- lifted out of `data` so they can be indexed. All GENERATED ALWAYS, so they
-- can't drift from the jsonb the app writes (same reasoning as assigned_to).
alter table leads add column if not exists company_name text
  generated always as (data->>'companyName') stored;
alter table leads add column if not exists priority text
  generated always as (data->>'priority') stored;
alter table leads add column if not exists source text
  generated always as (data->>'source') stored;
alter table leads add column if not exists follow_up_date date
  generated always as (erp_to_date(data->>'followUpDate')) stored;
-- Staleness is measured from updated_at, the last time anything on the lead
-- changed. There used to be a last_activity_at column derived from a
-- "lastContactedAt" field, written by a "log a call" button; that button is
-- gone (the activity trail and a campaign's Call Date are the record of
-- calls), so the column is dropped rather than left deriving from a field
-- nothing writes.
alter table leads drop column if exists last_activity_at;
-- One lowercased haystack for the search box. A LIKE scan over this is
-- comfortably fast at this table size and avoids needing pg_trgm.
--
-- A generated column's expression can't be ALTERed, only dropped and
-- recreated, so when this file adds a new field to the haystack (description
-- did), an existing column built from the old expression has to go first.
-- Checked rather than done unconditionally, because dropping and re-adding a
-- stored generated column rewrites the whole table.
do $$
declare
  v_definition text;
begin
  select pg_get_expr(d.adbin, d.adrelid)
    into v_definition
    from pg_attribute a
    join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'leads'::regclass
     and a.attname = 'search_text'
     and not a.attisdropped;

  if v_definition is not null and v_definition not like '%description%' then
    alter table leads drop column search_text;
  end if;
end $$;

alter table leads add column if not exists search_text text
  generated always as (lower(coalesce(data->>'companyName','') || ' ' ||
    coalesce(data->>'dba','') || ' ' ||
    coalesce(data->>'description','') || ' ' ||
    coalesce(data->>'pocName','') || ' ' ||
    coalesce(data->>'businessType','') || ' ' ||
    coalesce(data->>'email','') || ' ' ||
    coalesce(data->>'phone','') || ' ' ||
    coalesce(data->>'city','') || ' ' ||
    coalesce(data->>'state','') || ' ' ||
    coalesce(data->>'zip',''))) stored;

create index if not exists leads_company_name_idx     on leads (company_name);
create index if not exists leads_priority_idx         on leads (priority);
create index if not exists leads_source_idx           on leads (source);
create index if not exists leads_follow_up_date_idx   on leads (follow_up_date);
create index if not exists leads_updated_at_idx       on leads (updated_at desc);

-- Translates any lead still carrying a pre-simplification stage name. The
-- app maps these on read as well (LEGACY_STATUS in lib/db/leads.ts), but a
-- stale value in the column would quietly fall out of every stage filter and
-- count, so it's corrected in place too. Writes both the column and the
-- jsonb copy, which is the one the drawer reads.
update leads
   set status = v.mapped,
       data = data || jsonb_build_object('status', v.mapped)
  from (values
    ('won', 'appointment'), ('converted', 'appointment'),
    ('qualified', 'interested'), ('proposal', 'interested'), ('negotiation', 'interested'),
    ('lost', 'not_interested'), ('unqualified', 'not_interested')) as v(old, mapped)
 where leads.status = v.old;

-- Terminal stages, kept in one place so "still open" means the same thing
-- in SQL as it does in lib/leads-constants.ts. 'appointment' is not terminal:
-- the appointment still has to happen.
create or replace function leads_is_terminal(p_status text) returns boolean
language sql immutable
as $$
  select p_status in ('not_interested', 'do_not_call');
$$;

-- The shared filter predicate, expressed once. p_* nulls mean "don't filter".
create or replace function leads_matches(p_row          leads,
  p_search       text,
  p_status       text,
  p_assigned_to  text,
  p_priority     text,
  p_source       text,
  p_overdue      boolean,
  p_stale        boolean,
  p_stale_days   int) returns boolean
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
    and (not coalesce(p_overdue, false)
      or (p_row.follow_up_date is not null
          and p_row.follow_up_date < current_date
          and not leads_is_terminal(p_row.status)))
    and (not coalesce(p_stale, false)
      or (not leads_is_terminal(p_row.status)
          and p_row.updated_at < now() - make_interval(days => coalesce(p_stale_days, 14))));
$$;

-- The caller's effective rights on a lead, as a label the UI can render:
-- 'admin' | 'owner' | 'editor' | 'viewer'. Returned with every row so the
-- client never has to hold a list of grants to work out what it may offer,
-- that list is itself unbounded (an admin can share thousands of leads).
create or replace function leads_access_level(p_row leads) returns text
language sql stable
as $$
  select case
    when (select erp_is_admin()) then 'admin'
    when p_row.assigned_to is not null and p_row.assigned_to = (select erp_actor_employee_id()) then 'owner'
    when (select leads_has_global_grant(true)) then 'editor'
    -- Set membership, not leads_grant_level(p_row.id): the latter is a
    -- correlated subquery against lead_grants for every row on the page,
    -- while this is uncorrelated and gets hashed once per statement.
    when p_row.id in (select leads_granted_ids(true)) then 'editor'
    else 'viewer'
  end;
$$;

-- One page of leads. Sorting is whitelisted rather than interpolated, so a
-- sort key can never become SQL.
create or replace function leads_search(p_search       text default null,
  p_status       text default null,
  p_assigned_to  text default null,
  p_priority     text default null,
  p_source       text default null,
  p_overdue      boolean default false,
  p_stale        boolean default false,
  p_stale_days   int default 14,
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
  -- 57014 before). The `(select …)` wrappers do the same job for the RLS
  -- policies, where the expression is part of the outer query.
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
   where leads_matches(l, p_search, p_status, p_assigned_to, p_priority, p_source, p_overdue, p_stale, p_stale_days)
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

-- One lead by id, with the caller's rights on it, what the detail drawer
-- needs. Comes back empty (not an error) when the lead doesn't exist or the
-- caller can't see it, which the drawer reports as "no longer available".
create or replace function leads_get(p_id text)
returns table (id text, status text, data jsonb, access_level text)
language sql stable
as $$
  select l.id, l.status, l.data, leads_access_level(l)
    from leads l
   where l.id = p_id;
$$;

-- How many individual leads each person has been shared into, for the
-- lead-access review screen. Aggregated in SQL because the underlying
-- grant rows can number in the thousands.
create or replace function leads_grant_counts()
returns table (employee_id text, n bigint)
language sql stable
as $$
  select g.employee_id, count(*)::bigint
    from lead_grants g
   where g.lead_id is not null
   group by g.employee_id;
$$;

-- Headline counts for the filtered set. Computed in the database because a
-- count across 10,000 leads can't be derived from the one page the client
-- holds.
create or replace function leads_stats(p_search       text default null,
  p_status       text default null,
  p_assigned_to  text default null,
  p_priority     text default null,
  p_source       text default null,
  p_overdue      boolean default false,
  p_stale        boolean default false,
  p_stale_days   int default 14) returns table (total            bigint,
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
  where leads_matches(l, p_search, p_status, p_assigned_to, p_priority, p_source, p_overdue, p_stale, p_stale_days);
$$;

-- Per-stage counts for the stage board's column headers, so a column can say
-- "1,284 leads" while only rendering the first handful of cards.
create or replace function leads_stage_counts(p_search       text default null,
  p_assigned_to  text default null,
  p_priority     text default null,
  p_source       text default null,
  p_overdue      boolean default false,
  p_stale        boolean default false,
  p_stale_days   int default 14) returns table (status text, n bigint)
language sql stable
as $$
  select l.status, count(*)::bigint
    from leads l
   where leads_matches(l, p_search, null, p_assigned_to, p_priority, p_source, p_overdue, p_stale, p_stale_days)
   group by l.status;
$$;

-- ── Bulk writes ──────────────────────────────────────────────────────────
-- Each takes EITHER an explicit id list or the current filter set
-- (p_ids => null means "everything matching"), so assigning 10,000 leads is
-- one statement rather than ten thousand round trips, and the client never
-- has to ship 10,000 ids back to the server to do it.
--
-- These write through RLS (invoker rights), so they only ever touch rows the
-- caller is allowed to update, and the leads_guard_reassign trigger still
-- decides who may change an owner. They return how many rows actually
-- changed, which is what the UI reports, so a member attempting a bulk
-- action they lack rights for sees "0 updated" rather than a false success.

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
  p_stale_days    int default 14) returns bigint
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
       and (p_ids is not null or leads_matches(l, p_search, p_status, p_assigned_to, p_priority, p_source, p_overdue, p_stale, p_stale_days))
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
  p_stale_days   int default 14) returns bigint
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
       and (p_ids is not null or leads_matches(l, p_search, p_status, p_assigned_to, p_priority, p_source, p_overdue, p_stale, p_stale_days))
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
  p_stale_days   int default 14) returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  with deleted as (
    delete from leads l
     where (p_ids is null or l.id = any(p_ids))
       and (p_ids is not null or leads_matches(l, p_search, p_status, p_assigned_to, p_priority, p_source, p_overdue, p_stale, p_stale_days))
    returning 1
  )
  select count(*) into v_count from deleted;
  return v_count;
end;
$$;

-- Shares access to many leads at once. Replaces any existing per-lead grant
-- the person already had on the target set, so re-sharing at a different
-- level changes it rather than colliding on the unique index.
--
-- Only an administrator can do this: the insert runs through the
-- lead_grants policy, so for anyone else it raises rather than quietly
-- granting nothing.
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
  p_stale_days      int default 14) returns bigint
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
          and (p_ids is not null or leads_matches(l, p_search, p_status, p_assigned_to, p_priority, p_source, p_overdue, p_stale, p_stale_days)));

  with inserted as (
    insert into lead_grants (lead_id, employee_id, level, granted_by, granted_by_name)
    select l.id, p_employee_id, p_level, p_granted_by, p_granted_by_name
      from leads l
     where (p_ids is null or l.id = any(p_ids))
       and (p_ids is not null or leads_matches(l, p_search, p_status, p_assigned_to, p_priority, p_source, p_overdue, p_stale, p_stale_days))
       -- The owner already has full access; a grant on top would be noise in
       -- the "who can see this" list.
       and coalesce(l.assigned_to, '') <> p_employee_id
    returning 1
  )
  select count(*) into v_count from inserted;
  return v_count;
end;
$$;

-- Records one activity row per lead for a bulk action, without the client
-- sending an insert per lead. Same RLS as any other activity write.
create or replace function leads_log_bulk_activity(p_ids        text[],
  p_kind       text,
  p_summary    text,
  p_actor_id   text,
  p_actor_name text) returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  with inserted as (
    insert into lead_activity (lead_id, actor_id, actor_name, kind, summary, detail)
    select l.id, p_actor_id, p_actor_name, p_kind, p_summary, '{}'::jsonb
      from leads l
     where l.id = any(p_ids)
    returning 1
  )
  select count(*) into v_count from inserted;
  return v_count;
end;
$$;

-- A slim projection for CSV-import de-duplication: matching thousands of
-- incoming rows against what's already on file needs company/contact names
-- for every lead, but not the rest of each record.
create or replace function leads_dedupe_index()
returns table (id text, company_name text, poc_name text)
language sql stable
as $$
  select l.id, l.company_name, l.data->>'pocName' from leads l;
$$;

-- ── Realtime ─────────────────────────────────────────────────────────────
-- lib/supabase/realtime.ts subscribes per table and refetches on any change,
-- so these need to be in the publication or the pages won't live-update.
-- `leads` was never added by migration-leads.sql. Wrapped because
-- `alter publication ... add table` errors if the table is already a member,
-- and this file has to stay re-runnable.
do $$
begin
  begin alter publication supabase_realtime add table leads; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table lead_notes; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table lead_grants; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table lead_activity; exception when duplicate_object then null; end;
end $$;

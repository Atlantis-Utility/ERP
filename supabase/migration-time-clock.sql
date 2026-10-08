-- Clocking in and out.
--
-- One row per shift: clocked_in when somebody starts, clocked_out filled in
-- when they stop. An open shift is a row with no clocked_out, and a person
-- can only have one of those at a time — the partial unique index below is
-- what makes "clock in twice" impossible rather than something the client
-- has to remember to check.
--
-- Hours are not stored. They are clocked_out - clocked_in, and a stored
-- duration is one more thing that can disagree with the two timestamps it
-- came from.
--
-- Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists time_entries (
  id           uuid primary key default gen_random_uuid(),
  employee_id  text not null,
  clocked_in   timestamptz not null default now(),
  clocked_out  timestamptz,
  -- What they were on, when they say. Free text, theirs to fill in.
  note         text,
  -- Who last touched the row, for a shift an administrator corrected.
  updated_by      text,
  updated_by_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint time_entries_out_after_in check (clocked_out is null or clocked_out >= clocked_in)
);

create index if not exists time_entries_employee_idx on time_entries (employee_id, clocked_in desc);
create index if not exists time_entries_in_idx on time_entries (clocked_in desc);

-- One open shift per person. Two "clock in" taps, a second tab, or a stale
-- page replaying a click all land here and are refused by the database.
create unique index if not exists time_entries_one_open_per_employee
  on time_entries (employee_id) where clocked_out is null;

alter table time_entries enable row level security;

-- ── Who sees what ────────────────────────────────────────────────────────
-- Your own hours are yours to see and to record. Everybody else's are an
-- administrator's business: this is attendance, and a colleague's hours are
-- not something the person at the next desk needs.
drop policy if exists "own shifts or admin can read" on time_entries;
drop policy if exists "clock yourself in" on time_entries;
drop policy if exists "close your own shift" on time_entries;
drop policy if exists "admin can remove a shift" on time_entries;

create policy "own shifts or admin can read" on time_entries
  for select using (
    (select erp_is_admin()) or employee_id = (select erp_actor_employee_id())
  );

create policy "clock yourself in" on time_entries
  for insert with check (
    (select erp_is_admin()) or employee_id = (select erp_actor_employee_id())
  );

-- An administrator can correct a shift (a forgotten clock-out, a wrong
-- time); everybody else can only close their own.
create policy "close your own shift" on time_entries
  for update using (
    (select erp_is_admin()) or employee_id = (select erp_actor_employee_id())
  ) with check (
    (select erp_is_admin()) or employee_id = (select erp_actor_employee_id())
  );

create policy "admin can remove a shift" on time_entries
  for delete using ((select erp_is_admin()));

-- ── Hours by person, for the attendance page ─────────────────────────────
-- Summed in SQL rather than by pulling every shift to the browser: a year
-- of a team's shifts is tens of thousands of rows to answer "how many hours
-- in October". Invoker rights, so it sums only the rows the caller may read.
create or replace function time_clock_totals(p_from timestamptz default null,
  p_to timestamptz default null)
returns table (employee_id text,
  shifts        bigint,
  seconds       bigint,
  last_in       timestamptz,
  open_shift    boolean)
language sql stable
as $$
  select
    t.employee_id,
    count(*)::bigint,
    -- An open shift counts up to now, which is what somebody looking at a
    -- live attendance list expects to see.
    coalesce(sum(extract(epoch from (coalesce(t.clocked_out, now()) - t.clocked_in)))::bigint, 0),
    max(t.clocked_in),
    bool_or(t.clocked_out is null)
  from time_entries t
  where (p_from is null or t.clocked_in >= p_from)
    and (p_to is null or t.clocked_in < p_to)
  group by t.employee_id;
$$;

-- Only people on the Employees page can have an account at all.
--
-- Run once in the Supabase SQL editor, then turn the hook on (one dropdown,
-- see the end of this file). Safe to re-run.
--
-- The app already refuses a session whose address isn't on the employee
-- list, and the Zoho route checks before it mints anything. Both of those
-- happen *after* Supabase has created the account, which is the wrong place
-- for the rule to live: sign-up is open at the Supabase end, the anon key
-- ships in every browser bundle, and Microsoft OAuth creates a user for
-- whoever completes it. This moves the decision to the only place that can
-- actually prevent it.
--
-- Supabase calls this a "Before User Created" auth hook: GoTrue calls the
-- function with the user it is about to insert, and an error raised here
-- stops the insert. No row, no session, nothing to clean up afterwards.

create or replace function public.erp_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_email text := lower(coalesce(event->'user'->>'email', ''));
begin
  -- No address to check means no way to know who this is.
  if v_email = '' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'This workspace is invitation only.'
      )
    );
  end if;

  if exists (select 1 from employees e where lower(e.email) = v_email) then
    -- Nothing to say: an empty object means "carry on".
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'That address isn''t on the employee list. Ask an administrator to add you first.'
    )
  );
end;
$$;

-- GoTrue runs as supabase_auth_admin, which is outside the app's roles and
-- has no rights here by default.
grant execute on function public.erp_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.erp_before_user_created(jsonb) from authenticated, anon, public;

-- The function reads employees under definer rights, so it doesn't depend
-- on that table's policies applying to an auth-internal role.
grant usage on schema public to supabase_auth_admin;

-- ── Existing accounts ────────────────────────────────────────────────────
-- The hook only governs accounts created from now on. Anything already in
-- auth.users that doesn't match an employee is listed here rather than
-- deleted: removing a login is not something a migration should do quietly.
-- Run it, look at the result, and delete what shouldn't be there from
-- Authentication → Users.
--
--   select u.id, u.email, u.created_at, u.last_sign_in_at
--     from auth.users u
--    where not exists (
--            select 1 from employees e where lower(e.email) = lower(u.email)
--          )
--    order by u.created_at;

-- ── One correction while we're here ──────────────────────────────────────
-- user_profiles.is_admin is what the admin-only API routes trust
-- (lib/api-auth.ts). Every first sign-in used to set it true, whoever it
-- was, so somebody who is a Contributor on the Employees page can still be
-- an administrator to those routes. This lines the two up. Delete this
-- statement if you'd rather review it by hand first.
update user_profiles p
   set is_admin = ((e.data->>'accessRole') = 'Administrator')
  from employees e
 where lower(e.email) = lower(p.email)
   and p.is_admin is distinct from ((e.data->>'accessRole') = 'Administrator');

-- ── Nobody can make themselves an administrator ──────────────────────────
-- user_profiles.is_admin decided who could call the admin-only API routes,
-- and schema.sql's policy is "you may update your own row":
--
--   create policy "update own profile or admin" on user_profiles
--     for update using (uid = auth.uid() or is_admin())
--
-- which means anyone signed in could set it on themselves with a single
-- request. Hiding the Settings button was the only thing in the way.
--
-- Two changes. The API now decides "administrator" from the access role on
-- the employee record (lib/api-auth.ts), the same rule erp_is_admin() uses
-- in SQL, so this column is no longer what grants anything. And the column
-- stops being writable from a browser session at all: Settings grants
-- access through a route that checks first and writes with the service
-- key, which these grants don't touch.
revoke update (is_admin) on user_profiles from authenticated, anon;
revoke insert (is_admin) on user_profiles from authenticated, anon;

-- ── Turning the hook on ──────────────────────────────────────────────────
-- Dashboard → Authentication → Hooks → "Before User Created":
--   enable it, choose Postgres function, schema public,
--   function erp_before_user_created.
--
-- While you're in Authentication → Providers → Email, switch off
-- "Allow new users to sign up" as well. The hook makes it unnecessary, and
-- two locks are better than one.

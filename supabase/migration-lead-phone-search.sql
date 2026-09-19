-- Finding a lead by its phone number, however the number is written.
--
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Why this can't just use leads_search: search_text holds the number exactly
-- as it was imported ("805 487-8050", "(818)723-9403", "661 272-1225"), so
-- typing the ten digits off a caller ID matches nothing. The same number is
-- written three ways in this table.
--
-- So the digits get their own column, and the lookup compares digits to
-- digits. A caller ID gives you all ten; a sticky note often gives you the
-- last four; both work.

alter table leads add column if not exists phone_digits text
  generated always as (regexp_replace(coalesce(data->>'phone', ''), '[^0-9]', '', 'g')) stored;

-- Trigram, because the useful query is "ends with these four" or "contains
-- this", and a btree can't answer either. pg_trgm ships with Supabase; the
-- guard is for a database where it hasn't been enabled.
do $$
begin
  create extension if not exists pg_trgm;
exception
  when insufficient_privilege then
    raise notice 'pg_trgm not enabled, lead phone search will sequential scan';
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    create index if not exists leads_phone_digits_trgm_idx on leads using gin (phone_digits gin_trgm_ops);
  else
    create index if not exists leads_phone_digits_idx on leads (phone_digits);
  end if;
end $$;

-- Invoker rights on purpose: selecting from leads here runs under the
-- caller's read policy, so this can't become a way to see a lead that isn't
-- yours. Ordered so a number that ends with what you typed beats one that
-- merely contains it, which is what "last four digits" means in practice.
create or replace function leads_by_phone(p_digits text, p_limit int default 8)
returns table (id text, company_name text, phone text, city text, poc_name text)
language sql stable
as $$
  with q as (select regexp_replace(coalesce(p_digits, ''), '[^0-9]', '', 'g') as d)
  select l.id, l.company_name, l.data->>'phone', l.city, l.data->>'pocName'
    from leads l, q
   where length(q.d) >= 3
     and l.phone_digits <> ''
     and l.phone_digits like '%' || q.d || '%'
   order by (l.phone_digits like '%' || q.d) desc, l.company_name
   limit greatest(1, least(coalesce(p_limit, 8), 50));
$$;

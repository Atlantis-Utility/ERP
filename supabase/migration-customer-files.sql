-- Files kept against a customer: network diagrams, site photos, walkthrough
-- videos, the PDF the installer left behind.
--
-- The point of the thing is the network: a diagram nobody can find is a
-- diagram nobody drew. So it lives on the customer, next to their numbers
-- and their devices, rather than in somebody's Drive folder.
--
-- Two halves. The bytes go in a private storage bucket; this table is what
-- the app reads - what each file is, what it's called, who put it there -
-- because listing a bucket tells you names and sizes and nothing about
-- which diagram is the current one.
--
-- Run once in the Supabase SQL editor. Safe to re-run.

-- ── The bucket ───────────────────────────────────────────────────────────
-- Private. Nothing is served from a public URL; the app asks for a signed
-- one per file, which is also what lets a video stream instead of being
-- downloaded whole before it plays.
--
-- 50 MB a file, which is the default ceiling on Supabase's smaller plans.
-- Raise file_size_limit here (and in CUSTOMER_FILE_MAX in
-- lib/db/customer-files.ts, which is only there to say no politely before
-- the upload starts) if the plan allows more and somebody needs it.
insert into storage.buckets (id, name, public, file_size_limit)
values ('customer-files', 'customer-files', false, 52428800)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists "authenticated read customer files" on storage.objects;
drop policy if exists "authenticated write customer files" on storage.objects;
drop policy if exists "authenticated replace customer files" on storage.objects;
drop policy if exists "authenticated delete customer files" on storage.objects;
drop policy if exists "owner or admin replaces customer files" on storage.objects;
drop policy if exists "owner or admin deletes customer files" on storage.objects;

create policy "authenticated read customer files" on storage.objects
  for select using (bucket_id = 'customer-files' and auth.role() = 'authenticated');
create policy "authenticated write customer files" on storage.objects
  for insert with check (bucket_id = 'customer-files' and auth.role() = 'authenticated');

-- The bytes follow the same rule as the row that describes them. Without
-- this, somebody who may not delete the row may still delete the file it
-- points at, which leaves a tile in the gallery with nothing behind it -
-- worse than either outcome on its own.
create policy "owner or admin replaces customer files" on storage.objects
  for update using (
    bucket_id = 'customer-files' and (owner = auth.uid() or (select erp_is_admin()))
  );
create policy "owner or admin deletes customer files" on storage.objects
  for delete using (
    bucket_id = 'customer-files' and (owner = auth.uid() or (select erp_is_admin()))
  );

-- ── What each file is ────────────────────────────────────────────────────
create table if not exists customer_files (
  id          uuid primary key default gen_random_uuid(),
  -- The RingLogix domain id, the same key customer_profiles and
  -- customer_unifi_sites use. Customers have no local row of their own.
  customer_id text not null,
  -- The object key in the bucket. Unique, so a row can never point at a
  -- file another row also claims.
  path        text not null unique,
  -- What it was called on the way in, which is what it downloads as.
  name        text not null,
  -- What it *is*: "Main site network diagram", "Rack after the Jan swap".
  -- A folder of IMG_4821.jpg is the problem this column exists to avoid.
  title       text,
  caption     text,
  mime        text not null default 'application/octet-stream',
  size        bigint not null default 0,
  -- image | video | document. Worked out on the way in and stored, so the
  -- gallery doesn't re-derive it from a mime type on every render.
  kind        text not null default 'document',
  uploaded_by      text,
  uploaded_by_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint customer_files_kind_chk check (kind in ('image', 'video', 'document'))
);

create index if not exists customer_files_customer_idx on customer_files (customer_id, created_at desc);

alter table customer_files enable row level security;

drop policy if exists "authenticated read customer files" on customer_files;
drop policy if exists "authenticated add customer files" on customer_files;
drop policy if exists "authenticated label customer files" on customer_files;
drop policy if exists "uploader or admin can remove customer files" on customer_files;

-- Reading and adding follow the other customer tables (customer_profiles,
-- customer_unifi_sites): anybody signed in, because the Customers page is
-- what decides who sees a customer at all, and it is granted page by page.
create policy "authenticated read customer files" on customer_files
  for select using (auth.role() = 'authenticated');

create policy "authenticated add customer files" on customer_files
  for insert with check (auth.role() = 'authenticated');

-- Correcting a title or a caption is tidying, and anybody may tidy.
create policy "authenticated label customer files" on customer_files
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Removing is not tidying. A diagram is often the only record of how a site
-- was built, so it goes back to whoever put it there, or to an
-- administrator.
create policy "uploader or admin can remove customer files" on customer_files
  for delete using (
    (select erp_is_admin())
    or (uploaded_by is not null and uploaded_by = (select erp_actor_employee_id()))
  );

-- So a second person looking at the same customer sees a file arrive.
do $$
begin
  begin alter publication supabase_realtime add table customer_files; exception when duplicate_object then null; end;
end $$;

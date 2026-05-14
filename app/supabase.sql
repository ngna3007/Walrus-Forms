-- Walrus Forms Supabase schema.
--
-- Current app persistence:
-- - forms: builder drafts and published form cards
-- - allowlists: reusable wallet lists for Seal allowlist policies
--
-- Prepared for current roadmap/UI:
-- - submissions: indexed submission metadata + optional decoded payload cache
-- - submission_events: admin triage timeline and webhook/voting/reputation events

create table if not exists public.forms (
  id text primary key,
  owner_key text not null,
  title text not null,
  status text not null check (status in ('draft', 'published')),
  created_at_ms bigint not null,
  updated_at_ms bigint not null,
  submission_count integer not null default 0,
  schema jsonb,
  policy jsonb,
  webhooks jsonb,
  sui_form_object_id text,
  walrus_schema_blob_id text,
  package_id text,
  tx_digest text
);

create index if not exists forms_owner_updated_idx
  on public.forms (owner_key, updated_at_ms desc, created_at_ms desc);

create index if not exists forms_status_idx
  on public.forms (status);

create table if not exists public.allowlists (
  id text primary key,
  owner_key text not null,
  name text not null,
  members jsonb not null default '[]'::jsonb,
  created_at_ms bigint not null,
  updated_at_ms bigint not null
);

create index if not exists allowlists_owner_updated_idx
  on public.allowlists (owner_key, updated_at_ms desc, created_at_ms desc);

create table if not exists public.submissions (
  id text primary key,
  form_id text not null,
  owner_key text,
  submitter text,
  status integer not null default 0,
  submitted_at_ms bigint not null,
  updated_at_ms bigint not null,
  walrus_blob_id text not null,
  sui_submission_object_id text,
  tx_digest text,
  reputation_object_id text,
  encrypted boolean not null default false,
  decrypted boolean not null default false,
  payload jsonb,
  file_blob_ids jsonb not null default '[]'::jsonb
);

alter table public.submissions
  add column if not exists reputation_object_id text;

create index if not exists submissions_form_submitted_idx
  on public.submissions (form_id, submitted_at_ms desc);

create index if not exists submissions_status_idx
  on public.submissions (status);

create table if not exists public.submission_events (
  id uuid primary key default gen_random_uuid(),
  submission_id text not null references public.submissions(id) on delete cascade,
  form_id text not null,
  kind text not null,
  created_at_ms bigint not null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists submission_events_submission_idx
  on public.submission_events (submission_id, created_at_ms desc);

alter table public.forms enable row level security;
alter table public.allowlists enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_events enable row level security;

drop policy if exists "public demo read forms" on public.forms;
drop policy if exists "public demo insert forms" on public.forms;
drop policy if exists "public demo update forms" on public.forms;
drop policy if exists "public demo delete forms" on public.forms;
drop policy if exists "public demo read allowlists" on public.allowlists;
drop policy if exists "public demo insert allowlists" on public.allowlists;
drop policy if exists "public demo update allowlists" on public.allowlists;
drop policy if exists "public demo delete allowlists" on public.allowlists;
drop policy if exists "public demo read submissions" on public.submissions;
drop policy if exists "public demo insert submissions" on public.submissions;
drop policy if exists "public demo update submissions" on public.submissions;
drop policy if exists "public demo delete submissions" on public.submissions;
drop policy if exists "public demo read submission events" on public.submission_events;
drop policy if exists "public demo insert submission events" on public.submission_events;
drop policy if exists "public demo update submission events" on public.submission_events;
drop policy if exists "public demo delete submission events" on public.submission_events;

-- Owner-scoped policies. The client sends an `x-owner-key` header (configured in
-- supabaseHeaders) containing the connected wallet address. PostgREST exposes the
-- header via `request.header(name)`.
--
-- These are still demo-grade — header values are easy to spoof from any caller. For
-- production, replace with auth.uid()/jwt-based policies. But this is strictly
-- better than the previous "anon can read/write/delete anything" baseline.

create or replace function public.current_owner_key() returns text language sql stable as $$
  select coalesce(current_setting('request.header.x-owner-key', true), '');
$$;

-- Forms
create policy "owner reads own forms" on public.forms
  for select to anon using (owner_key = public.current_owner_key());
create policy "owner inserts own forms" on public.forms
  for insert to anon with check (owner_key = public.current_owner_key());
create policy "owner updates own forms" on public.forms
  for update to anon using (owner_key = public.current_owner_key())
                   with check (owner_key = public.current_owner_key());
create policy "owner deletes own forms" on public.forms
  for delete to anon using (owner_key = public.current_owner_key());

-- Allowlists
create policy "owner reads own allowlists" on public.allowlists
  for select to anon using (owner_key = public.current_owner_key());
create policy "owner inserts own allowlists" on public.allowlists
  for insert to anon with check (owner_key = public.current_owner_key());
create policy "owner updates own allowlists" on public.allowlists
  for update to anon using (owner_key = public.current_owner_key())
                   with check (owner_key = public.current_owner_key());
create policy "owner deletes own allowlists" on public.allowlists
  for delete to anon using (owner_key = public.current_owner_key());

-- Submissions: anyone can INSERT (any wallet can submit). Reads + updates require the
-- form owner's key to match. NO DELETE — preserves audit trail.
create policy "submissions public insert" on public.submissions
  for insert to anon with check (true);
create policy "submissions form owner read" on public.submissions
  for select to anon using (
    owner_key = public.current_owner_key()
    or exists (
      select 1 from public.forms
      where forms.id = submissions.form_id
        and forms.owner_key = public.current_owner_key()
    )
  );
create policy "submissions form owner update" on public.submissions
  for update to anon
  using (
    exists (select 1 from public.forms
            where forms.id = submissions.form_id
              and forms.owner_key = public.current_owner_key())
  )
  with check (
    exists (select 1 from public.forms
            where forms.id = submissions.form_id
              and forms.owner_key = public.current_owner_key())
  );

-- Submission events
create policy "events public insert" on public.submission_events
  for insert to anon with check (true);
create policy "events form owner read" on public.submission_events
  for select to anon using (
    exists (select 1 from public.forms
            where forms.id = submission_events.form_id
              and forms.owner_key = public.current_owner_key())
  );

-- Archive flag for forms (per-owner soft hide). Null = not archived.
alter table public.forms
  add column if not exists archived_at_ms bigint;

create index if not exists forms_owner_archived_idx
  on public.forms (owner_key, archived_at_ms);

-- Severity chosen by the form owner at resolve time. Mirrors what's emitted in
-- the on-chain `ReceiptMinted` event, but cached here so the admin UI can
-- restore the chip selection on reload without re-fetching the receipt object.
alter table public.submissions
  add column if not exists resolved_severity smallint;

-- Form subscriptions: per-wallet bookmark list. A wallet visits a public form
-- link and an entry lands here so the form shows up under "Shared with you" on
-- their dashboard. NOT a permission grant — the on-chain Seal allowlist is the
-- real gate. This table is purely UI-state.
create table if not exists public.form_subscriptions (
  owner_key text not null,
  form_id text not null,
  title text not null default '',
  form_owner_address text,
  policy_kind text,
  added_at_ms bigint not null,
  primary key (owner_key, form_id)
);

create index if not exists form_subscriptions_owner_idx
  on public.form_subscriptions (owner_key, added_at_ms desc);

alter table public.form_subscriptions enable row level security;

drop policy if exists "owner reads own subs" on public.form_subscriptions;
drop policy if exists "owner inserts own subs" on public.form_subscriptions;
drop policy if exists "owner updates own subs" on public.form_subscriptions;
drop policy if exists "owner deletes own subs" on public.form_subscriptions;

create policy "owner reads own subs" on public.form_subscriptions
  for select to anon using (owner_key = public.current_owner_key());
create policy "owner inserts own subs" on public.form_subscriptions
  for insert to anon with check (owner_key = public.current_owner_key());
create policy "owner updates own subs" on public.form_subscriptions
  for update to anon using (owner_key = public.current_owner_key())
                   with check (owner_key = public.current_owner_key());
create policy "owner deletes own subs" on public.form_subscriptions
  for delete to anon using (owner_key = public.current_owner_key());

-- PostgREST caches the table schema. After running `alter table ... add column`
-- (e.g. the `reputation_object_id` column above), it must be reloaded or new
-- columns surface as `PGRST204 Could not find the 'x' column ... in the schema cache`.
notify pgrst, 'reload schema';

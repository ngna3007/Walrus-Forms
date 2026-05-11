create table if not exists submissions (
  submission_id text primary key,
  form_id text not null,
  submitter text not null,
  status smallint not null,
  submitted_at_ms bigint not null,
  blob_id text not null,
  file_blob_ids text[] not null default '{}',
  indexed_at timestamptz not null default now()
);

create index if not exists submissions_form_status_time_idx
  on submissions (form_id, status, submitted_at_ms desc);

create index if not exists submissions_form_submitter_idx
  on submissions (form_id, submitter);

create table if not exists submission_statuses (
  submission_id text not null,
  checkpoint bigint not null,
  old_status smallint not null,
  new_status smallint not null,
  primary key (submission_id, checkpoint)
);

create table if not exists submitter_reputation (
  submitter text primary key,
  submissions bigint not null,
  resolved bigint not null,
  score bigint not null,
  reputation_object_id text,
  updated_at_checkpoint bigint not null
);

create table if not exists bounties (
  bounty_id text primary key,
  form_id text not null,
  sponsor text not null,
  token_type text not null,
  amount bigint not null,
  released boolean not null default false,
  recipient text,
  updated_at_checkpoint bigint not null
);

create table if not exists walrus_blobs (
  blob_id text primary key,
  form_id text,
  submission_id text,
  certified_epoch bigint,
  end_epoch bigint,
  metadata jsonb not null default '{}'
);

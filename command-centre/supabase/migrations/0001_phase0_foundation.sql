-- =============================================================================
-- BFC Command Centre — Phase 0 foundation
-- Roles, profiles, canonical member data model, audit log framework, RLS.
--
-- Guardrails encoded here:
--   * Default deny: RLS enabled on every table; access only via explicit policies.
--   * medical_forms and incident_reports are restricted to Owner/Director and
--     Child Safety Lead. General staff, coaches and finance have NO access.
--   * audit_logs can only be written through the log_audit() definer function
--     and only read by Owner/Director.
--   * Source system id + sync timestamp columns exist on every synced table.
--   * n8n writes arrive via the service role key (bypasses RLS by design);
--     the app itself uses the anon key + user JWT and is bound by these policies.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
create type public.bfc_role as enum (
  'owner_director',
  'operations_admin',
  'coach',
  'child_safety_lead',
  'finance',
  'general_staff'
);

-- ---------------------------------------------------------------------------
-- Staff profiles (one per auth user)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  role        public.bfc_role not null default 'general_staff',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-create a profile when a user signs up. New users start as general_staff
-- (least privilege); the Owner/Director promotes them.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role of the calling user; null when unauthenticated or deactivated.
-- SECURITY DEFINER so RLS policies can call it without recursing into
-- the profiles table's own policies.
create or replace function public.bfc_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text from public.profiles where id = auth.uid() and active;
$$;

create or replace function public.bfc_has_role(roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.bfc_role() = any (roles);
$$;

-- updated_at maintenance
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Audit log framework
-- Every sensitive view/write/export is logged by the app calling log_audit().
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id             bigint generated always as identity primary key,
  actor_id       uuid,
  actor_role     text,
  action         text not null,             -- e.g. member.view, medical_form.export
  resource_type  text not null,
  resource_id    text,
  details        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_resource_idx on public.audit_logs (resource_type, resource_id);

create or replace function public.log_audit(
  p_action        text,
  p_resource_type text,
  p_resource_id   text default null,
  p_details       jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (actor_id, actor_role, action, resource_type, resource_id, details)
  values (auth.uid(), public.bfc_role(), p_action, p_resource_type, p_resource_id, coalesce(p_details, '{}'::jsonb));
end;
$$;

grant execute on function public.log_audit(text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Canonical member record + fragmented source records
-- ---------------------------------------------------------------------------
create table public.members (
  id                 uuid primary key default gen_random_uuid(),
  full_name          text not null,
  preferred_name     text,
  primary_email      text,
  primary_phone      text,
  date_of_birth      date,
  is_youth           boolean not null default false,
  member_status      text not null default 'unknown',      -- active | inactive | lead | legacy | archived | unknown
  emergency_contact  jsonb,
  notes              text,
  merged_into        uuid references public.members (id),  -- set when a duplicate is merged (human-approved only)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index members_email_idx on public.members (lower(primary_email));
create index members_phone_idx on public.members (primary_phone);
create index members_name_idx on public.members (lower(full_name));

create trigger members_touch before update on public.members
  for each row execute function public.touch_updated_at();

-- One row per record in a source system. Linking to a canonical member is a
-- human-approved action; unmatched/suggested rows form the match queue.
create table public.member_source_records (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid references public.members (id) on delete set null,
  source_system     text not null,          -- clubworx | gocardless | xero | woocommerce | square | gmail | chatbot
  source_record_id  text not null,          -- the id in the source system (always visible in the UI)
  source_record_type text,                  -- e.g. member, customer, contact, lead
  display_name      text,
  email             text,
  phone             text,
  raw_data          jsonb not null default '{}'::jsonb,
  match_status      text not null default 'unmatched',   -- unmatched | suggested | matched | rejected
  match_confidence  numeric(4,3),           -- 0.000 - 1.000, set by the matcher
  matched_by        uuid references public.profiles (id),
  matched_at        timestamptz,
  first_seen_at     timestamptz not null default now(),
  last_synced_at    timestamptz not null default now(),
  unique (source_system, source_record_id)
);

create index msr_member_idx on public.member_source_records (member_id);
create index msr_match_queue_idx on public.member_source_records (match_status) where match_status in ('unmatched','suggested');
create index msr_email_idx on public.member_source_records (lower(email));

create table public.memberships (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid references public.members (id) on delete set null,
  source_system     text not null,
  source_record_id  text not null,
  membership_type   text,
  status            text,
  billing_provider  text,                   -- gocardless | ezidebit | square | manual | unknown
  amount            numeric(10,2),
  billing_interval  text,                   -- weekly | monthly | ...
  start_date        date,
  end_date          date,
  raw_data          jsonb not null default '{}'::jsonb,
  last_synced_at    timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (source_system, source_record_id)
);

create index memberships_member_idx on public.memberships (member_id);

create trigger memberships_touch before update on public.memberships
  for each row execute function public.touch_updated_at();

create table public.payment_events (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid references public.members (id) on delete set null,
  source_system     text not null,          -- gocardless | square | woocommerce | xero
  source_record_id  text not null,
  event_type        text not null,          -- payment_created | payment_failed | payment_paid | refund | chargeback | payout | order
  status            text,
  amount            numeric(10,2),
  currency          text not null default 'AUD',
  description       text,
  occurred_at       timestamptz,
  raw_data          jsonb not null default '{}'::jsonb,
  last_synced_at    timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  unique (source_system, source_record_id)  -- idempotency: re-delivered events can't duplicate
);

create index payment_events_member_idx on public.payment_events (member_id, occurred_at desc);
create index payment_events_failed_idx on public.payment_events (event_type, occurred_at desc) where event_type = 'payment_failed';

create table public.communication_events (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid references public.members (id) on delete set null,
  channel           text not null,          -- gmail | chatbot | phone | sms | in_person
  direction         text,                   -- inbound | outbound
  subject           text,
  summary           text,
  occurred_at       timestamptz,
  source_system     text,
  source_record_id  text,
  raw_data          jsonb not null default '{}'::jsonb,
  last_synced_at    timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index comm_events_member_idx on public.communication_events (member_id, occurred_at desc);

create table public.leads (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid references public.members (id) on delete set null,
  source            text,                   -- website_chatbot | web_form | walk_in | phone | referral
  full_name         text,
  email             text,
  phone             text,
  interested_class  text,
  stage             text not null default 'new_enquiry',
  -- new_enquiry | trial_booked | trial_attended | follow_up_required | joined | did_not_convert
  trial_date        date,
  assigned_to       uuid references public.profiles (id),
  lost_reason       text,
  notes             text,
  source_system     text,
  source_record_id  text,
  last_synced_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index leads_stage_idx on public.leads (stage);

create trigger leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();

create table public.tasks (
  id                    uuid primary key default gen_random_uuid(),
  title                 text not null,
  description           text,
  status                text not null default 'open',   -- open | in_progress | done | cancelled
  priority              text not null default 'normal', -- low | normal | high | urgent
  due_date              date,
  assigned_to           uuid references public.profiles (id),
  created_by            uuid references public.profiles (id),
  related_member_id     uuid references public.members (id) on delete set null,
  related_resource_type text,
  related_resource_id   text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index tasks_assignee_idx on public.tasks (assigned_to, status);
create index tasks_due_idx on public.tasks (due_date) where status in ('open','in_progress');

create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Compliance: policies + acknowledgements
-- ---------------------------------------------------------------------------
create table public.policy_versions (
  id                uuid primary key default gen_random_uuid(),
  policy_name       text not null,
  version           text not null,
  effective_date    date,
  review_date       date,
  required_audience text[] not null default '{}',   -- e.g. {members, youth_guardians, staff, coaches}
  document_url      text,
  body_text         text,
  is_current        boolean not null default false,
  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  unique (policy_name, version)
);

create table public.policy_acknowledgements (
  id                  uuid primary key default gen_random_uuid(),
  policy_version_id   uuid not null references public.policy_versions (id),
  member_id           uuid references public.members (id) on delete set null,
  profile_id          uuid references public.profiles (id),   -- staff acknowledgements
  acknowledged_by_name text,
  guardian_name       text,                                    -- youth: acknowledging guardian
  signature_method    text,                                    -- electronic | paper | in_app
  acknowledged_at     timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

create index policy_acks_version_idx on public.policy_acknowledgements (policy_version_id);
create index policy_acks_member_idx on public.policy_acknowledgements (member_id);

-- ---------------------------------------------------------------------------
-- RESTRICTED: medical forms and incident reports
-- Owner/Director and Child Safety Lead only. Schema exists in Phase 0 so RLS
-- is proven before any real data is collected (Phase 3 builds the workflows).
-- ---------------------------------------------------------------------------
create table public.medical_forms (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references public.members (id),
  form_type         text not null default 'medical_participation',
  status            text not null default 'draft',    -- draft | submitted | expired | superseded
  data              jsonb not null default '{}'::jsonb,
  guardian_consent  boolean,
  privacy_notice_version text,
  submitted_at      timestamptz,
  expires_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index medical_forms_member_idx on public.medical_forms (member_id);

create trigger medical_forms_touch before update on public.medical_forms
  for each row execute function public.touch_updated_at();

create table public.incident_reports (
  id                 uuid primary key default gen_random_uuid(),
  category           text not null,                    -- injury | child_safety | behaviour | facility | other
  severity           text not null default 'low',      -- low | medium | high | critical
  status             text not null default 'open',     -- open | under_review | closed
  occurred_at        timestamptz,
  location           text,
  description        text,
  people_involved    jsonb not null default '[]'::jsonb,
  witnesses          jsonb not null default '[]'::jsonb,
  immediate_actions  text,
  follow_up_actions  text,
  review_date        date,
  outcome_notes      text,                              -- required before closing (enforced in app)
  closed_at          timestamptz,
  reported_by        uuid references public.profiles (id),
  assigned_to        uuid references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index incident_reports_status_idx on public.incident_reports (status);

create trigger incident_reports_touch before update on public.incident_reports
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Sync bookkeeping (written by n8n via the service role)
-- ---------------------------------------------------------------------------
create table public.sync_runs (
  id                 uuid primary key default gen_random_uuid(),
  source_system      text not null,
  run_type           text not null default 'scheduled',   -- scheduled | webhook | manual | backfill
  status             text not null default 'running',     -- running | success | error
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  records_processed  integer not null default 0,
  records_created    integer not null default 0,
  records_updated    integer not null default 0,
  error_message      text,
  details            jsonb not null default '{}'::jsonb
);

create index sync_runs_source_idx on public.sync_runs (source_system, started_at desc);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table public.profiles                enable row level security;
alter table public.audit_logs              enable row level security;
alter table public.members                 enable row level security;
alter table public.member_source_records   enable row level security;
alter table public.memberships             enable row level security;
alter table public.payment_events          enable row level security;
alter table public.communication_events    enable row level security;
alter table public.leads                   enable row level security;
alter table public.tasks                   enable row level security;
alter table public.policy_versions         enable row level security;
alter table public.policy_acknowledgements enable row level security;
alter table public.medical_forms           enable row level security;
alter table public.incident_reports        enable row level security;
alter table public.sync_runs               enable row level security;

-- profiles -------------------------------------------------------------------
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

create policy profiles_select_owner on public.profiles
  for select using (public.bfc_has_role(array['owner_director']));

-- Staff list (name + role) is needed for task assignment by ops admin.
create policy profiles_select_ops on public.profiles
  for select using (public.bfc_has_role(array['operations_admin']));

-- Only the Owner/Director manages users and roles. Users cannot change their
-- own role (no self-update policy).
create policy profiles_update_owner on public.profiles
  for update using (public.bfc_has_role(array['owner_director']));

-- audit_logs -----------------------------------------------------------------
-- Insert ONLY via log_audit() (security definer). Read: Owner/Director.
create policy audit_logs_select_owner on public.audit_logs
  for select using (public.bfc_has_role(array['owner_director']));

-- members / source records / memberships --------------------------------------
-- All active staff can read the member directory (the app limits what each
-- role's screens show; sensitive data lives in restricted tables, not here).
create policy members_select_staff on public.members
  for select using (public.bfc_role() is not null);

create policy members_write_admin on public.members
  for insert with check (public.bfc_has_role(array['owner_director','operations_admin']));
create policy members_update_admin on public.members
  for update using (public.bfc_has_role(array['owner_director','operations_admin']));
create policy members_delete_owner on public.members
  for delete using (public.bfc_has_role(array['owner_director']));

create policy msr_select_admin on public.member_source_records
  for select using (public.bfc_has_role(array['owner_director','operations_admin','finance']));
create policy msr_update_admin on public.member_source_records
  for update using (public.bfc_has_role(array['owner_director','operations_admin']));

create policy memberships_select_staff on public.memberships
  for select using (public.bfc_role() is not null);
create policy memberships_write_admin on public.memberships
  for update using (public.bfc_has_role(array['owner_director','operations_admin']));

-- payment_events: finance-facing roles only ----------------------------------
create policy payments_select_finance on public.payment_events
  for select using (public.bfc_has_role(array['owner_director','operations_admin','finance']));

-- communication_events --------------------------------------------------------
create policy comms_select_admin on public.communication_events
  for select using (public.bfc_has_role(array['owner_director','operations_admin']));

-- leads ------------------------------------------------------------------------
create policy leads_select_admin on public.leads
  for select using (public.bfc_has_role(array['owner_director','operations_admin']));
create policy leads_write_admin on public.leads
  for insert with check (public.bfc_has_role(array['owner_director','operations_admin']));
create policy leads_update_admin on public.leads
  for update using (public.bfc_has_role(array['owner_director','operations_admin']));

-- tasks -------------------------------------------------------------------------
-- Everyone sees their own tasks; owner/ops see all. Any active staff can create.
create policy tasks_select_own on public.tasks
  for select using (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or public.bfc_has_role(array['owner_director','operations_admin'])
  );
create policy tasks_insert_staff on public.tasks
  for insert with check (public.bfc_role() is not null and created_by = auth.uid());
create policy tasks_update_own on public.tasks
  for update using (
    assigned_to = auth.uid()
    or public.bfc_has_role(array['owner_director','operations_admin'])
  );

-- policy_versions: all staff read; owner/ops manage ---------------------------
create policy policies_select_staff on public.policy_versions
  for select using (public.bfc_role() is not null);
create policy policies_write_admin on public.policy_versions
  for insert with check (public.bfc_has_role(array['owner_director','operations_admin']));
create policy policies_update_admin on public.policy_versions
  for update using (public.bfc_has_role(array['owner_director','operations_admin']));

-- policy_acknowledgements ------------------------------------------------------
create policy policy_acks_select on public.policy_acknowledgements
  for select using (
    profile_id = auth.uid()
    or public.bfc_has_role(array['owner_director','operations_admin','child_safety_lead'])
  );
create policy policy_acks_insert on public.policy_acknowledgements
  for insert with check (public.bfc_has_role(array['owner_director','operations_admin','child_safety_lead']));

-- RESTRICTED tables ------------------------------------------------------------
-- medical_forms + incident_reports: Owner/Director and Child Safety Lead ONLY.
create policy medical_select_restricted on public.medical_forms
  for select using (public.bfc_has_role(array['owner_director','child_safety_lead']));
create policy medical_insert_restricted on public.medical_forms
  for insert with check (public.bfc_has_role(array['owner_director','child_safety_lead']));
create policy medical_update_restricted on public.medical_forms
  for update using (public.bfc_has_role(array['owner_director','child_safety_lead']));

create policy incidents_select_restricted on public.incident_reports
  for select using (public.bfc_has_role(array['owner_director','child_safety_lead']));
create policy incidents_insert_restricted on public.incident_reports
  for insert with check (public.bfc_has_role(array['owner_director','child_safety_lead']));
create policy incidents_update_restricted on public.incident_reports
  for update using (public.bfc_has_role(array['owner_director','child_safety_lead']));

-- sync_runs ---------------------------------------------------------------------
create policy sync_runs_select_admin on public.sync_runs
  for select using (public.bfc_has_role(array['owner_director','operations_admin','finance']));

-- =============================================================================
-- First owner bootstrap (run manually AFTER creating Kaleb's auth user):
--   update public.profiles set role = 'owner_director', full_name = 'Kaleb Heffernan'
--   where id = '<auth-user-uuid>';
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Grants: allow the authenticated role to operate on all tables.
-- RLS policies above control which rows each role can actually access.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

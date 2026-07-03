-- =============================================================================
-- BFC Command Centre — Phase 2: tasks, leads, email review, cancellations,
-- supplier invoices.
--
-- New tables:
--   * email_review_queue     — Gmail classification suggestions awaiting a
--                              human decision. n8n inserts suggestions and
--                              applies approved actions back in Gmail.
--   * cancellation_requests  — membership cancellation / pause intake
--                              (chatbot, form, email, staff), review states.
--   * supplier_invoices      — scanned supplier invoices needing review /
--                              payment bookkeeping (no payment execution).
--
-- Guardrails enforced IN THE DATABASE:
--   * An email suggestion whose category is protected (complaint, legal,
--     safeguarding, cancellation, chargeback, medical) can NEVER be approved
--     for archiving — trigger raises an exception.
--   * The app never sends email or pays anything; status fields are
--     bookkeeping for actions humans perform (or approve n8n to perform:
--     labelling and DRAFT creation only).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Email classification review queue
-- ---------------------------------------------------------------------------
create table public.email_review_queue (
  id                 uuid primary key default gen_random_uuid(),
  gmail_message_id   text not null unique,
  gmail_thread_id    text,
  from_address       text,
  subject            text,
  snippet            text,
  received_at        timestamptz,
  category           text,                     -- payments_failed | leads_new | supplier_invoice | cancellation | complaint | legal | safeguarding | routine | other
  protected          boolean not null default false,  -- complaint/legal/safeguarding/cancellation/chargeback/medical
  suggested_label    text,                     -- e.g. BFC/Payments/Failed
  suggested_action   text not null default 'label',   -- label | archive | draft_reply | create_task | none
  ai_summary         text,
  ai_draft_reply     text,                     -- draft only; approval creates a Gmail DRAFT, never sends
  confidence         text,                     -- high | medium | low
  status             text not null default 'pending', -- pending | approved | rejected | skipped
  decided_by         uuid references public.profiles (id),
  decided_at         timestamptz,
  applied_at         timestamptz,              -- set by n8n after applying the approved action
  apply_error        text,
  created_at         timestamptz not null default now(),
  last_synced_at     timestamptz not null default now()
);

create index erq_status_idx on public.email_review_queue (status, received_at desc);

-- Protected mail can never be approved for archiving, no matter who asks.
create or replace function public.guard_email_review()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'approved' and new.suggested_action = 'archive' and new.protected then
    raise exception 'Protected email categories can never be archived (guardrail)';
  end if;
  if new.status in ('approved','rejected') and old.status = 'pending' then
    new.decided_at := coalesce(new.decided_at, now());
    new.decided_by := coalesce(new.decided_by, auth.uid());
  end if;
  return new;
end;
$$;

create trigger email_review_guard before update on public.email_review_queue
  for each row execute function public.guard_email_review();

-- ---------------------------------------------------------------------------
-- Cancellation / pause intake
-- ---------------------------------------------------------------------------
create table public.cancellation_requests (
  id                 uuid primary key default gen_random_uuid(),
  request_type       text not null default 'cancellation',  -- cancellation | pause
  member_id          uuid references public.members (id) on delete set null,
  full_name          text,
  email              text,
  phone              text,
  membership_type    text,
  reason             text,
  preferred_last_date date,
  comments           text,
  intake_source      text,                     -- chatbot | web_form | email | staff_phone
  status             text not null default 'new',  -- new | in_progress | processed | retained | withdrawn
  outcome_notes      text,
  processed_by       uuid references public.profiles (id),
  processed_at       timestamptz,
  source_system      text,
  source_record_id   text,
  last_synced_at     timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (source_system, source_record_id)
);

create index cancellations_status_idx on public.cancellation_requests (status, created_at desc);

create trigger cancellations_touch before update on public.cancellation_requests
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Supplier invoices (from the Gmail invoice scanner)
-- ---------------------------------------------------------------------------
create table public.supplier_invoices (
  id                 uuid primary key default gen_random_uuid(),
  supplier           text,
  amount             numeric(10,2),
  currency           text not null default 'AUD',
  gst                numeric(10,2),
  invoice_reference  text,
  due_date           date,
  description        text,
  email_link         text,
  status             text not null default 'pending_review',
  -- pending_review | reviewed | paid | disputed | not_an_invoice
  -- "paid" records that a human paid it via the bank/Xero — the app never pays.
  reviewed_by        uuid references public.profiles (id),
  reviewed_at        timestamptz,
  notes              text,
  source_system      text,
  source_record_id   text,
  last_synced_at     timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (source_system, source_record_id)
);

create index supplier_invoices_due_idx on public.supplier_invoices (due_date)
  where status in ('pending_review','reviewed');

create trigger supplier_invoices_touch before update on public.supplier_invoices
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.email_review_queue    enable row level security;
alter table public.cancellation_requests enable row level security;
alter table public.supplier_invoices     enable row level security;

-- Email review: Owner/Director + Operations Admin. Inserts come from n8n via
-- the service role (bypasses RLS); the app only reads and decides.
create policy erq_select_admin on public.email_review_queue
  for select using (public.bfc_has_role(array['owner_director','operations_admin']));
create policy erq_update_admin on public.email_review_queue
  for update using (public.bfc_has_role(array['owner_director','operations_admin']));

-- Cancellations: Owner/Director + Ops manage; Finance may read (revenue impact).
create policy cancellations_select on public.cancellation_requests
  for select using (public.bfc_has_role(array['owner_director','operations_admin','finance']));
create policy cancellations_insert on public.cancellation_requests
  for insert with check (public.bfc_has_role(array['owner_director','operations_admin']));
create policy cancellations_update on public.cancellation_requests
  for update using (public.bfc_has_role(array['owner_director','operations_admin']));

-- Supplier invoices: Owner/Director + Ops + Finance.
create policy invoices_select on public.supplier_invoices
  for select using (public.bfc_has_role(array['owner_director','operations_admin','finance']));
create policy invoices_update on public.supplier_invoices
  for update using (public.bfc_has_role(array['owner_director','operations_admin','finance']));

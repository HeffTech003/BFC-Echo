-- Migration: 0007_xero_contacts_ledger.sql
-- Creates xero_contacts table to store ALL Xero contacts (customers, suppliers,
-- bank payees, etc.) for expense and budget tracking.
-- Only IsCustomer=true contacts should flow into member_source_records.

-- ============================================================
-- TABLE: xero_contacts
-- ============================================================
create table if not exists public.xero_contacts (
  id                uuid        primary key default gen_random_uuid(),
  xero_contact_id   text        unique not null,
  name              text        not null,

  -- Xero contact type flags (from Xero API)
  is_customer       boolean     default false,
  is_supplier       boolean     default false,

  -- BFC classification: 'member', 'supplier', 'bank_payee', 'staff', 'other'
  contact_type      text        default 'other',

  -- Contact details
  email             text,
  phone             text,
  account_number    text,

  -- Xero status
  contact_status    text        default 'ACTIVE',

  -- Sync metadata
  synced_at         timestamptz default now(),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

comment on table public.xero_contacts is
  'All Xero contacts including suppliers, bank payees, and members. '
  'Used for expense categorisation and budgeting. '
  'Only IsCustomer contacts are also synced to member_source_records.';

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_xero_contacts_type
  on public.xero_contacts (contact_type);

create index if not exists idx_xero_contacts_is_customer
  on public.xero_contacts (is_customer);

create index if not exists idx_xero_contacts_is_supplier
  on public.xero_contacts (is_supplier);

create index if not exists idx_xero_contacts_status
  on public.xero_contacts (contact_status);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
create trigger xero_contacts_updated_at
  before update on public.xero_contacts
  for each row execute function public.handle_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.xero_contacts enable row level security;

create policy "Authenticated users can read xero_contacts"
  on public.xero_contacts for select
  to authenticated
  using (true);

create policy "Service role can manage xero_contacts"
  on public.xero_contacts for all
  to service_role
  using (true)
  with check (true);

-- ============================================================
-- GRANTS
-- ============================================================
grant select on public.xero_contacts to authenticated;
grant all    on public.xero_contacts to service_role;

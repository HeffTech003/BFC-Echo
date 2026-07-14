-- =============================================================================
-- BFC Command Centre — Pending SQL fixes
-- Run each block in Supabase SQL Editor (copy/paste one section at a time)
-- =============================================================================


-- =============================================================================
-- STEP 1 — Diagnostic: Clubworx raw_data status values
-- (Run first to see what status strings Clubworx uses)
-- =============================================================================
SELECT
  msr.raw_data->>'status' AS clubworx_status,
  COUNT(*)                AS count
FROM public.member_source_records msr
WHERE msr.source_system = 'clubworx'
GROUP BY 1
ORDER BY 2 DESC;


-- =============================================================================
-- STEP 2 — Diagnostic: How many Clubworx-active members are NOT active in BFC?
-- (Shows the gap between Clubworx 129 active vs BFC 67 active)
-- =============================================================================
SELECT
  m.member_status AS bfc_status,
  COUNT(*)        AS count
FROM public.member_source_records msr
JOIN public.members m ON m.id = msr.member_id
WHERE msr.source_system = 'clubworx'
  AND msr.raw_data->>'status' = 'active'
  AND m.merged_into IS NULL
GROUP BY 1
ORDER BY 2 DESC;


-- =============================================================================
-- STEP 3 — Fix: Sync active status from Clubworx raw_data into members table
-- Only updates members that are NOT already active in BFC
-- Safe to run — only promotes, never demotes
-- =============================================================================
UPDATE public.members m
SET member_status = 'active'
FROM public.member_source_records msr
WHERE msr.member_id = m.id
  AND msr.source_system = 'clubworx'
  AND msr.raw_data->>'status' ILIKE 'active'   -- Clubworx uses 'Active' (capital A)
  AND m.member_status != 'active'
  AND m.merged_into IS NULL
  AND m.member_type IN ('gym_member', 'nac', 'online_customer', 'staff');

-- Verify: should show closer to 129 active
SELECT member_status, member_type, COUNT(*)
FROM public.members
WHERE merged_into IS NULL
  AND member_type IN ('gym_member', 'nac', 'online_customer', 'staff')
GROUP BY 1, 2
ORDER BY 1, 2;


-- =============================================================================
-- STEP 4 — Task #100: Backfill phone / DOB / join date from Clubworx raw_data
-- COALESCE means it only fills NULLs — never overwrites existing data
-- =============================================================================

-- Preview what will change (run this first to check):
SELECT
  m.id,
  m.full_name,
  m.primary_phone,
  msr.raw_data->>'mobile_number'  AS cw_mobile,
  msr.raw_data->>'phone'          AS cw_phone,
  m.date_of_birth,
  msr.raw_data->>'date_of_birth'  AS cw_dob,
  m.joined_at,
  msr.raw_data->>'created_on'     AS cw_created_on
FROM public.members m
JOIN public.member_source_records msr ON msr.member_id = m.id
WHERE msr.source_system = 'clubworx'
  AND m.merged_into IS NULL
  AND (
    (m.primary_phone IS NULL AND (msr.raw_data->>'mobile_number' IS NOT NULL OR msr.raw_data->>'phone' IS NOT NULL))
    OR (m.date_of_birth IS NULL AND msr.raw_data->>'date_of_birth' IS NOT NULL)
    OR (m.joined_at IS NULL AND msr.raw_data->>'created_on' IS NOT NULL)
  )
LIMIT 20;

-- Then run the actual update:
UPDATE public.members m
SET
  primary_phone = COALESCE(
    m.primary_phone,
    msr.raw_data->>'mobile_number',
    msr.raw_data->>'phone'
  ),
  date_of_birth = COALESCE(
    m.date_of_birth,
    CASE
      WHEN msr.raw_data->>'date_of_birth' ~ '^\d{4}-\d{2}-\d{2}$'
      THEN (msr.raw_data->>'date_of_birth')::date
    END
  ),
  joined_at = COALESCE(
    m.joined_at,
    CASE
      WHEN msr.raw_data->>'created_on' ~ '^\d{4}-\d{2}-\d{2}'
      THEN (msr.raw_data->>'created_on')::date
    END
  )
FROM public.member_source_records msr
WHERE msr.member_id = m.id
  AND msr.source_system = 'clubworx'
  AND m.merged_into IS NULL;

-- Verify: count members that now have phone/dob/joined_at
SELECT
  COUNT(*) FILTER (WHERE primary_phone IS NOT NULL) AS has_phone,
  COUNT(*) FILTER (WHERE date_of_birth IS NOT NULL) AS has_dob,
  COUNT(*) FILTER (WHERE joined_at     IS NOT NULL) AS has_joined_at,
  COUNT(*)                                           AS total
FROM public.members
WHERE merged_into IS NULL
  AND member_type IN ('gym_m

-- =============================================================================
-- STEP 8 — Task #15: Coach certifications table (WWCC, First Aid, Police Check)
-- =============================================================================
-- Run this once to create the table. Then use the Compliance page to manage records.
-- cert_type: 'wwcc' | 'first_aid' | 'police_check' | 'other'
-- status:    'pending' | 'current' | 'expired' | 'not_required'
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.coach_certifications (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id   uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  cert_type   text        NOT NULL CHECK (cert_type IN ('wwcc', 'first_aid', 'police_check', 'other')),
  cert_number text,
  issued_at   date,
  expires_at  date,
  status      text        NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'current', 'expired', 'not_required')),
  notes       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_coach_certs_member   ON public.coach_certifications(member_id);
CREATE INDEX IF NOT EXISTS idx_coach_certs_type     ON public.coach_certifications(cert_type);
CREATE INDEX IF NOT EXISTS idx_coach_certs_expires  ON public.coach_certifications(expires_at);

-- RLS (only owner_director / operations_admin / child_safety_lead can read; coaches see own)
ALTER TABLE public.coach_certifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_can_view_own_certs" ON public.coach_certifications
  FOR SELECT USING (
    member_id IN (
      SELECT m.id FROM public.members m
      JOIN public.profiles p ON p.member_id = m.id
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "managers_can_manage_certs" ON public.coach_certifications
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('owner_director', 'operations_admin', 'child_safety_lead')
    )
  );

-- Seed: auto-mark expired for any cert where expires_at < today
-- (Run periodically or trigger from n8n)
-- UPDATE public.coach_certifications SET status = 'expired'
-- WHERE expires_at < CURRENT_DATE AND status = 'current';

-- Verify:
-- SELECT cert_type, status, COUNT(*) FROM public.coach_certifications GROUP BY 1, 2;


-- =============================================================================
-- STEP 9 — Task #17: Coach compliance expiry alert automation
-- =============================================================================
-- Run Step 9a manually (or via cron/n8n) to keep cert statuses fresh.
-- Step 9b documents the n8n workflow to build for email alerts.
-- =============================================================================

-- 9a — Auto-expire certs where expires_at < today
-- Safe to re-run (only updates rows that are actually expired)
UPDATE public.coach_certifications
SET status = 'expired', updated_at = now()
WHERE expires_at < CURRENT_DATE
  AND status = 'current';

-- 9b — Verify: how many certs are expiring in next 60 days?
SELECT
  m.full_name,
  cc.cert_type,
  cc.expires_at,
  cc.status,
  (cc.expires_at - CURRENT_DATE) AS days_until_expiry
FROM public.coach_certifications cc
JOIN public.members m ON m.id = cc.member_id
WHERE cc.expires_at BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '60 days')
  AND cc.status = 'current'
ORDER BY cc.expires_at;

-- 9c — Full compliance summary for email digest:
-- For each coach × cert_type, show status. Missing = no row exists.
SELECT
  m.full_name          AS coach,
  m.primary_email,
  cc.cert_type,
  cc.expires_at,
  cc.status,
  CASE
    WHEN cc.id IS NULL                                        THEN 'missing'
    WHEN cc.status = 'expired'                                THEN 'expired'
    WHEN cc.status = 'not_required'                           THEN 'not_required'
    WHEN cc.expires_at < CURRENT_DATE                         THEN 'expired'
    WHEN cc.expires_at < (CURRENT_DATE + INTERVAL '60 days') THEN 'expiring_soon'
    ELSE 'ok'
  END AS alert_level
FROM public.members m
CROSS JOIN (VALUES ('wwcc'), ('first_aid'), ('police_check')) AS t(cert_type)
LEFT JOIN public.coach_certifications cc
       ON cc.member_id = m.id AND cc.cert_type = t.cert_type
WHERE m.member_type = 'staff'
  AND m.member_status = 'active'
  AND m.merged_into IS NULL
ORDER BY m.full_name, t.cert_type;

-- =============================================================================
-- n8n WF: Compliance Expiry Alert (build in n8n canvas)
-- =============================================================================
-- Trigger: CRON — every Monday at 8am AEST (cron: 0 22 * * 0  in UTC)
--
-- Steps:
-- 1. [Supabase node] Run query 9c above — returns coach × cert rows with alert_level
-- 2. [IF node]       Filter to rows where alert_level IN ('expired', 'expiring_soon', 'missing')
-- 3. [Code node]     Group by coach, build per-coach summary:
--                    { email, full_name, issues: [{cert_type, alert_level, expires_at}] }
-- 4. [IF node]       Skip coaches with no issues
-- 5. [Gmail node]    Send to each coach + BCC to owner:
--                    Subject: "Action required: compliance certifications — {{ full_name }}"
--                    Body: list their specific cert issues with expiry dates + next steps
-- 6. [Supabase node] Log each alert in audit_logs (action = 'compliance.alert_sent')
-- =============================================================================


-- =============================================================================
-- STEP 10 — Task #20: Coach hours and classes log
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.class_sessions (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id         uuid        NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  class_name       text        NOT NULL,
  class_type       text        NOT NULL DEFAULT 'group'
                   CHECK (class_type IN ('group', 'private', 'semi_private', 'admin', 'other')),
  session_date     date        NOT NULL,
  start_time       time,
  duration_minutes int         NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  attendee_count   int,
  notes            text,
  created_by       uuid        REFERENCES public.profiles(id),
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_sessions_coach ON public.class_sessions(coach_id);
CREATE INDEX IF NOT EXISTS idx_class_sessions_date  ON public.class_sessions(session_date);

ALTER TABLE public.class_sessions ENABLE ROW LEVEL SECURITY;

-- Coaches can see their own sessions; managers see all
CREATE POLICY "coaches_see_own_sessions" ON public.class_sessions
  FOR SELECT USING (
    coach_id IN (
      SELECT m.id FROM public.members m
      JOIN public.profiles p ON p.member_id = m.id
      WHERE p.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('owner_director', 'operations_admin', 'finance')
    )
  );

CREATE POLICY "managers_manage_sessions" ON public.class_sessions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('owner_director', 'operations_admin')
    )
  );

-- Verify:
-- SELECT c.full_name, SUM(cs.duration_minutes)/60.0 AS total_hours
-- FROM class_sessions cs JOIN members c ON c.id = cs.coach_id
-- GROUP BY c.full_name ORDER BY total_hours DESC;


-- =============================================================================
-- STEP 11 — Task #21: Payroll calculation tables
-- =============================================================================

-- Pay rates per coach (owner sets the rate; can have multiple types)
CREATE TABLE IF NOT EXISTS public.coach_pay_rates (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id   uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  class_type  text        NOT NULL DEFAULT 'group'
              CHECK (class_type IN ('group', 'private', 'semi_private', 'admin', 'other')),
  rate_per_hour numeric(10,2) NOT NULL CHECK (rate_per_hour >= 0),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to   date,
  notes       text,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pay_rates_member ON public.coach_pay_rates(member_id);
ALTER TABLE public.coach_pay_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners_manage_pay_rates" ON public.coach_pay_rates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('owner_director'))
  );

-- Pay runs (a "pay period" grouping)
CREATE TABLE IF NOT EXISTS public.pay_runs (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  period_start date        NOT NULL,
  period_end   date        NOT NULL,
  status       text        NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'under_review', 'approved', 'paid', 'cancelled')),
  approved_by  uuid        REFERENCES public.profiles(id),
  approved_at  timestamptz,
  notes        text,
  created_by   uuid        REFERENCES public.profiles(id),
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE public.pay_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "managers_manage_pay_runs" ON public.pay_runs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('owner_director', 'operations_admin', 'finance'))
  );

-- Pay run line items (one per coach per pay run)
CREATE TABLE IF NOT EXISTS public.pay_run_items (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  pay_run_id      uuid        NOT NULL REFERENCES public.pay_runs(id) ON DELETE CASCADE,
  member_id       uuid        NOT NULL REFERENCES public.members(id),
  total_minutes   int         NOT NULL DEFAULT 0,
  total_sessions  int         NOT NULL DEFAULT 0,
  gross_amount    numeric(10,2) NOT NULL DEFAULT 0,
  notes           text,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pay_run_items_run    ON public.pay_run_items(pay_run_id);
CREATE INDEX IF NOT EXISTS idx_pay_run_items_member ON public.pay_run_items(member_id);
ALTER TABLE public.pay_run_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "managers_view_pay_items" ON public.pay_run_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('owner_director', 'operations_admin', 'finance'))
  );

-- Verify:
-- SELECT pr.period_start, pr.period_end, pr.status,
--        SUM(pri.gross_amount) AS total_payroll
-- FROM pay_runs pr
-- LEFT JOIN pay_run_items pri ON pri.pay_run_id = pr.id
-- GROUP BY pr.id ORDER BY pr.period_start DESC;


-- =============================================================================
-- STEP 12 — Task #23: Class timetable management
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.class_templates (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name            text        NOT NULL,
  class_type      text        NOT NULL DEFAULT 'group'
                  CHECK (class_type IN ('group', 'private', 'semi_private', 'kids', 'competition', 'other')),
  coach_id        uuid        REFERENCES public.members(id),
  day_of_week     int         NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun, 1=Mon...6=Sat
  start_time      time        NOT NULL,
  duration_minutes int        NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  location        text,
  max_capacity    int,
  description     text,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_class_templates_day  ON public.class_templates(day_of_week);
CREATE INDEX IF NOT EXISTS idx_class_templates_coach ON public.class_templates(coach_id);
ALTER TABLE public.class_templates ENABLE ROW LEVEL SECURITY;
-- Public read (for member portal / public timetable)
CREATE POLICY "anyone_can_view_timetable" ON public.class_templates
  FOR SELECT USING (is_active = true);
CREATE POLICY "managers_manage_timetable" ON public.class_templates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('owner_director', 'operations_admin'))
  );

-- Verify:
-- SELECT day_of_week, start_time, name, coach_id FROM class_templates WHERE is_active ORDER BY day_of_week, start_time;


-- =============================================================================
-- STEP 13 — Task #24: Member class booking system
-- =============================================================================

-- Bookings link a member to a specific class occurrence (template + date)
CREATE TABLE IF NOT EXISTS public.class_bookings (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id       uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  class_template_id uuid      NOT NULL REFERENCES public.class_templates(id) ON DELETE CASCADE,
  booked_date     date        NOT NULL, -- the specific date of this occurrence
  status          text        NOT NULL DEFAULT 'confirmed'
                  CHECK (status IN ('confirmed', 'cancelled', 'attended', 'no_show')),
  notes           text,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (member_id, class_template_id, booked_date)
);
CREATE INDEX IF NOT EXISTS idx_bookings_member  ON public.class_bookings(member_id);
CREATE INDEX IF NOT EXISTS idx_bookings_class   ON public.class_bookings(class_template_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date    ON public.class_bookings(booked_date);
ALTER TABLE public.class_bookings ENABLE ROW LEVEL SECURITY;
-- Members can see/create/cancel their own bookings
CREATE POLICY "members_manage_own_bookings" ON public.class_bookings
  FOR ALL USING (
    member_id IN (
      SELECT m.id FROM public.members m
      JOIN public.profiles p ON p.member_id = m.id
      WHERE p.id = auth.uid()
    )
  );
-- Managers can see all bookings
CREATE POLICY "managers_view_all_bookings" ON public.class_bookings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('owner_director', 'operations_admin', 'coach'))
  );
CREATE POLICY "managers_update_bookings" ON public.class_bookings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('owner_director', 'operations_admin', 'coach'))
  );


-- =============================================================================
-- STEP 14 — Task #26: Grading and belt promotion tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.member_gradings (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id       uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  discipline      text        NOT NULL, -- e.g. 'muay_thai', 'bjj', 'boxing', 'mma'
  grade           text        NOT NULL, -- e.g. 'white', 'blue', 'level_1', 'amateur'
  graded_at       date        NOT NULL,
  graded_by       uuid        REFERENCES public.members(id), -- coach who graded
  notes           text,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gradings_member     ON public.member_gradings(member_id);
CREATE INDEX IF NOT EXISTS idx_gradings_discipline ON public.member_gradings(discipline);
ALTER TABLE public.member_gradings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "managers_coaches_manage_gradings" ON public.member_gradings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('owner_director','operations_admin','coach'))
  );
CREATE POLICY "members_view_own_gradings" ON public.member_gradings
  FOR SELECT USING (
    member_id IN (SELECT m.id FROM public.members m JOIN public.profiles p ON p.member_id = m.id WHERE p.id = auth.uid())
  );


-- =============================================================================
-- STEP 15 — Task #28: Stripe billing integration tables
-- =============================================================================

-- Store Stripe customer IDs per member (one member = one Stripe customer)
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE;

-- Stripe subscription records (synced via webhook WF: Stripe → Supabase)
-- These are separate from GoCardless memberships (billing_provider = 'stripe')
-- Stripe webhooks should upsert into the existing memberships table with
-- billing_provider = 'stripe', source_record_id = Stripe subscription ID

-- Webhook events log (for debugging / idempotency)
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id              text        PRIMARY KEY, -- Stripe event ID (evt_...)
  event_type      text        NOT NULL,
  data            jsonb,
  processed_at    timestamptz DEFAULT now()
);
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
-- Only service role can insert (n8n/webhook handler uses service role)
-- No SELECT policy needed — only staff read via dashboard queries

-- Verify stripe_customer_id column added:
-- SELECT id, full_name, stripe_customer_id FROM members WHERE stripe_customer_id IS NOT NULL LIMIT 5;


-- =============================================================================
-- STEP 16 — Task #30: Merch shop tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.products (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name          text        NOT NULL,
  description   text,
  category      text        NOT NULL DEFAULT 'apparel'
                CHECK (category IN ('apparel', 'equipment', 'supplements', 'accessories', 'other')),
  price_cents   int         NOT NULL CHECK (price_cents >= 0),
  stock_qty     int         NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  sku           text        UNIQUE,
  image_url     text,
  is_active     boolean     NOT NULL DEFAULT true,
  stripe_price_id text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_can_view_active_products" ON public.products FOR SELECT USING (is_active = true);
CREATE POLICY "managers_manage_products" ON public.products FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('owner_director','operations_admin'))
);

CREATE TABLE IF NOT EXISTS public.merch_orders (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id     uuid        REFERENCES public.members(id),
  customer_name text        NOT NULL,
  customer_email text,
  status        text        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','paid','fulfilled','cancelled','refunded')),
  total_cents   int         NOT NULL DEFAULT 0,
  notes         text,
  stripe_session_id text,
  created_at    timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.merch_order_items (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id   uuid NOT NULL REFERENCES public.merch_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  qty        int NOT NULL DEFAULT 1 CHECK (qty > 0),
  price_cents int NOT NULL,
  variant    text
);
ALTER TABLE public.merch_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merch_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "managers_view_orders" ON public.merch_orders FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('owner_director','operations_admin','finance'))
);
CREATE POLICY "managers_view_order_items" ON public.merch_order_items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('owner_director','operations_admin','finance'))
);


-- =============================================================================
-- STEP 17 — Task #44: Bank feed / bank transactions table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  source          text        NOT NULL DEFAULT 'xero'
                  CHECK (source IN ('xero', 'basiq', 'manual')),
  external_id     text        UNIQUE,  -- Xero BankTransactionID or Basiq transaction ID
  account_name    text,
  account_id      text,
  date            date        NOT NULL,
  description     text,
  reference       text,
  amount_cents    bigint      NOT NULL,  -- positive = credit/income, negative = debit/expense
  currency        text        NOT NULL DEFAULT 'AUD',
  category        text,
  is_reconciled   boolean     DEFAULT false,
  raw_json        jsonb,
  synced_at       timestamptz DEFAULT now()
);
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_view_bank" ON public.bank_transactions FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('owner_director','operations_admin','finance'))
);
CREATE INDEX IF NOT EXISTS bank_transactions_date_idx ON public.bank_transactions (date DESC);
CREATE INDEX IF NOT EXISTS bank_transactions_source_idx ON public.bank_transactions (source);


-- =============================================================================
-- STEP 18 — Task #10: Bulk campaign tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.campaigns (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name         text        NOT NULL,
  subject      text,
  body_email   text,
  body_sms     text,
  channels     text[]      NOT NULL DEFAULT '{email}',
  segment      text        NOT NULL DEFAULT 'all_active'
               CHECK (segment IN ('all_active','lapsed','trial','no_booking_7d','tag','custom')),
  segment_tag  text,
  status       text        NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','queued','sending','sent','cancelled')),
  recipient_count int      DEFAULT 0,
  sent_count   int         DEFAULT 0,
  created_by   uuid        REFERENCES public.profiles(id),
  sent_at      timestamptz,
  created_at   timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.campaign_sends (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id  uuid        NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  member_id    uuid        REFERENCES public.members(id),
  email        text,
  phone        text,
  status       text        NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','sent','failed','bounced')),
  error        text,
  sent_at      timestamptz
);
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "managers_manage_campaigns" ON public.campaigns FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('owner_director','operations_admin'))
);
CREATE POLICY "managers_view_sends" ON public.campaign_sends FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('owner_director','operations_admin'))
);


-- =============================================================================
-- STEP 19 — Task #7: Email triage log table (populated by /api/inbound-email)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.email_triage_log (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  from_address    text        NOT NULL,
  subject         text,
  body_preview    text,
  message_id      text        UNIQUE,
  thread_id       text,
  received_at     timestamptz,
  category        text,
  priority        text,
  summary         text,
  suggested_reply text,
  crm_action      text,
  escalate        boolean     DEFAULT false,
  tags            text[]      DEFAULT '{}',
  ai_raw          jsonb,
  actioned_at     timestamptz,
  actioned_by     uuid        REFERENCES public.profiles(id),
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE public.email_triage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "managers_view_email_log" ON public.email_triage_log FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('owner_director','operations_admin'))
);


-- =============================================================================
-- STEP 20 — Task #8: Welcome sequence log
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.welcome_sequence_log (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id    uuid        REFERENCES public.members(id),
  email        text,
  name         text,
  plan         text,
  triggered_at timestamptz DEFAULT now(),
  status       text        NOT NULL DEFAULT 'triggered',
  error        text
);
ALTER TABLE public.welcome_sequence_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "managers_view_welcome_log" ON public.welcome_sequence_log FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('owner_director','operations_admin'))
);


-- =============================================================================
-- STEP 21 — Tasks #9, #11, #12, #14: Automation support tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.reengage_log (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id    uuid        REFERENCES public.members(id),
  email        text,
  triggered_at timestamptz DEFAULT now(),
  status       text        NOT NULL DEFAULT 'triggered',
  error        text
);
ALTER TABLE public.reengage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "managers_view_reengage" ON public.reengage_log FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('owner_director','operations_admin'))
);

-- Add due_date + tags columns to staff_tasks if they don't exist
ALTER TABLE public.staff_tasks ADD COLUMN IF NOT EXISTS due_date timestamptz;
ALTER TABLE public.staff_tasks ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE public.staff_tasks ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal';

-- Add tags column to crm_leads if not present
ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

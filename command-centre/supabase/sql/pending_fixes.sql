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
  AND msr.raw_data->>'status' = 'active'
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
  AND member_type IN ('gym_member', 'nac', 'online_customer', 'staff');

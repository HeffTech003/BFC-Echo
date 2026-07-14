-- ============================================================
-- Merge duplicate member records
--
-- Strategy:
--   1. Find all groups of members sharing the same primary_email.
--   2. For each group, keep the OLDEST record (earliest created_at)
--      as the canonical member.
--   3. Set merged_into = <canonical_id> on every duplicate.
--   4. Update foreign keys in child tables to point to the canonical.
--
-- REVIEW this script before running — especially the preview queries.
-- Run each section manually in Supabase SQL editor.
-- ============================================================


-- ── STEP 0: Preview — how many dupes exist? ──────────────────────────────────
-- Run this first to see the scale of the problem.

SELECT
  primary_email,
  COUNT(*)          AS total_records,
  MIN(created_at)   AS earliest,
  MAX(created_at)   AS latest,
  array_agg(id ORDER BY created_at) AS member_ids
FROM members
WHERE
  primary_email IS NOT NULL
  AND merged_into IS NULL
GROUP BY primary_email
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;


-- ── STEP 1: Preview canonical vs duplicate assignments ───────────────────────
-- Shows which record will be kept vs merged for each email group.

WITH ranked AS (
  SELECT
    id,
    full_name,
    primary_email,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY primary_email
      ORDER BY created_at ASC  -- keep oldest record as canonical
    ) AS rn
  FROM members
  WHERE primary_email IS NOT NULL
    AND merged_into IS NULL
)
SELECT
  primary_email,
  id,
  full_name,
  created_at,
  CASE WHEN rn = 1 THEN 'KEEP (canonical)' ELSE 'MERGE (set merged_into)' END AS action
FROM ranked
WHERE primary_email IN (
  SELECT primary_email FROM members
  WHERE primary_email IS NOT NULL AND merged_into IS NULL
  GROUP BY primary_email HAVING COUNT(*) > 1
)
ORDER BY primary_email, rn;


-- ── STEP 2: Find null-email dupes (same full_name, different rows) ───────────
-- Members with no email can still be dupes by name — review manually.

SELECT
  full_name,
  COUNT(*) AS cnt,
  array_agg(id ORDER BY created_at) AS member_ids
FROM members
WHERE primary_email IS NULL
  AND merged_into IS NULL
GROUP BY full_name
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;


-- ── STEP 3: Execute the merge (email-matched dupes only) ─────────────────────
-- Sets merged_into on duplicate rows.
-- The canonical record (kept) = oldest created_at per email group.
-- SAFE TO RUN: only updates merged_into; does not delete any rows.

WITH canonical AS (
  SELECT DISTINCT ON (primary_email)
    id AS canonical_id,
    primary_email
  FROM members
  WHERE primary_email IS NOT NULL
    AND merged_into IS NULL
  ORDER BY primary_email, created_at ASC
),
dupes AS (
  SELECT m.id AS dupe_id, c.canonical_id
  FROM members m
  JOIN canonical c ON c.primary_email = m.primary_email
  WHERE m.id <> c.canonical_id
    AND m.merged_into IS NULL
)
UPDATE members
SET
  merged_into = dupes.canonical_id,
  notes       = COALESCE(notes || ' ', '') || '[auto-merged duplicate ' || now()::date || ']'
FROM dupes
WHERE members.id = dupes.dupe_id;

-- Verify: should return 0 rows after successful merge
SELECT COUNT(*) AS remaining_dupes
FROM members
WHERE primary_email IS NOT NULL
  AND merged_into IS NULL
GROUP BY primary_email
HAVING COUNT(*) > 1;


-- ── STEP 4: Reroute child-table foreign keys to canonical ───────────────────
-- After merging, child rows that reference a dupe member_id should
-- point to the canonical instead. Run these AFTER Step 3.

-- memberships
UPDATE memberships m
SET member_id = merged.merged_into
FROM members merged
WHERE m.member_id = merged.id
  AND merged.merged_into IS NOT NULL;

-- payment_events
UPDATE payment_events pe
SET member_id = merged.merged_into
FROM members merged
WHERE pe.member_id = merged.id
  AND merged.merged_into IS NOT NULL;

-- gocardless_mandates
UPDATE gocardless_mandates gm
SET member_id = merged.merged_into
FROM members merged
WHERE gm.member_id = merged.id
  AND merged.merged_into IS NOT NULL;

-- xero_contacts
UPDATE xero_contacts xc
SET member_id = merged.merged_into
FROM members merged
WHERE xc.member_id = merged.id
  AND merged.merged_into IS NOT NULL;

-- cancellation_requests (if table has member_id)
UPDATE cancellation_requests cr
SET member_id = merged.merged_into
FROM members merged
WHERE cr.member_id = merged.id
  AND merged.merged_into IS NOT NULL;


-- ── STEP 5: Verify final state ───────────────────────────────────────────────

-- Count canonical vs merged
SELECT
  CASE WHEN merged_into IS NULL THEN 'canonical' ELSE 'merged' END AS record_type,
  COUNT(*) AS count
FROM members
GROUP BY 1;

-- Confirm no email duplicates remain in active (non-merged) records
SELECT primary_email, COUNT(*)
FROM members
WHERE merged_into IS NULL AND primary_email IS NOT NULL
GROUP BY primary_email
HAVING COUNT(*) > 1;

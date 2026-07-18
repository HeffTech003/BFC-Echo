-- BFC Member Count Diagnostic
-- Run this in Supabase SQL Editor (supabase.com → your project → SQL Editor)
-- This will show you exactly what's in the members table and why counts look wrong.

-- ── 1. Breakdown by type + status ─────────────────────────────────────────────
SELECT
  member_type,
  member_status,
  COUNT(*) AS count
FROM members
WHERE merged_into IS NULL
GROUP BY member_type, member_status
ORDER BY member_type, count DESC;

-- ── 2. Active gym_members — these are what the platform counts as "active" ────
SELECT COUNT(*) AS active_gym_members
FROM members
WHERE member_type = 'gym_member'
  AND member_status = 'active'
  AND merged_into IS NULL;

-- ── 3. Active gym_members WITH a linked Clubworx source record ────────────────
-- These are properly synced from Clubworx — should match your ~132
SELECT COUNT(*) AS active_gym_members_with_clubworx_link
FROM members m
WHERE m.member_type = 'gym_member'
  AND m.member_status = 'active'
  AND m.merged_into IS NULL
  AND EXISTS (
    SELECT 1 FROM member_source_records s
    WHERE s.member_id = m.id
      AND s.source = 'clubworx'
  );

-- ── 4. Active gym_members WITHOUT any source record (orphaned bulk creates) ───
-- These were bulk-created and may have wrong statuses
SELECT COUNT(*) AS active_gym_members_no_source_record
FROM members m
WHERE m.member_type = 'gym_member'
  AND m.member_status = 'active'
  AND m.merged_into IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM member_source_records s
    WHERE s.member_id = m.id
  );

-- ── 5. Preview the orphaned records (no source record) ───────────────────────
SELECT m.id, m.full_name, m.primary_email, m.member_status, m.created_at
FROM members m
WHERE m.member_type = 'gym_member'
  AND m.member_status = 'active'
  AND m.merged_into IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM member_source_records s
    WHERE s.member_id = m.id
  )
ORDER BY m.created_at DESC
LIMIT 50;

-- ── 6. If query 4 shows a large number, run this to fix it ───────────────────
-- This sets orphaned bulk-created members to 'lapsed' instead of 'active'
-- REVIEW the results of query 5 first before running this update!
--
-- UPDATE members
-- SET member_status = 'lapsed', updated_at = NOW()
-- WHERE member_type = 'gym_member'
--   AND member_status = 'active'
--   AND merged_into IS NULL
--   AND NOT EXISTS (
--     SELECT 1 FROM member_source_records s
--     WHERE s.member_id = members.id
--   );

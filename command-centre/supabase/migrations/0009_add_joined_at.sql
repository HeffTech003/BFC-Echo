-- Migration 0009: add joined_at to members + merge same-name duplicates
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor)

-- ── 1. Add joined_at column ──────────────────────────────────────────────────
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS joined_at date;

-- ── 2. Backfill from earliest membership start_date per member ───────────────
UPDATE public.members m
SET joined_at = sub.earliest
FROM (
  SELECT member_id, MIN(start_date) AS earliest
  FROM   public.memberships
  WHERE  start_date IS NOT NULL
    AND  member_id IS NOT NULL
  GROUP  BY member_id
) sub
WHERE m.id = sub.member_id
  AND m.joined_at IS NULL;

-- ── 3. Backfill from member_source_records raw_data for Clubworx ─────────────
--    Covers members whose memberships row had no start_date
UPDATE public.members m
SET joined_at = (
  SELECT (msr.raw_data->>'start_date')::date
  FROM   public.member_source_records msr
  WHERE  msr.member_id = m.id
    AND  msr.source_system IN ('clubworx','clubworx_nac')
    AND  msr.raw_data->>'start_date' IS NOT NULL
  ORDER  BY (msr.raw_data->>'start_date')::date ASC
  LIMIT  1
)
WHERE m.joined_at IS NULL;

-- ── 4. Merge same-name same-type duplicates (safe pass) ─────────────────────
--    Only merges where at least one side has no email (avoids merging
--    two different people who happen to share a name).
WITH dupes AS (
  SELECT
    lower(trim(full_name))   AS norm_name,
    member_type,
    -- canonical = oldest created_at with the richer profile
    MIN(created_at)          AS oldest,
    COUNT(*)                 AS cnt
  FROM   public.members
  WHERE  merged_into IS NULL
  GROUP  BY lower(trim(full_name)), member_type
  HAVING COUNT(*) > 1
),
pairs AS (
  SELECT
    m.id,
    m.full_name,
    m.primary_email,
    m.member_type,
    m.created_at,
    d.norm_name
  FROM public.members m
  JOIN dupes d
       ON lower(trim(m.full_name)) = d.norm_name
      AND m.member_type = d.member_type
  WHERE m.merged_into IS NULL
),
canonical AS (
  -- pick the oldest record per name+type as the keeper
  SELECT DISTINCT ON (norm_name, member_type)
    id, norm_name, member_type, primary_email
  FROM   pairs
  ORDER  BY norm_name, member_type, created_at ASC
),
to_merge AS (
  SELECT
    p.id      AS dup_id,
    c.id      AS keep_id
  FROM   pairs   p
  JOIN   canonical c ON c.norm_name = p.norm_name AND c.member_type = p.member_type
  WHERE  p.id <> c.id
    -- safe rule: at least one side has no email, meaning it's almost certainly the same person
    AND  (p.primary_email IS NULL OR c.primary_email IS NULL)
)
-- Mark duplicates as merged
UPDATE public.members
SET merged_into = tm.keep_id
FROM   to_merge tm
WHERE  public.members.id = tm.dup_id;

-- Reroute child rows for the merged records
UPDATE public.member_source_records msr
SET member_id = m.merged_into
FROM public.members m
WHERE msr.member_id = m.id
  AND m.merged_into IS NOT NULL;

UPDATE public.memberships ms
SET member_id = m.merged_into
FROM public.members m
WHERE ms.member_id = m.id
  AND m.merged_into IS NOT NULL;

UPDATE public.payment_events pe
SET member_id = m.merged_into
FROM public.members m
WHERE pe.member_id = m.id
  AND m.merged_into IS NOT NULL;

-- ── Verify ───────────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM public.members WHERE joined_at IS NOT NULL)  AS members_with_date,
  (SELECT COUNT(*) FROM public.members WHERE joined_at IS NULL AND merged_into IS NULL) AS missing_date,
  (SELECT COUNT(*) FROM public.members WHERE merged_into IS NOT NULL) AS merged_count;

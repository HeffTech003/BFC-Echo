-- =============================================================================
-- BFC — Fix #34: Backfill joined_at corrupted by WF14 sync timestamp
-- =============================================================================
-- Problem: WF14's upsert was setting joined_at to the sync timestamp
--          (around July 8 and July 12, 2026) instead of Clubworx's actual
--          created_on date. This caused the Retention chart to show a fake
--          +595 net growth spike.
--
-- Fix has two parts:
--   1. This SQL: backfill existing records with the correct Clubworx date
--   2. n8n WF14: change the upsert payload to use {{$json.created_on}} for
--      joined_at instead of {{$now}} (see note at bottom of file)
--
-- Run in Supabase SQL Editor — safe to re-run.
-- =============================================================================


-- STEP 1 — Diagnostic: how many records have a corrupted joined_at?
SELECT
  m.joined_at::date AS synced_date,
  COUNT(*)          AS affected_members
FROM public.members m
JOIN public.member_source_records msr ON msr.member_id = m.id
WHERE msr.source_system = 'clubworx'
  AND m.merged_into IS NULL
  AND m.joined_at::date IN ('2026-07-08', '2026-07-12')
GROUP BY 1
ORDER BY 1;


-- STEP 2 — Preview: show what the backfill would change (run before Step 3)
SELECT
  m.id,
  m.full_name,
  m.joined_at                  AS current_joined_at,
  msr.raw_data->>'created_on'  AS clubworx_created_on
FROM public.members m
JOIN public.member_source_records msr ON msr.member_id = m.id
WHERE msr.source_system = 'clubworx'
  AND m.merged_into IS NULL
  AND m.joined_at::date IN ('2026-07-08', '2026-07-12')
  AND msr.raw_data->>'created_on' ~ '^\d{4}-\d{2}-\d{2}'
ORDER BY msr.raw_data->>'created_on'
LIMIT 30;


-- STEP 3 — Fix: replace sync-timestamp joined_at with Clubworx created_on
UPDATE public.members m
SET joined_at = (
  SELECT (msr.raw_data->>'created_on')::date
  FROM public.member_source_records msr
  WHERE msr.member_id = m.id
    AND msr.source_system = 'clubworx'
    AND msr.raw_data->>'created_on' ~ '^\d{4}-\d{2}-\d{2}'
  LIMIT 1
)
FROM public.member_source_records msr2
WHERE msr2.member_id = m.id
  AND msr2.source_system = 'clubworx'
  AND m.merged_into IS NULL
  AND m.joined_at::date IN ('2026-07-08', '2026-07-12')
  AND msr2.raw_data->>'created_on' ~ '^\d{4}-\d{2}-\d{2}';


-- STEP 4 — Verify: joined_at distribution should now span real years, not all 2026
SELECT
  DATE_TRUNC('year', joined_at)::date AS join_year,
  COUNT(*)                             AS members
FROM public.members
WHERE merged_into IS NULL
  AND joined_at IS NOT NULL
GROUP BY 1
ORDER BY 1;


-- =============================================================================
-- WF14 N8N CHANGE REQUIRED (do this after running the SQL above)
-- =============================================================================
-- In the "Upsert Member" HTTP Request node of WF14, the upsert body
-- currently has:
--
--   "joined_at": "{{$now}}"    <-- WRONG: writes sync timestamp
--
-- Change it to:
--
--   "joined_at": "{{$json.created_on ?? $json.activated ?? null}}"
--
-- This uses Clubworx's actual member creation / activation date.
-- The ?? null fallback prevents writing garbage if Clubworx has no date.
--
-- After saving, manually trigger WF14 once. The upsert (on_conflict) will
-- re-write joined_at from Clubworx data, consistent with this SQL backfill.
-- =============================================================================

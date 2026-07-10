-- =============================================================================
-- Migration: add a 10 - 12 Years row to the "Default Sizing" chart
-- Created:   2026-07-10
--
-- The PDP and admin Sizing Chart Setup tool now show a fixed age→letter-size
-- label next to matching rows (frontend-only, see
-- lil-edit/src/lib/sizeLabels.ts — nothing is written to the DB for the
-- letter itself):
--   6 - 7 Years   -> XS
--   7 - 8 Years   -> S
--   8 - 9 Years   -> M
--   9 - 10 Years  -> L
--   10 - 12 Years -> XL
-- The first four ranges already exist in "Default Sizing"; this migration adds
-- the missing 10 - 12 Years row so the XL label has something to attach to.
--
-- Measurements are linearly extrapolated from the chart's existing 1-year-step
-- progression (each prior row) doubled to cover the 2-year span — verify/adjust
-- them in the Sizing Chart Setup tool if the real garment measurements differ.
--
-- Idempotent: only inserts if a 10-12 Years row isn't already present.
--
-- ⚠️ MANUAL STEP: run in the Supabase SQL editor. Requires
-- 20260709_size_charts.sql to have already been applied.
-- =============================================================================

UPDATE public.size_charts
SET
  rows = rows || '[
    {"size":"10 - 12 Years","sizeFrom":10,"sizeTo":12,"sizeUnit":"Years","inches":{"topLength":35,"chest":36,"sleeve":19,"bottomLength":38,"waist":26},"centimeters":{"topLength":88.9,"chest":91.44,"sleeve":48.26,"bottomLength":96.52,"waist":66.04}}
  ]'::jsonb,
  updated_at = timezone('utc', now())
WHERE is_default = true
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(rows) elem
    WHERE (elem->>'sizeFrom')::numeric = 10
      AND (elem->>'sizeTo')::numeric = 12
      AND elem->>'sizeUnit' = 'Years'
  );

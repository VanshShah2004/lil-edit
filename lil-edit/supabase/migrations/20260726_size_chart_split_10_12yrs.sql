-- =============================================================================
-- Migration: split the "10 - 12 Years" row into 10 - 11 and 11 - 12 Years
-- Created:   2026-07-26
--
-- Letter sizes (XS / S / M / L / XL) have been removed from the product size
-- picker and from the sizing chart display; lil-edit/src/lib/sizeLabels.ts (the
-- fixed age->letter map) is deleted. That retires the sole reason the
-- "10 - 12 Years" row existed: 20260710_size_chart_default_10_12yrs.sql added it
-- purely so the XL label had a range to attach to.
--
-- The product size picker (SIZES in AddProduct.tsx / EditProduct.tsx) offers
-- 10-11 Years and 11-12 Years as separate selectable sizes, so the default chart
-- is now the odd one out. Splitting the row makes the chart's ranges line up 1:1
-- with the 12 sizes an admin can actually assign to a product.
--
-- Measurements: 11 - 12 Years inherits the old 10 - 12 values (the top of the
-- range it covered); 10 - 11 Years is interpolated on the chart's existing
-- ~+2in top/chest/bottom, +1in sleeve/waist per-year progression from 9 - 10.
-- Verify against real garment measurements in the Sizing Chart Setup tool.
--
-- Only touches the DEFAULT chart — admin-authored charts are left alone.
-- Idempotent: safe to re-run, and safe whether or not 20260710 was ever applied
-- (if there is no 10 - 12 row, the delete step is simply a no-op).
--
-- ⚠️ MANUAL STEP: run in the Supabase SQL editor. Requires
-- 20260709_size_charts.sql to have already been applied.
-- =============================================================================

-- 1. Drop the 10 - 12 Years row, preserving the order of every other row.
UPDATE public.size_charts
SET
  rows = (
    SELECT COALESCE(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
    FROM jsonb_array_elements(rows) WITH ORDINALITY AS t(elem, ord)
    WHERE NOT (
      COALESCE(NULLIF(elem->>'sizeFrom', ''), '-1')::numeric = 10
      AND COALESCE(NULLIF(elem->>'sizeTo', ''), '-1')::numeric = 12
      AND COALESCE(elem->>'sizeUnit', '') = 'Years'
    )
  ),
  updated_at = timezone('utc', now())
WHERE is_default = true
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(rows) elem
    WHERE COALESCE(NULLIF(elem->>'sizeFrom', ''), '-1')::numeric = 10
      AND COALESCE(NULLIF(elem->>'sizeTo', ''), '-1')::numeric = 12
      AND COALESCE(elem->>'sizeUnit', '') = 'Years'
  );

-- 2. Append 10 - 11 Years (interpolated between 9 - 10 and 11 - 12).
UPDATE public.size_charts
SET
  rows = rows || '[
    {"size":"10 - 11 Years","sizeFrom":10,"sizeTo":11,"sizeUnit":"Years","inches":{"topLength":33,"chest":34,"sleeve":18,"bottomLength":36,"waist":25},"centimeters":{"topLength":83.82,"chest":86.36,"sleeve":45.72,"bottomLength":91.44,"waist":63.5}}
  ]'::jsonb,
  updated_at = timezone('utc', now())
WHERE is_default = true
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(rows) elem
    WHERE COALESCE(NULLIF(elem->>'sizeFrom', ''), '-1')::numeric = 10
      AND COALESCE(NULLIF(elem->>'sizeTo', ''), '-1')::numeric = 11
      AND COALESCE(elem->>'sizeUnit', '') = 'Years'
  );

-- 3. Append 11 - 12 Years (carries the old 10 - 12 measurements).
UPDATE public.size_charts
SET
  rows = rows || '[
    {"size":"11 - 12 Years","sizeFrom":11,"sizeTo":12,"sizeUnit":"Years","inches":{"topLength":35,"chest":36,"sleeve":19,"bottomLength":38,"waist":26},"centimeters":{"topLength":88.9,"chest":91.44,"sleeve":48.26,"bottomLength":96.52,"waist":66.04}}
  ]'::jsonb,
  updated_at = timezone('utc', now())
WHERE is_default = true
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(rows) elem
    WHERE COALESCE(NULLIF(elem->>'sizeFrom', ''), '-1')::numeric = 11
      AND COALESCE(NULLIF(elem->>'sizeTo', ''), '-1')::numeric = 12
      AND COALESCE(elem->>'sizeUnit', '') = 'Years'
  );

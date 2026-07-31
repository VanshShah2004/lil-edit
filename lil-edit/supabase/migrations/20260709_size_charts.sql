-- =============================================================================
-- Migration: size_charts table
-- Created:   2026-07-09
--
-- Stores admin-managed sizing charts shown in the "Sizing Chart Setup" tool
-- under Admin Settings -> Content Management. Each chart is a named table of
-- rows; every row holds a size range (sizeFrom, sizeTo, sizeUnit: "Months" |
-- "Years", composed into the display label `size`, e.g. "6 - 12 Months") plus
-- measurements in both inches and centimeters (topLength, chest, sleeve,
-- bottomLength, waist). This pass is standalone: no product/category
-- association yet, no storefront display.
--
-- RLS is enabled with no public policies so only the service-role backend can
-- read/write, matching the coupons table's convention.
--
-- Seeds one default chart ("Default Sizing") with the brand's baseline
-- measurements. The default chart can be renamed/edited freely but can't be
-- deleted (locked in the backend, see routes/sizeCharts.ts).
--
-- ⚠️ MANUAL STEP: run in the Supabase SQL editor.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.size_charts (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        UNIQUE NOT NULL CHECK (btrim(name) <> ''),
  rows       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  is_default boolean     NOT NULL DEFAULT false,
  created_by uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.size_charts ENABLE ROW LEVEL SECURITY;

INSERT INTO public.size_charts (name, is_default, rows)
VALUES (
  'Default Sizing',
  true,
  '[
    {"size":"6 - 12 Months","sizeFrom":6,"sizeTo":12,"sizeUnit":"Months","inches":{"topLength":13,"chest":22,"sleeve":8,"bottomLength":15,"waist":15},"centimeters":{"topLength":33.02,"chest":55.88,"sleeve":20.32,"bottomLength":38.1,"waist":38.1}},
    {"size":"1 - 2 Years","sizeFrom":1,"sizeTo":2,"sizeUnit":"Years","inches":{"topLength":15,"chest":24,"sleeve":9,"bottomLength":17,"waist":16},"centimeters":{"topLength":38.1,"chest":60.96,"sleeve":22.86,"bottomLength":43.18,"waist":40.64}},
    {"size":"2 - 3 Years","sizeFrom":2,"sizeTo":3,"sizeUnit":"Years","inches":{"topLength":17,"chest":24.5,"sleeve":10,"bottomLength":21,"waist":17},"centimeters":{"topLength":43.18,"chest":62.23,"sleeve":25.4,"bottomLength":53.34,"waist":43.18}},
    {"size":"3 - 4 Years","sizeFrom":3,"sizeTo":4,"sizeUnit":"Years","inches":{"topLength":19,"chest":25,"sleeve":11,"bottomLength":23,"waist":18},"centimeters":{"topLength":48.26,"chest":63.5,"sleeve":27.94,"bottomLength":58.42,"waist":45.72}},
    {"size":"4 - 5 Years","sizeFrom":4,"sizeTo":5,"sizeUnit":"Years","inches":{"topLength":21,"chest":26,"sleeve":12,"bottomLength":25,"waist":19},"centimeters":{"topLength":53.34,"chest":66.04,"sleeve":30.48,"bottomLength":63.5,"waist":48.26}},
    {"size":"5 - 6 Years","sizeFrom":5,"sizeTo":6,"sizeUnit":"Years","inches":{"topLength":23,"chest":27,"sleeve":13,"bottomLength":26,"waist":20},"centimeters":{"topLength":58.42,"chest":68.58,"sleeve":33.02,"bottomLength":66.04,"waist":50.8}},
    {"size":"6 - 7 Years","sizeFrom":6,"sizeTo":7,"sizeUnit":"Years","inches":{"topLength":25,"chest":28,"sleeve":14,"bottomLength":28,"waist":21},"centimeters":{"topLength":63.5,"chest":71.12,"sleeve":35.56,"bottomLength":71.12,"waist":53.34}},
    {"size":"7 - 8 Years","sizeFrom":7,"sizeTo":8,"sizeUnit":"Years","inches":{"topLength":27,"chest":29.5,"sleeve":15,"bottomLength":30,"waist":22},"centimeters":{"topLength":68.58,"chest":74.93,"sleeve":38.1,"bottomLength":76.2,"waist":55.88}},
    {"size":"8 - 9 Years","sizeFrom":8,"sizeTo":9,"sizeUnit":"Years","inches":{"topLength":29,"chest":30,"sleeve":16,"bottomLength":32,"waist":23},"centimeters":{"topLength":73.66,"chest":76.2,"sleeve":40.64,"bottomLength":81.28,"waist":58.42}},
    {"size":"9 - 10 Years","sizeFrom":9,"sizeTo":10,"sizeUnit":"Years","inches":{"topLength":31,"chest":32,"sleeve":17,"bottomLength":34,"waist":24},"centimeters":{"topLength":78.74,"chest":81.28,"sleeve":43.18,"bottomLength":86.36,"waist":60.96}}
  ]'::jsonb
)
ON CONFLICT (name) DO NOTHING;

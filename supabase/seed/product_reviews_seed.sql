-- =============================================================================
-- Seed: sample product reviews (DEV / DEMO ONLY)
-- Created: 2026-06-02
--
-- Populates product_reviews for two real products so the PDP reviews section
-- renders with data instead of the "No reviews yet" empty state.
--
-- PREREQUISITE: apply 20260602_product_reviews.sql first (the table must exist).
--
-- Idempotent: clears any prior seed rows for these two slugs before inserting,
-- so you can re-run it safely. Seed rows have user_id = NULL (no auth.users
-- needed) which the partial unique index intentionally exempts.
--
-- Products targeted (verified to exist in the products table):
--   • red-dress  → "Red Dress"
--   • stunning-criss-cross-back-knot-top-and-crushed-sheen-lehenga
--       → "Stunning Criss-Cross Back Knot Top And Crushed Sheen Lehenga"
-- =============================================================================

DELETE FROM public.product_reviews
WHERE product_slug IN (
  'red-dress',
  'stunning-criss-cross-back-knot-top-and-crushed-sheen-lehenga'
);

-- ── Red Dress ────────────────────────────────────────────────────────────────
-- 5 reviews → avg 4.4  (5★×3, 4★×1, 3★×1)
INSERT INTO public.product_reviews
  (product_slug, user_name, rating, title, comment, verified, created_at)
VALUES
  ('red-dress', 'Priya Sharma', 5,
   'Absolutely stunning!',
   'The red is so vibrant and the fabric quality is premium. My daughter twirled in it all evening and the colour did not fade after a wash.',
   TRUE,  NOW() - INTERVAL '21 days'),

  ('red-dress', 'Meera Iyer', 4,
   'Lovely, but runs slightly small',
   'Beautiful dress and a gorgeous shade of red. Size up if your child is between sizes — the fit was a touch snug for us.',
   TRUE,  NOW() - INTERVAL '15 days'),

  ('red-dress', 'Anjali Kapoor', 5,
   'Perfect for festivities',
   'Got so many compliments at the family function. Soft, comfortable, and the stitching is really neat. Highly recommend.',
   TRUE,  NOW() - INTERVAL '9 days'),

  ('red-dress', 'Ritu Desai', 5,
   'Worth every rupee',
   'Exceeded my expectations — looks even better in person than in the photos. Will be buying more from this brand.',
   FALSE, NOW() - INTERVAL '5 days'),

  ('red-dress', 'Sneha Nair', 3,
   'Nice dress, delivery was slow',
   'The dress itself is good quality, but it took longer than expected to arrive. Knocking off a couple of stars for that.',
   TRUE,  NOW() - INTERVAL '2 days');

-- ── Stunning Criss-Cross Back Knot Top And Crushed Sheen Lehenga ─────────────
-- 4 reviews → avg 4.8  (5★×3, 4★×1)
INSERT INTO public.product_reviews
  (product_slug, user_name, rating, title, comment, verified, created_at)
VALUES
  ('stunning-criss-cross-back-knot-top-and-crushed-sheen-lehenga', 'Kavya Reddy', 5,
   'Showstopper outfit!',
   'The crushed sheen lehenga catches the light beautifully and the criss-cross back is such a unique detail. We loved it.',
   TRUE,  NOW() - INTERVAL '18 days'),

  ('stunning-criss-cross-back-knot-top-and-crushed-sheen-lehenga', 'Pooja Mehta', 5,
   'Gorgeous craftsmanship',
   'Premium feel and very well finished. My daughter felt like a little princess at the wedding. Worth every penny.',
   TRUE,  NOW() - INTERVAL '11 days'),

  ('stunning-criss-cross-back-knot-top-and-crushed-sheen-lehenga', 'Divya Joshi', 4,
   'Beautiful, minor fit adjustment',
   'A stunning piece overall. The top knot needed a slight adjustment for a snug fit, but the look is absolutely lovely.',
   TRUE,  NOW() - INTERVAL '6 days'),

  ('stunning-criss-cross-back-knot-top-and-crushed-sheen-lehenga', 'Aishwarya Rao', 5,
   'Stole the show',
   'Everyone at the function asked where we bought it. Excellent quality and the colours are rich. Highly recommended.',
   FALSE, NOW() - INTERVAL '3 days');

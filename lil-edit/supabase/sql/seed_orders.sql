-- Sample orders so the /orders pages render before checkout/placement exists.
-- Run in the Supabase SQL editor (AFTER the migration). Seeds orders for EVERY
-- user in `profiles` (2 orders each) using REAL products from your live `products`
-- table — actual title, slug, category, SKU, primary image, variant colour and
-- price. Totals are computed from the real prices.
--
-- Re-running first deletes all previously seeded rows (LE-SEED-%).
-- To seed only some users, add a LIMIT to the loop's SELECT (marked below).

DO $$
DECLARE
  v_user    RECORD;
  v_prod    RECORD;
  v_seq     INTEGER := 0;            -- global counter → unique order_number
  v_users   INTEGER := 0;
  v_order   UUID;
  v_num     TEXT;
  v_subtotal NUMERIC;
  v_items   INTEGER;
  v_qty     INTEGER;
  v_line    NUMERIC;
  v_status  TEXT;
  v_ship    NUMERIC;
  o         INTEGER;                 -- order index per user (1..2)
  v_nproducts INTEGER;
  v_statuses TEXT[] := ARRAY['delivered','shipped','processing','pending','confirmed','cancelled'];
  v_addr_mumbai JSONB := jsonb_build_object(
    'label','Home','line1','12 Marine Drive','line2','Flat 4B',
    'landmark','Near Apollo Hospital','city','Mumbai','state','Maharashtra',
    'country','India','pincode','400020');
  v_addr_blr JSONB := jsonb_build_object(
    'label','Work','line1','88 Residency Road','line2','2nd Floor',
    'landmark','Opp. Garuda Mall','city','Bengaluru','state','Karnataka',
    'country','India','pincode','560025');
BEGIN
  SELECT count(*) INTO v_nproducts FROM products;
  IF v_nproducts = 0 THEN
    RAISE EXCEPTION 'No published products found — add catalog products before seeding orders.';
  END IF;

  -- Clean up previous seed rows for ALL users (order_items cascade on delete).
  DELETE FROM orders WHERE order_number LIKE 'LE-SEED-%';

  FOR v_user IN
    SELECT id FROM public.profiles ORDER BY created_at
    -- LIMIT 10   -- 👈 uncomment to cap how many users get seeded
  LOOP
    v_users := v_users + 1;

    FOR o IN 1..2 LOOP
      v_seq    := v_seq + 1;
      v_num    := 'LE-SEED-' || LPAD(v_seq::text, 4, '0');
      v_status := v_statuses[1 + (v_seq % array_length(v_statuses, 1))];

      -- Order shell — totals filled in after items are inserted.
      INSERT INTO orders (user_id, order_number, status, payment_method, payment_status,
                          subtotal, discount, shipping_fee, total, item_count,
                          shipping_address, created_at)
      VALUES (
        v_user.id, v_num, v_status,
        CASE WHEN o = 1 THEN 'cod' ELSE 'online' END,
        CASE v_status WHEN 'pending' THEN 'pending' WHEN 'cancelled' THEN 'refunded' ELSE 'paid' END,
        0, 0, 0, 0, 0,
        CASE WHEN o = 1 THEN v_addr_mumbai ELSE v_addr_blr END,
        CASE WHEN o = 1 THEN NOW() - ((v_seq * 2) || ' days')::interval
             ELSE NOW() - (v_seq || ' hours')::interval END
      )
      RETURNING id INTO v_order;

      v_subtotal := 0;
      v_items    := 0;

      -- Up to 2 random REAL products per order.
      FOR v_prod IN
        SELECT p.id, p.title, p.slug, p.category_slug, p.base_sku, p.price, p.sizes
        FROM products p
        ORDER BY random()
        LIMIT 2
      LOOP
        v_qty  := 1 + floor(random() * 2)::int;        -- 1 or 2
        v_line := COALESCE(v_prod.price, 0) * v_qty;
        v_subtotal := v_subtotal + v_line;
        v_items := v_items + v_qty;

        INSERT INTO order_items (order_id, product_slug, category_slug, sku, title, image_url,
                                 size, color_name, color_hex, unit_price, quantity, line_total)
        VALUES (
          v_order,
          v_prod.slug,
          COALESCE(v_prod.category_slug, ''),
          -- prefer a variant SKU, fall back to the product's base SKU
          COALESCE(
            (SELECT pv.variant_sku FROM product_variants pv
              WHERE pv.product_id = v_prod.id ORDER BY pv.sort_order LIMIT 1),
            v_prod.base_sku
          ),
          v_prod.title,
          -- primary image, else first image, else blank
          COALESCE(
            (SELECT pi.image_url FROM product_images pi
              WHERE pi.product_id = v_prod.id AND pi.is_primary ORDER BY pi.sort_order LIMIT 1),
            (SELECT pi.image_url FROM product_images pi
              WHERE pi.product_id = v_prod.id ORDER BY pi.sort_order LIMIT 1),
            ''
          ),
          COALESCE(v_prod.sizes[1], ''),
          COALESCE((SELECT pv.color_name FROM product_variants pv
              WHERE pv.product_id = v_prod.id ORDER BY pv.sort_order LIMIT 1), ''),
          COALESCE((SELECT pv.color_hex FROM product_variants pv
              WHERE pv.product_id = v_prod.id ORDER BY pv.sort_order LIMIT 1), '#cccccc'),
          COALESCE(v_prod.price, 0),
          v_qty,
          v_line
        );
      END LOOP;

      -- Free shipping over ₹4999, else ₹99 — same rule checkout will use later.
      v_ship := CASE WHEN v_subtotal >= 4999 THEN 0 ELSE 99 END;
      UPDATE orders
        SET subtotal     = v_subtotal,
            shipping_fee = v_ship,
            total        = v_subtotal + v_ship,
            item_count   = v_items
      WHERE id = v_order;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Seeded % users (% orders) from % live products.', v_users, v_seq, v_nproducts;
END $$;

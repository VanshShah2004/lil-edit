-- SQL Schema for SKU Counters
-- This creates the counter table and the atomic increment function.

CREATE TABLE IF NOT EXISTS sku_counters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(255) NOT NULL, -- Stores Category Code (e.g. ETHNIC)
    gender VARCHAR(255) NOT NULL,   -- Stores Gender Code (e.g. GIRL)
    last_assigned_number INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(category, gender)
);

-- Function to increment counter atomically using PostgreSQL UPSERT pattern
CREATE OR REPLACE FUNCTION increment_sku_counter(p_category TEXT, p_gender TEXT)
RETURNS INTEGER AS $$
DECLARE
    v_last_number INTEGER;
BEGIN
    INSERT INTO sku_counters (category, gender, last_assigned_number)
    VALUES (p_category, p_gender, 1)
    ON CONFLICT (category, gender)
    DO UPDATE SET 
        last_assigned_number = sku_counters.last_assigned_number + 1,
        updated_at = timezone('utc'::text, now())
    RETURNING last_assigned_number INTO v_last_number;
    
    RETURN v_last_number;
END;
$$ LANGUAGE plpgsql;


-- INITIALIZATION: Sync existing products and drafts into sku_counters
-- This ensures the counter starts AFTER the highest existing product number.
DO $$
BEGIN
    INSERT INTO sku_counters (category, gender, last_assigned_number)
    SELECT 
        split_part(base_sku, '-', 2) as category_code,
        split_part(base_sku, '-', 3) as gender_code,
        MAX((regexp_match(base_sku, '-(\d+)$'))[1]::integer) as last_number
    FROM (
        SELECT base_sku FROM products
        UNION ALL
        SELECT base_sku FROM draft_products
    ) all_products
    WHERE base_sku LIKE 'EDIT-%'
    GROUP BY 1, 2
    ON CONFLICT (category, gender) 
    DO UPDATE SET 
        last_assigned_number = GREATEST(sku_counters.last_assigned_number, EXCLUDED.last_assigned_number);
EXCEPTION
    WHEN undefined_table THEN
        -- Handle case where products/draft_products don't exist yet
        NULL;
END $$;

-- Add UNIQUE constraint to products if not already there
-- We use DO blocks to avoid errors if constraints already exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN
        ALTER TABLE products DROP CONSTRAINT IF EXISTS unique_product_sku;
        ALTER TABLE products ADD CONSTRAINT unique_product_sku UNIQUE (base_sku);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'draft_products') THEN
        ALTER TABLE draft_products DROP CONSTRAINT IF EXISTS unique_draft_product_sku;
        ALTER TABLE draft_products ADD CONSTRAINT unique_draft_product_sku UNIQUE (base_sku);
    END IF;
END $$;

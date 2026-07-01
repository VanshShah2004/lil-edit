-- Auto-transition confirmed orders to processing after 10 minutes
-- Runs periodically (every 5 minutes) via pg_cron

-- RPC function to auto-transition orders
CREATE OR REPLACE FUNCTION auto_confirm_to_processing()
RETURNS TABLE (
  transitioned_count INT,
  error_message TEXT
) AS $$
DECLARE
  v_order_id UUID;
  v_order_row RECORD;
  v_count INT := 0;
  v_error TEXT := NULL;
BEGIN
  -- Find all orders that are 'confirmed' and were placed > 10 minutes ago
  FOR v_order_row IN
    SELECT id, user_id, status
    FROM orders
    WHERE status = 'confirmed'
      AND created_at <= now() - interval '10 minutes'
    ORDER BY created_at ASC
  LOOP
    BEGIN
      v_order_id := v_order_row.id;

      -- Call the existing admin_set_order_status with system actor
      PERFORM admin_set_order_status(
        p_order_id := v_order_id,
        p_status := 'processing',
        p_admin_id := NULL,
        p_admin_name := 'System',
        p_admin_email := 'system@theliledit.internal',
        p_override := FALSE
      );

      v_count := v_count + 1;
      RAISE LOG 'Auto-transitioned order % to processing', v_order_id;
    EXCEPTION WHEN OTHERS THEN
      v_error := COALESCE(v_error || E'\n', '') || format('Order %s: %s', v_order_id, SQLERRM);
      RAISE WARNING 'Failed to auto-transition order %: %', v_order_id, SQLERRM;
    END;
  END LOOP;

  RETURN QUERY SELECT v_count, v_error;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revoke public execute, grant to service role only
REVOKE EXECUTE ON FUNCTION auto_confirm_to_processing() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auto_confirm_to_processing() TO service_role;

-- Create pg_cron extension if it doesn't exist (requires Supabase Pro+)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Schedule the job to run every 5 minutes (so it catches orders within ~15 min max)
-- This is idempotent — if already scheduled, it just updates the schedule
SELECT cron.schedule(
  'auto-confirm-to-processing',        -- job name
  '*/5 * * * *',                        -- every 5 minutes
  'SELECT auto_confirm_to_processing()' -- the function
);

-- ⚠️ MANUAL STEP: If you're on Supabase FREE tier, pg_cron is not available.
-- Instead, create a backend endpoint (POST /api/admin/orders/auto-process) and
-- call it from your monitoring service or CI/CD scheduler every 5 minutes.
-- See backend/routes/adminOrders.ts for the implementation.

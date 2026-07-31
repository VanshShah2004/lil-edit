-- =============================================================================
-- Migration: Audit the automatic confirmed → processing transition
-- Created:   2026-07-09
-- Purpose:   The scheduled auto-transition (20260704_auto_confirm_to_processing.sql)
--            moves orders confirmed 10+ minutes ago to 'processing' entirely inside
--            Postgres — it calls admin_set_order_status() directly and never passes
--            through the Express route where logAdminAction() runs. So these changes
--            were invisible on the Admin Activity feed (admin_action_log).
--
--            This redefines auto_confirm_to_processing() to ALSO write an
--            admin_action_log row for each order it actually moves, using the same
--            'order_status_changed' shape the manual path writes from
--            backend/routes/adminOrders.ts. admin_id is NULL and metadata.system=true
--            so the feed attributes the action to "System" rather than a removed admin.
--
--            Both entry points (pg_cron on Pro+, and POST /api/admin/orders/auto-process
--            on free tier) call this one function, so a single change covers both.
--            The cron schedule itself is unchanged — it already runs
--            `SELECT auto_confirm_to_processing()`, which now points at this body.
--
-- Depends on: 20260704_auto_confirm_to_processing.sql (the function + admin_set_order_status)
--             20260708_admin_action_log.sql            (the admin_action_log table)
--
-- Run in the Supabase SQL editor as the project owner. Idempotent — safe to re-run.
-- =============================================================================

CREATE OR REPLACE FUNCTION auto_confirm_to_processing()
RETURNS TABLE (
  transitioned_count INT,
  error_message TEXT
) AS $$
DECLARE
  v_order_id    UUID;
  v_order_row   RECORD;
  v_from_status TEXT;
  v_result      TEXT;
  v_count       INT := 0;
  v_error       TEXT := NULL;
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

      -- Call the existing admin_set_order_status with a system actor, capturing its
      -- result so we only count / audit orders that ACTUALLY moved. (A concurrent
      -- change could have advanced the order between the snapshot above and the row
      -- lock taken inside the function, in which case result <> 'changed'.)
      SELECT s.from_status, s.result
        INTO v_from_status, v_result
        FROM admin_set_order_status(
          p_order_id    := v_order_id,
          p_status      := 'processing',
          p_admin_id    := NULL,
          p_admin_name  := 'System',
          p_admin_email := 'system@theliledit.internal',
          p_override    := FALSE
        ) AS s;

      IF v_result = 'changed' THEN
        v_count := v_count + 1;
        RAISE LOG 'Auto-transitioned order % to processing', v_order_id;

        -- Mirror the transition into the admin audit trail so it appears on the Admin
        -- Activity feed. Best-effort: wrapped in its OWN sub-block so a logging failure
        -- (e.g. admin_action_log not yet migrated) is swallowed and can never roll back
        -- the committed status change — the same "logging never blocks the mutation"
        -- guarantee the app-code logAdminAction() path gives.
        BEGIN
          INSERT INTO admin_action_log (admin_id, action, target_type, target_id, summary, metadata)
          VALUES (
            NULL,                               -- no human admin — this is the system
            'order_status_changed',             -- reuse the manual action → Orders filter, deep-link, chip
            'order',
            v_order_id::text,
            format('Auto-transitioned order status %s → processing', v_from_status),
            jsonb_build_object(
              'orderId',        v_order_id,
              'fromStatus',     v_from_status,
              'toStatus',       'processing',
              'override',       false,
              'emailed',        false,
              'system',         true,           -- feed renders "System" instead of a removed admin
              'autoTransition', true
            )
          );
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'Auto-process: audit log insert failed for order %: %', v_order_id, SQLERRM;
        END;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_error := COALESCE(v_error || E'\n', '') || format('Order %s: %s', v_order_id, SQLERRM);
      RAISE WARNING 'Failed to auto-transition order %: %', v_order_id, SQLERRM;
    END;
  END LOOP;

  RETURN QUERY SELECT v_count, v_error;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Execute grants are unchanged from 20260704 (service_role only); re-assert defensively.
REVOKE EXECUTE ON FUNCTION auto_confirm_to_processing() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auto_confirm_to_processing() TO service_role;

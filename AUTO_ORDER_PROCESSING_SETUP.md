# Auto-Transition: Confirmed → Processing (10 minutes)

## Overview

After an order is placed and reaches `confirmed` status, it will **automatically transition to `processing`** after 10 minutes and log the change in the audit trail as a "System" action.

---

## What Changed

### 1. Migration: `20260704_auto_confirm_to_processing.sql`
- Creates `auto_confirm_to_processing()` RPC function
- Finds all `confirmed` orders older than 10 minutes
- Transitions each to `processing` via `admin_set_order_status()`
- Logs each transition in `order_status_history` with:
  - `changed_by`: NULL
  - `changed_by_name`: "System"
  - `changed_by_email`: "system@theliledit.internal"
  - Time: current timestamp

### 2. Backend: New Admin Endpoint
```
POST /api/admin/orders/auto-process
```
- Rate-limited (admin mutation limiter)
- Returns: `{ success: true, transitioned: N }`
- Can be called manually or on a schedule

---

## Setup Instructions

### Option A: Supabase Pro+ (pg_cron Auto-Schedule)

✅ **Easiest**

1. Ensure your Supabase project is on **Pro tier or higher**
2. Run the migration:
   ```sql
   -- In Supabase SQL Editor, paste the contents of:
   -- lil-edit/supabase/migrations/20260704_auto_confirm_to_processing.sql
   ```
3. The migration automatically schedules the job to run **every 5 minutes**
4. **No further action needed** — it runs silently in the background

**Verification:**
```sql
-- Check that the job is scheduled
SELECT jobid, jobname, schedule, command 
FROM cron.job 
WHERE jobname = 'auto-confirm-to-processing';
```

---

### Option B: Supabase Free Tier (Manual Backend Trigger)

❌ pg_cron is **not available** on free tier

**Solution:** Call the endpoint every 5 minutes from an external scheduler

#### Step 1: Run the Migration
```sql
-- In Supabase SQL Editor, run the FIRST PART only (before the ⚠️ comment):
-- 1. CREATE FUNCTION auto_confirm_to_processing()
-- 2. REVOKE/GRANT permissions
-- 3. CREATE EXTENSION pg_cron (this will fail on free tier, that's OK)

-- Skip the cron.schedule() call entirely
```

#### Step 2: Set Up External Scheduler

**Using GitHub Actions** (Free)
```yaml
name: Auto-Process Orders

on:
  schedule:
    - cron: '*/5 * * * *'  # Every 5 minutes

jobs:
  auto-process:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger auto-process
        run: |
          curl -X POST \
            https://your-backend.vercel.app/api/admin/orders/auto-process \
            -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
            -H "Content-Type: application/json"
```

**Using a Cron Service** (e.g., EasyCron, cron-job.org)
- Service: Ping every 5 minutes
- URL: `https://your-backend.vercel.app/api/admin/orders/auto-process`
- Headers: `Authorization: Bearer YOUR_SERVICE_ROLE_KEY`

**Using Node.js Scheduler** (if running backend 24/7)
```javascript
// In backend/server.ts, after starting the Express server:
import schedule from 'node-schedule';

// Run every 5 minutes
schedule.scheduleJob('*/5 * * * *', async () => {
  try {
    await fetch('http://localhost:3000/api/admin/orders/auto-process', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` }
    });
  } catch (err) {
    console.error('Auto-process job failed:', err);
  }
});
```

---

## How It Works

### Timeline

```
10:00 AM — Order placed, status="confirmed"
          └─ Transition timestamp: created_at

10:05 AM — First auto-process run
          └─ Order is 5 min old → skip (too new)

10:10 AM — Second auto-process run
          └─ Order is 10 min old → TRANSITION to "processing"
          └─ Log entry added: confirmed → processing by System

10:15 AM — Third auto-process run
          └─ Order is now "processing" → skip (not "confirmed")
```

### Audit Trail Entry

After the 10-minute transition, the order_status_history shows:

```
id             | order_id | from_status | to_status   | changed_by | changed_by_name | created_at
───────────────┼──────────┼─────────────┼─────────────┼────────────┼─────────────────┼──────────
... (other)    | ...      | ...         | ...         | ...        | ...             | ...
abc123def456   | ord-1    | confirmed   | processing  | NULL       | System          | 10:10:00
```

**Customer never sees this** — the audit trail is admin-only.

---

## Testing

### Manual Test
```bash
# Call the endpoint directly
curl -X POST http://localhost:3000/api/admin/orders/auto-process \
  -H "Authorization: Bearer $(echo $SUPABASE_SERVICE_ROLE_KEY)" \
  -H "Content-Type: application/json"

# Response:
# { "success": true, "transitioned": 2 }
```

### Verify in Database
```sql
-- Check orders that transitioned
SELECT 
  o.id,
  o.order_number,
  o.status,
  o.created_at,
  osh.from_status,
  osh.to_status,
  osh.changed_by_name,
  osh.created_at as transitioned_at
FROM orders o
JOIN order_status_history osh ON o.id = osh.order_id
WHERE osh.changed_by_name = 'System'
  AND osh.to_status = 'processing'
ORDER BY osh.created_at DESC;
```

---

## Configuration

### Change the 10-Minute Window

**In the migration**, find:
```sql
WHERE status = 'confirmed'
  AND created_at <= now() - interval '10 minutes'
```

Change to your desired interval:
```sql
-- 5 minutes
AND created_at <= now() - interval '5 minutes'

-- 15 minutes
AND created_at <= now() - interval '15 minutes'

-- 1 hour
AND created_at <= now() - interval '1 hour'
```

**Then reapply the migration** (or manually update the function).

### Change the Check Frequency

**pg_cron schedule** (in the migration):
```sql
-- Every 5 minutes (default)
'*/5 * * * *'

-- Every 2 minutes (more responsive)
'*/2 * * * *'

-- Every 10 minutes (less frequent)
'*/10 * * * *'

-- Every hour
'0 * * * *'
```

---

## Rollback

### Disable the Auto-Process

**If using pg_cron (Supabase Pro):**
```sql
SELECT cron.unschedule('auto-confirm-to-processing');
```

**If using manual trigger:**
- Stop calling the endpoint
- No cleanup needed (the function still exists but won't run)

### Remove the Feature Entirely

```sql
-- Delete the RPC function
DROP FUNCTION IF EXISTS auto_confirm_to_processing();

-- Delete the scheduled job (if pg_cron)
DELETE FROM cron.job WHERE jobname = 'auto-confirm-to-processing';
```

---

## Error Handling

### What Happens If the RPC Fails?

The function logs warnings but **does not stop**:
- Processes all other confirmed orders
- Returns partial success: `{ success: true, transitioned: 5, warnings: "..." }`
- One order's failure doesn't block the rest

### What If the Same Order is Processed Twice?

**It can't happen** — the RPC checks `WHERE status = 'confirmed'`:
- After the first transition to "processing", the next run skips it
- Idempotent by design

### What If the Function Can't Call admin_set_order_status()?

The entire RPC fails for that order:
- Error is logged
- Processing continues for other orders
- Returns with warning message

---

## Monitoring

### Logs
- Backend logs show: `[AUTO PROCESS] transitioned 3 order(s) elapsed=245ms`
- Database logs show each RPC execution

### Metrics to Track
- How many orders transition per run
- How often the auto-process succeeds/fails
- Customer impact (do they see the change immediately?)

### Alert On Failures
Set up monitoring for:
```sql
-- If no orders transitioned in the last 30 minutes, alert
SELECT 1
FROM order_status_history
WHERE changed_by_name = 'System'
  AND to_status = 'processing'
  AND created_at > now() - interval '30 minutes'
HAVING COUNT(*) = 0;
```

---

## FAQ

**Q: Will customers see the order status change to "processing" automatically?**
A: Yes! Their order detail page will refresh every time they reload, and the timeline will update to show "Processing" ✓.

**Q: What if I want to disable it for some orders?**
A: The query only affects orders with `status = 'confirmed'`. You can add a column (e.g., `auto_process_enabled BOOL`) and filter by it.

**Q: Can I test with a shorter interval (e.g., 1 minute)?**
A: Yes! Change the interval in the migration before running it. However, test with a copy order first.

**Q: What happens if an admin manually changes status to "processing" before 10 minutes?**
A: The auto-process sees it's no longer "confirmed" and skips it. No duplicate transition.

**Q: Does this work on free-tier Supabase?**
A: The RPC works, but pg_cron is Pro+ only. Use Option B (manual trigger) instead.

---

## Deployment Checklist

- [ ] Run migration `20260704_auto_confirm_to_processing.sql` in Supabase SQL Editor
- [ ] If Supabase Pro: Verify the scheduled job with the SQL query above
- [ ] If Free Tier: Set up external scheduler (GitHub Actions / cron service)
- [ ] Test by placing an order and waiting 10 minutes
- [ ] Verify in database that the status changed
- [ ] Check order_status_history shows "System" transition
- [ ] Monitor backend logs for auto-process runs
- [ ] Adjust 10-minute window if needed

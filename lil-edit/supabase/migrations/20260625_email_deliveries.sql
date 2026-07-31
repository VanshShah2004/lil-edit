-- Email delivery tracking — the receiving end of Resend's webhooks.
--
-- "We sent it" (Resend accepted the request) is NOT the same as "it arrived". Resend
-- reports the real outcome asynchronously via webhooks (delivered / bounced / complained
-- / opened …). This table records the LATEST known status per sent email, keyed by the
-- Resend message id, so bounces and spam complaints are visible instead of silent.
--
-- Populated entirely by the webhook handler (backend/routes/emailWebhook.ts) from the
-- event payload itself — no send-side bookkeeping needed. Default-deny RLS: the
-- service-role backend reads/writes it; clients have no access.

CREATE TABLE IF NOT EXISTS email_deliveries (
  -- The id Resend returns when the message is accepted, and references in every webhook.
  resend_id     TEXT        PRIMARY KEY,
  to_email      TEXT        NOT NULL DEFAULT '',
  subject       TEXT        NOT NULL DEFAULT '',
  -- Latest event, minus the "email." prefix: sent | delivered | delivery_delayed |
  -- bounced | complained | opened | clicked. Soft events never overwrite a recorded
  -- bounced/complained/delivered (see the handler's STATUS_RANK).
  status        TEXT        NOT NULL DEFAULT 'sent',
  -- Bounce reason / complaint detail, when the event carries one.
  detail        TEXT,
  last_event_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- "Show me everything that bounced / complained, most recent first."
CREATE INDEX IF NOT EXISTS email_deliveries_status_idx
  ON email_deliveries (status, updated_at DESC);

ALTER TABLE email_deliveries ENABLE ROW LEVEL SECURITY;

-- Newsletter subscribers: one row per unique email. Public, unauthenticated inserts
-- (the footer form has no login gate), so RLS allows anon INSERT only — no read/update/delete
-- from the client. Admin reads/exports go through the service-role key, which bypasses RLS.

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Guests (no session) may subscribe any email — that's the anonymous footer form.
-- A logged-in user may only write THEIR OWN account email, not someone else's, so a
-- signed-in customer can't (accidentally or otherwise) subscribe arbitrary addresses.
CREATE POLICY "newsletter: guest any email, logged-in own email only"
  ON newsletter_subscribers FOR INSERT
  WITH CHECK (
    auth.uid() IS NULL
    OR email = lower(btrim(auth.jwt()->>'email'))
  );

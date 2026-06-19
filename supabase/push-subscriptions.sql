-- Push subscriptions — one row per admin-browser pair per tournament.
-- Safe to re-run (idempotent).

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tournament_id, endpoint)
);

-- No public RLS policies: this table is only accessed via the Vercel service key,
-- never directly from the browser.
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

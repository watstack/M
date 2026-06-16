CREATE TABLE IF NOT EXISTS page_views (
  id              bigserial PRIMARY KEY,
  page            text        NOT NULL,
  visitor_id      text        NOT NULL,
  tournament_code text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;
-- Service key (used by /api/track) bypasses RLS — no anon INSERT policy needed.

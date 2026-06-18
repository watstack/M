CREATE TABLE IF NOT EXISTS page_views (
  id              bigserial PRIMARY KEY,
  page            text        NOT NULL,
  visitor_id      text        NOT NULL,
  tournament_code text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;

-- The site is hosted on GitHub Pages (static — no server to hold a service key),
-- so the browser writes page views directly with the public anon key.
-- Visitors may only INSERT; there is no SELECT policy, so raw rows (and the
-- visitor_ids in them) stay private.
DROP POLICY IF EXISTS "anon can insert page views" ON page_views;
CREATE POLICY "anon can insert page views" ON page_views
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Aggregated stats for the admin dashboard. SECURITY DEFINER lets it read the
-- table without exposing individual rows to the anon role.
CREATE OR REPLACE FUNCTION public.analytics_summary()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'total_views',     (SELECT count(*) FROM page_views),
    'unique_visitors', (SELECT count(DISTINCT visitor_id) FROM page_views),
    'pages', COALESCE((
      SELECT json_agg(p)
      FROM (
        SELECT page,
               count(*)::int                   AS views,
               count(DISTINCT visitor_id)::int AS unique_visitors
        FROM page_views
        GROUP BY page
        ORDER BY count(*) DESC
      ) p
    ), '[]'::json)
  );
$$;

GRANT EXECUTE ON FUNCTION public.analytics_summary() TO anon, authenticated;

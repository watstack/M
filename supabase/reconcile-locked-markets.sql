-- Self-healing reconciliation for market rows created after their match was
-- already resolved elsewhere in the same tournament.
--
-- Knockout-stage team resolution happens via api/_lib/settle-lib.js's
-- setMatchTeams()/propagateResult(), fired once when the feeding match
-- settles. It PATCHes every bet_markets row that exists at that moment for
-- the resolved (tournament_id, match_no) — no market_type filter. Any market
-- type introduced AFTER that patch already fired (e.g. first_scorer, added
-- mid-tournament onto SF matches whose QF had already settled) never gets
-- touched by it: buildMarketRows() decides "resolved" purely from the static
-- WC2026_FIXTURES file, which is never updated for knockout stages, so a
-- brand-new market type's first-ever row is always scaffolded locked/uncoded
-- via the ignore-duplicates path — and since the row already exists, every
-- future run silently no-ops on it forever.
--
-- This function is generic (not first_scorer-specific) so it also protects
-- against any future new market type hitting the same gap. Idempotent and
-- cheap to call on every cron run / page load — the WHERE clause only ever
-- touches rows that are genuinely stuck.
CREATE OR REPLACE FUNCTION reconcile_locked_markets() RETURNS void LANGUAGE sql AS $$
  UPDATE bet_markets bm
  SET locked     = mr.locked,
      home_code  = mr.home_code,
      away_code  = mr.away_code,
      match_name = mr.match_name
  FROM bet_markets mr
  WHERE mr.tournament_id = bm.tournament_id
    AND mr.match_no      = bm.match_no
    AND mr.market_type   = 'match_result'
    AND bm.market_type  != 'match_result'
    AND bm.locked = true AND bm.home_code IS NULL
    AND mr.locked = false AND mr.home_code IS NOT NULL;
$$;

-- Self-heal odds_json for match_result / double_chance / qualify on the Final
-- (Spain v Argentina) and Third-Place Playoff (France v England).
--
-- These two matches never look "resolved" to buildMarketRows()
-- (api/_lib/market-builder.js): their real team codes only ever land in the
-- DB via propagateResult()/setMatchTeams(), patched directly onto EXISTING
-- bet_markets rows once the feeding semi-final settles — the static
-- WC2026_FIXTURES file itself is never updated for knockout stages (see
-- supabase/reconcile-locked-markets.sql's header for the identical class of
-- bug). So the hand-set static fallback odds added to market-builder.js's
-- "resolved" branch for these two matches (STATIC_MATCH_RESULT_ODDS,
-- STATIC_DOUBLE_CHANCE_ODDS, STATIC_QUALIFY_ODDS) can never actually fire in
-- production — that branch never runs for them. These three backfill
-- functions are the real fix, same self-heal pattern as
-- backfill_anytime_scorer_odds/backfill_first_scorer_odds
-- (supabase/anytime-scorer-market.sql, supabase/final-third-place-markets.sql):
-- called after reconcile_locked_markets() has unlocked + coded the row, they
-- fill in odds_json directly.
--
-- Keyed by exact `home|away` (not sorted) since these market types are
-- orientation-sensitive (draw-no-bet home vs away aren't symmetric) — each
-- covers exactly one fixed, known match, unlike the sorted-pair anytime/first
-- scorer tables that could in principle apply to either semi-final slot.
--
-- Run in: Supabase dashboard -> SQL Editor, or via MCP apply_migration.

CREATE OR REPLACE FUNCTION backfill_match_result_odds() RETURNS void LANGUAGE sql AS $$
  UPDATE bet_markets bm
  SET odds_json = pair.odds, odds_fetched_at = NOW()
  FROM (VALUES
    ('ESP|ARG', '{"home": 2.25, "draw": 3.00, "away": 3.60}'::jsonb), -- Final: Spain (h) v Argentina (a)
    ('FRA|ENG', '{"home": 1.85, "draw": 3.90, "away": 3.90}'::jsonb)  -- Third-place: France (h) v England (a)
  ) AS pair(key, odds)
  WHERE bm.market_type = 'match_result'
    AND bm.odds_json IS NULL
    AND bm.home_code IS NOT NULL AND bm.away_code IS NOT NULL
    AND pair.key = bm.home_code || '|' || bm.away_code;
$$;

CREATE OR REPLACE FUNCTION backfill_double_chance_odds() RETURNS void LANGUAGE sql AS $$
  UPDATE bet_markets bm
  SET odds_json = pair.odds, odds_fetched_at = NOW()
  FROM (VALUES
    ('ESP|ARG', '{"1x": 1.26, "x2": 1.62, "12": 1.37}'::jsonb), -- Final
    ('FRA|ENG', '{"1x": 1.23, "x2": 1.97, "12": 1.22}'::jsonb)  -- Third-place
  ) AS pair(key, odds)
  WHERE bm.market_type = 'double_chance'
    AND bm.odds_json IS NULL
    AND bm.home_code IS NOT NULL AND bm.away_code IS NOT NULL
    AND pair.key = bm.home_code || '|' || bm.away_code;
$$;

CREATE OR REPLACE FUNCTION backfill_qualify_odds() RETURNS void LANGUAGE sql AS $$
  UPDATE bet_markets bm
  SET odds_json = pair.odds, odds_fetched_at = NOW()
  FROM (VALUES
    ('ESP|ARG', '{"home": 1.64, "away": 2.26}'::jsonb), -- To Lift the Cup: Spain / Argentina
    ('FRA|ENG', '{"home": 1.42, "away": 2.72}'::jsonb)  -- To Finish Third: France / England
  ) AS pair(key, odds)
  WHERE bm.market_type = 'qualify'
    AND bm.odds_json IS NULL
    AND bm.home_code IS NOT NULL AND bm.away_code IS NOT NULL
    AND pair.key = bm.home_code || '|' || bm.away_code;
$$;

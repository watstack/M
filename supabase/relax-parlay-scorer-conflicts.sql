-- Fix: parlay correlated-legs guard over-blocks first_scorer/anytime_scorer.
--
-- Two migrations landed independently and both got this wrong in opposite
-- directions:
--   - fix-parlay-conflict-guard.sql replaced the old enumerated OR-chain
--     with a blanket rule: no two different market types on the same
--     match, period. That's too strict -- who scores first or the total
--     goals in a match don't determine the winner, so e.g. first_scorer +
--     over_under + match_result on one match should be a legitimate combo,
--     and the blanket rule wrongly rejects it.
--   - anytime-scorer-market.sql (added concurrently, for the new
--     anytime_scorer market) instead extended the old enumerated OR-chain,
--     which still never accounted for over_under at all, and separately
--     blocked anytime_scorer against everything else on the match --
--     same over-blocking mistake, just hand-written instead of blanket.
--
-- This is the reconciled version: a precise "same outcome" model.
--   - match_result, correct_score, double_chance, qualify are mutually
--     exclusive: each one restates, or is a coarser/finer view of, "which
--     side won", so any two of them share the same outcome.
--   - over_under (total goals) is fully determined by correct_score (the
--     two numbers in a correct_score pick sum to the total), so those two
--     conflict too.
--   - first_scorer and anytime_scorer conflict with each other -- a player
--     who scores first has, by definition, also scored "anytime" -- but
--     with nothing else: neither determines the match winner or the total
--     goals, so first_scorer/anytime_scorer stay combinable with
--     match_result, over_under, etc.
-- Run in: Supabase dashboard -> SQL Editor, or via MCP apply_migration.

CREATE OR REPLACE FUNCTION place_parlay(
  p_participant_id UUID,
  p_legs           JSONB,
  p_stake          INT,
  p_total_odds     NUMERIC
) RETURNS parlay_bets LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_leg        JSONB;
  v_market     bet_markets;
  v_balance    INT;
  v_parlay     parlay_bets;
  v_parlay_id  UUID;
  v_tid        UUID;
BEGIN
  IF jsonb_array_length(p_legs) < 2 THEN
    RAISE EXCEPTION 'parlay_too_few_legs';
  END IF;

  -- Validate all legs (with row locks) before touching money
  FOR v_leg IN SELECT * FROM jsonb_array_elements(p_legs) LOOP
    SELECT * INTO v_market FROM bet_markets
    WHERE id = (v_leg->>'market_id')::UUID FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'market_not_found'; END IF;
    IF v_market.locked           THEN RAISE EXCEPTION 'market_locked'; END IF;
    IF v_market.status <> 'open' THEN RAISE EXCEPTION 'market_closed'; END IF;
    IF v_market.close_time IS NOT NULL AND NOW() >= v_market.close_time THEN
      UPDATE bet_markets SET status = 'closed' WHERE id = v_market.id;
      RAISE EXCEPTION 'market_closed';
    END IF;
    IF v_tid IS NULL THEN v_tid := v_market.tournament_id; END IF;
  END LOOP;

  -- Reject a parlay with two legs on the exact same market (bypasses the
  -- client's per-market dedup, but the DB is the authoritative check).
  IF EXISTS (
    SELECT market_id FROM (
      SELECT (leg->>'market_id')::UUID AS market_id
      FROM jsonb_array_elements(p_legs) AS leg
    ) s GROUP BY market_id HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'parlay_duplicate_leg';
  END IF;

  -- Reject a parlay that combines correlated/redundant markets on the same
  -- match -- see file header for the reasoning behind each clause.
  IF EXISTS (
    SELECT 1 FROM (
      SELECT bm.match_no, bm.market_type
      FROM jsonb_array_elements(p_legs) AS leg
      JOIN bet_markets bm ON bm.id = (leg->>'market_id')::UUID
    ) sub
    GROUP BY match_no
    HAVING (
      COUNT(DISTINCT market_type) FILTER (
        WHERE market_type IN ('match_result', 'correct_score', 'double_chance', 'qualify')
      ) > 1
      OR (bool_or(market_type = 'correct_score') AND bool_or(market_type = 'over_under'))
      OR (bool_or(market_type = 'first_scorer') AND bool_or(market_type = 'anytime_scorer'))
    )
  ) THEN
    RAISE EXCEPTION 'parlay_correlated_legs';
  END IF;

  -- Balance check + single deduction for the whole parlay
  SELECT coin_balance INTO v_balance FROM participants
  WHERE id = p_participant_id FOR UPDATE;
  IF v_balance < p_stake THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
  UPDATE participants SET coin_balance = coin_balance - p_stake
  WHERE id = p_participant_id;

  -- Insert parlay header
  INSERT INTO parlay_bets(tournament_id, participant_id, stake, total_odds)
  VALUES (v_tid, p_participant_id, p_stake, p_total_odds)
  RETURNING * INTO v_parlay;
  v_parlay_id := v_parlay.id;

  -- Insert legs
  FOR v_leg IN SELECT * FROM jsonb_array_elements(p_legs) LOOP
    INSERT INTO parlay_bet_legs(parlay_id, tournament_id, market_id, selection, odds)
    VALUES (
      v_parlay_id,
      v_tid,
      (v_leg->>'market_id')::UUID,
      v_leg->>'selection',
      (v_leg->>'odds')::NUMERIC
    );
  END LOOP;

  RETURN v_parlay;
END; $$;

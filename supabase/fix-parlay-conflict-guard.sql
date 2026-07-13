-- Fix: parlay correlated-legs guard missed the over_under market entirely.
--
-- The guard was built up incrementally across four prior migrations
-- (parlay-bets.sql -> double-chance.sql -> qualify-market.sql ->
-- first-scorer-market.sql), each hand-adding an OR clause for whichever
-- market type it introduced. over_under (semi-final total-goals market)
-- never got one, so a user could combine correct_score + over_under on the
-- same match -- over_under's result is deterministically derived from the
-- same regulation score as correct_score, so that pair always wins or loses
-- together off one real event. place_parlay multiplies leg odds naively
-- with no correlation adjustment, so that was a free-money exploit.
--
-- Rather than add a fifth special case, this replaces the whole enumerated
-- pairwise check with one general rule: a parlay may not contain two
-- different market types for the same match. Every market on a match
-- settles off the same match data, so this holds for every market type
-- that exists today and any added later.
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

  -- Reject a parlay that combines two different markets on the same match.
  -- Every market for a given match_no settles off the same match data (e.g.
  -- correct_score always determines over_under's outcome), so any two are
  -- correlated or outright redundant. place_parlay multiplies leg odds
  -- naively with no correlation adjustment, so allowing same-match
  -- cross-market legs would be a free-money exploit.
  IF EXISTS (
    SELECT 1 FROM (
      SELECT bm.match_no, bm.market_type
      FROM jsonb_array_elements(p_legs) AS leg
      JOIN bet_markets bm ON bm.id = (leg->>'market_id')::UUID
    ) sub
    GROUP BY match_no
    HAVING COUNT(DISTINCT market_type) > 1
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

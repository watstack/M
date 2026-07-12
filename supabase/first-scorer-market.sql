-- First-goalscorer market support for semi-final stage.
-- Extends place_parlay() correlated-legs guard so a first_scorer leg can't be
-- combined with any other same-match market. No table/column changes: bet_markets
-- already fits market_type = 'first_scorer' rows exactly (odds_json = { "Player
-- Name": price, ... }, same shape the 'custom' market already uses). place_bet
-- and settle_market are market-type-agnostic already and need no changes —
-- settle_market's home/draw/away OR-clauses never collide with a player-name
-- p_result, so settle_market(market_id, 'Kylian Mbappe') just works.
-- Run in: Supabase dashboard → SQL Editor, or via MCP apply_migration.

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

  -- Reject parlays that mix correlated market types on the same match:
  -- match_result + correct_score, match_result + double_chance,
  -- correct_score + double_chance, two double_chance, qualify + anything else,
  -- two qualify legs, first_scorer + anything else on the same match (a team
  -- to win + that team's striker to score first is positively correlated, and
  -- place_parlay multiplies leg odds naively with no correlation adjustment —
  -- allowing it would be a free-money exploit for users).
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT bm.match_no, bm.market_type
      FROM jsonb_array_elements(p_legs) AS leg
      JOIN bet_markets bm ON bm.id = (leg->>'market_id')::UUID
    ) sub
    GROUP BY match_no
    HAVING (
      (COUNT(DISTINCT market_type) > 1
       AND bool_or(market_type = 'match_result')
       AND bool_or(market_type = 'correct_score'))
      OR (bool_or(market_type = 'double_chance')
          AND (bool_or(market_type = 'match_result')
               OR bool_or(market_type = 'correct_score')))
      OR (COUNT(*) FILTER (WHERE market_type = 'double_chance') > 1)
      OR (bool_or(market_type = 'qualify')
          AND (bool_or(market_type = 'match_result')
               OR bool_or(market_type = 'correct_score')
               OR bool_or(market_type = 'double_chance')))
      OR (COUNT(*) FILTER (WHERE market_type = 'qualify') > 1)
      OR (bool_or(market_type = 'first_scorer')
          AND (bool_or(market_type = 'match_result')
               OR bool_or(market_type = 'correct_score')
               OR bool_or(market_type = 'double_chance')
               OR bool_or(market_type = 'qualify')))
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

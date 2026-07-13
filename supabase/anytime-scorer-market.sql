-- Anytime Goalscorer market support for semi-final stage.
-- Unlike every other market here (first_scorer included), Anytime Goalscorer
-- has genuinely multiple winners: every player who scores at any point in
-- the match (regulation or extra time, NOT penalty shootouts — see
-- api/_lib/settle-lib.js allScorers()). settle_market()/place_parlay()'s
-- existing correlated-legs guard are built around a single p_result string
-- per market, so they can't grade this correctly — hence a dedicated
-- settle_market_multi() RPC and a new results_json column instead of
-- reusing `result`.
-- Run in: Supabase dashboard → SQL Editor, or via MCP apply_migration.

-- ─── 1. results_json column (multi-winner markets only; `result` stays
-- single-purpose for every other market type and is left NULL here) ─────────
ALTER TABLE bet_markets ADD COLUMN IF NOT EXISTS results_json JSONB;

-- ─── 2. settle_market_multi RPC ──────────────────────────────────────────────
-- Structurally the same as settle_market (see supabase/parlay-pump.sql, the
-- latest version — idempotency guard, pending-bet payout, parlay-leg
-- settlement + cascade with Parlay Pump promo_boost), but matches against a
-- JSONB array of winning selections instead of a single p_result string.
CREATE OR REPLACE FUNCTION settle_market_multi(
  p_market_id UUID,
  p_results   JSONB   -- ["Player A", "Player B", ...]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_parlay_id      UUID;
  v_leg_statuses   TEXT[];
  v_parlay         parlay_bets;
  v_effective_odds NUMERIC;
  v_payout         INT;
  v_all_settled    BOOLEAN;
  v_any_lost       BOOLEAN;
  v_all_won        BOOLEAN;
BEGIN
  -- Idempotency guard
  IF EXISTS (SELECT 1 FROM bet_markets WHERE id = p_market_id AND status = 'settled') THEN
    RETURN;
  END IF;

  -- Settle the market
  UPDATE bet_markets SET status = 'settled', results_json = p_results
  WHERE id = p_market_id AND status <> 'settled';

  -- Settle single bets: a winning selection is any one in p_results
  UPDATE participants p
  SET coin_balance = p.coin_balance + b.potential_payout
  FROM bets b
  WHERE b.market_id = p_market_id
    AND b.status = 'pending'
    AND b.participant_id = p.id
    AND b.selection IN (SELECT jsonb_array_elements_text(p_results));

  UPDATE bets
  SET status = CASE
    WHEN selection IN (SELECT jsonb_array_elements_text(p_results)) THEN 'won'
    ELSE 'lost'
  END
  WHERE market_id = p_market_id AND status = 'pending';

  -- Settle parlay legs for this market
  UPDATE parlay_bet_legs
  SET status = CASE
    WHEN selection IN (SELECT jsonb_array_elements_text(p_results)) THEN 'won'
    ELSE 'lost'
  END
  WHERE market_id = p_market_id AND status = 'pending';

  -- Check each affected parlay for completion (unchanged from settle_market)
  FOR v_parlay_id IN
    SELECT DISTINCT parlay_id FROM parlay_bet_legs WHERE market_id = p_market_id
  LOOP
    SELECT * INTO v_parlay FROM parlay_bets WHERE id = v_parlay_id FOR UPDATE;
    IF v_parlay.status <> 'pending' THEN CONTINUE; END IF;

    SELECT ARRAY_AGG(status) INTO v_leg_statuses
    FROM parlay_bet_legs WHERE parlay_id = v_parlay_id;

    v_all_settled := NOT ('pending' = ANY(v_leg_statuses));
    v_any_lost    := 'lost' = ANY(v_leg_statuses);
    v_all_won     := v_all_settled AND NOT v_any_lost AND 'won' = ANY(v_leg_statuses);

    IF v_any_lost THEN
      -- Bust immediately (don't wait for remaining legs to settle)
      UPDATE parlay_bets SET status = 'lost' WHERE id = v_parlay_id;

    ELSIF v_all_won THEN
      -- All legs settled, none lost — pay out using product of won-leg odds
      SELECT COALESCE(EXP(SUM(LN(odds))), 1) INTO v_effective_odds
      FROM parlay_bet_legs WHERE parlay_id = v_parlay_id AND status = 'won';

      -- Apply Parlay Pump boost (1.35 for eligible bets, 1.0 for all others)
      v_payout := ROUND(v_parlay.stake * v_effective_odds * v_parlay.promo_boost);
      UPDATE parlay_bets SET status = 'won' WHERE id = v_parlay_id;
      UPDATE participants SET coin_balance = coin_balance + v_payout
      WHERE id = v_parlay.participant_id;

    ELSIF v_all_settled AND NOT v_any_lost AND NOT ('won' = ANY(v_leg_statuses)) THEN
      -- All legs void — refund stake
      UPDATE parlay_bets SET status = 'void' WHERE id = v_parlay_id;
      UPDATE participants SET coin_balance = coin_balance + v_parlay.stake
      WHERE id = v_parlay.participant_id;
    END IF;
  END LOOP;
END; $$;

-- ─── 3. place_parlay (correlated-legs guard extended for anytime_scorer) ─────
-- Copy of the current version (supabase/qualify-market.sql) with one more
-- OR-clause: anytime_scorer can't combine with match_result / correct_score /
-- double_chance / qualify / first_scorer on the same match (a player scoring
-- anytime is highly correlated with their team winning or that same player
-- scoring first). Multiple different anytime_scorer legs on the same match
-- stay allowed — same as first_scorer, no exploit since either can
-- genuinely win or lose independently.
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
  -- two qualify legs, first_scorer + anything else on the same match,
  -- anytime_scorer + anything else on the same match (excluding another
  -- anytime_scorer leg — see file header).
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
      OR (bool_or(market_type = 'anytime_scorer')
          AND (bool_or(market_type = 'match_result')
               OR bool_or(market_type = 'correct_score')
               OR bool_or(market_type = 'double_chance')
               OR bool_or(market_type = 'qualify')
               OR bool_or(market_type = 'first_scorer')))
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

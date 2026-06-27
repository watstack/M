-- One-off Parlay Pump window: LaddyLadLad tournament, Sat 27 Jun → Sun 28 Jun 07:00 AEST
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
  v_leg_count  INT;
  v_aest_dow   INT;
  v_aest_hour  INT;
  v_promo_boost DECIMAL(4,2) := 1.0;
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

  -- Reject parlays that mix match_result + correct_score for the same match
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT bm.match_no, bm.market_type
      FROM jsonb_array_elements(p_legs) AS leg
      JOIN bet_markets bm ON bm.id = (leg->>'market_id')::UUID
    ) sub
    GROUP BY match_no
    HAVING COUNT(DISTINCT market_type) > 1
       AND bool_or(market_type = 'match_result')
       AND bool_or(market_type = 'correct_score')
  ) THEN
    RAISE EXCEPTION 'parlay_correlated_legs';
  END IF;

  -- ── Parlay Pump eligibility ──────────────────────────────────────────────────
  v_leg_count := jsonb_array_length(p_legs);
  IF v_leg_count >= 3 THEN
    v_aest_dow  := EXTRACT(DOW  FROM NOW() AT TIME ZONE 'Australia/Sydney')::INT;
    v_aest_hour := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Australia/Sydney')::INT;

    -- Regular weekly window: Wed all day → Thu before 06:00 AEST
    IF v_aest_dow = 3 OR (v_aest_dow = 4 AND v_aest_hour < 6) THEN
      v_promo_boost := 1.35;

    -- One-off window: LaddyLadLad, now → Sun 28 Jun 2026 07:00 AEST
    ELSIF v_tid = '31e106b4-3264-4333-8817-ba268aff9e7a'::UUID
      AND (NOW() AT TIME ZONE 'Australia/Sydney') < TIMESTAMP '2026-06-28 07:00:00'
    THEN
      v_promo_boost := 1.35;
    END IF;
  END IF;

  -- Balance check + single deduction for the whole parlay
  SELECT coin_balance INTO v_balance FROM participants
  WHERE id = p_participant_id FOR UPDATE;
  IF v_balance < p_stake THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
  UPDATE participants SET coin_balance = coin_balance - p_stake
  WHERE id = p_participant_id;

  -- Insert parlay header
  INSERT INTO parlay_bets(tournament_id, participant_id, stake, total_odds, promo_boost)
  VALUES (v_tid, p_participant_id, p_stake, p_total_odds, v_promo_boost)
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

-- Parlay Pump Promotion: +35% payout boost for 3+ leg parlays placed Wed → Thu 6am AEST.
-- Additive migration — adds promo_boost column and replaces place_parlay + settle_market.

-- ─── 1. Add promo_boost column ───────────────────────────────────────────────
ALTER TABLE parlay_bets
  ADD COLUMN IF NOT EXISTS promo_boost DECIMAL(4,2) NOT NULL DEFAULT 1.0;

-- ─── 2. place_parlay (replace: sets promo_boost at placement time) ────────────
CREATE OR REPLACE FUNCTION place_parlay(
  p_participant_id UUID,
  p_legs           JSONB,        -- [{market_id, selection, odds}, ...]
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
    -- Capture tournament_id from first valid leg
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

  -- Reject parlays that include a custom bet leg
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_legs) AS leg
    JOIN bet_markets bm ON bm.id = (leg->>'market_id')::UUID
    WHERE bm.market_type = 'custom'
  ) THEN
    RAISE EXCEPTION 'custom_bet_in_parlay';
  END IF;

  -- ── Parlay Pump eligibility ──────────────────────────────────────────────────
  -- Boost applies to 3+ leg parlays placed Wed (DOW=3) any time
  -- through Thu (DOW=4) before 06:00 AEST.
  v_leg_count := jsonb_array_length(p_legs);
  IF v_leg_count >= 3 THEN
    v_aest_dow  := EXTRACT(DOW  FROM NOW() AT TIME ZONE 'Australia/Sydney')::INT;
    v_aest_hour := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Australia/Sydney')::INT;
    IF v_aest_dow = 3 OR (v_aest_dow = 4 AND v_aest_hour < 6) THEN
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

-- ─── 3. settle_market (replace: applies promo_boost on parlay payout) ─────────
CREATE OR REPLACE FUNCTION settle_market(
  p_market_id UUID,
  p_result    TEXT
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
  UPDATE bet_markets SET status = 'settled', result = p_result
  WHERE id = p_market_id AND status <> 'settled';

  -- Settle single bets (unchanged from original)
  UPDATE participants p
  SET coin_balance = p.coin_balance + b.potential_payout
  FROM bets b
  WHERE b.market_id = p_market_id
    AND b.selection = p_result
    AND b.status = 'pending'
    AND b.participant_id = p.id;

  UPDATE bets
  SET status = CASE WHEN selection = p_result THEN 'won' ELSE 'lost' END
  WHERE market_id = p_market_id AND status = 'pending';

  -- Settle parlay legs for this market
  UPDATE parlay_bet_legs
  SET status = CASE WHEN selection = p_result THEN 'won' ELSE 'lost' END
  WHERE market_id = p_market_id AND status = 'pending';

  -- Check each affected parlay for completion
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
      -- (void legs excluded; EXP(SUM(LN(odds))) is the SQL product aggregate)
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

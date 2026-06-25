-- Double-chance market support.
-- Additive migration — replaces settle_market and place_parlay to handle
-- the new 'double_chance' market type alongside existing types.
-- Run in: Supabase dashboard → SQL Editor, or via MCP apply_migration.

-- ─── 1. selection_wins helper ────────────────────────────────────────────────
-- Returns true when a bet selection covers the settled result.
-- For double_chance: '1x' covers home/draw, 'x2' covers away/draw, '12' covers home/away.
-- For all other types: exact match (selection = result).
CREATE OR REPLACE FUNCTION selection_wins(
  p_market_type TEXT,
  p_selection   TEXT,
  p_result      TEXT
) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_market_type
    WHEN 'double_chance' THEN
      CASE p_selection
        WHEN '1x' THEN p_result IN ('home', 'draw')
        WHEN 'x2' THEN p_result IN ('away', 'draw')
        WHEN '12' THEN p_result IN ('home', 'away')
        ELSE FALSE
      END
    ELSE p_selection = p_result
  END;
$$;

-- ─── 2. settle_market (replace: handles double_chance via selection_wins) ────
CREATE OR REPLACE FUNCTION settle_market(
  p_market_id UUID,
  p_result    TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_market_type    TEXT;
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

  SELECT market_type INTO v_market_type FROM bet_markets WHERE id = p_market_id;

  -- Settle the market
  UPDATE bet_markets SET status = 'settled', result = p_result
  WHERE id = p_market_id AND status <> 'settled';

  -- Pay out winning single bets
  UPDATE participants p
  SET coin_balance = p.coin_balance + b.potential_payout
  FROM bets b
  WHERE b.market_id  = p_market_id
    AND b.status     = 'pending'
    AND b.participant_id = p.id
    AND selection_wins(v_market_type, b.selection, p_result);

  -- Settle single bets
  UPDATE bets
  SET status = CASE
    WHEN selection_wins(v_market_type, selection, p_result) THEN 'won'
    ELSE 'lost'
  END
  WHERE market_id = p_market_id AND status = 'pending';

  -- Settle parlay legs for this market
  UPDATE parlay_bet_legs
  SET status = CASE
    WHEN selection_wins(v_market_type, selection, p_result) THEN 'won'
    ELSE 'lost'
  END
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
      UPDATE parlay_bets SET status = 'lost' WHERE id = v_parlay_id;

    ELSIF v_all_won THEN
      SELECT COALESCE(EXP(SUM(LN(odds))), 1) INTO v_effective_odds
      FROM parlay_bet_legs WHERE parlay_id = v_parlay_id AND status = 'won';

      v_payout := ROUND(v_parlay.stake * v_effective_odds);
      UPDATE parlay_bets SET status = 'won' WHERE id = v_parlay_id;
      UPDATE participants SET coin_balance = coin_balance + v_payout
      WHERE id = v_parlay.participant_id;

    ELSIF v_all_settled AND NOT v_any_lost AND NOT ('won' = ANY(v_leg_statuses)) THEN
      UPDATE parlay_bets SET status = 'void' WHERE id = v_parlay_id;
      UPDATE participants SET coin_balance = coin_balance + v_parlay.stake
      WHERE id = v_parlay.participant_id;
    END IF;
  END LOOP;
END; $$;

-- ─── 3. place_parlay (replace: extended correlated-legs guard) ────────────────
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
  -- correct_score + double_chance, or two double_chance legs on the same match.
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
    )
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

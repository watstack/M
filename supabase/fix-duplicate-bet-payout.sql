-- Fix: duplicate bets on the same market were only paid out once.
-- The previous UPDATE...FROM pattern picked one row arbitrarily when a
-- participant had multiple winning bets on the same market. Replace with
-- a correlated SUM() subquery so all winning bets are summed per participant.

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

  -- Pay out winning single bets, summing all bets per participant so that
  -- duplicate bets on the same market each receive their payout.
  UPDATE participants p
  SET coin_balance = p.coin_balance + (
    SELECT COALESCE(SUM(b.potential_payout), 0)
    FROM bets b
    WHERE b.market_id      = p_market_id
      AND b.status         = 'pending'
      AND b.participant_id = p.id
      AND selection_wins(v_market_type, b.selection, p_result)
  )
  WHERE EXISTS (
    SELECT 1 FROM bets b
    WHERE b.market_id      = p_market_id
      AND b.status         = 'pending'
      AND b.participant_id = p.id
      AND selection_wins(v_market_type, b.selection, p_result)
  );

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

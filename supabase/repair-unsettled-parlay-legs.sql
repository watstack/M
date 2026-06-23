-- Repair pending parlay legs on already-settled markets.
--
-- Root cause: settle_market() was called for these markets before parlay leg
-- support was added to the function. The idempotency guard now blocks
-- re-running settle_market(), so we apply the same leg-settling and parlay
-- completion logic here as a one-time data repair.

DO $$
DECLARE
  v_parlay_id      UUID;
  v_parlay         parlay_bets;
  v_leg_statuses   TEXT[];
  v_all_settled    BOOLEAN;
  v_any_lost       BOOLEAN;
  v_all_won        BOOLEAN;
  v_effective_odds NUMERIC;
  v_payout         INT;
  v_fixed_legs     INT;
BEGIN

  -- Step 1: settle all pending legs whose market is already settled.
  UPDATE parlay_bet_legs pbl
  SET status = CASE
    WHEN selection_wins(bm.market_type, pbl.selection, bm.result) THEN 'won'
    ELSE 'lost'
  END
  FROM bet_markets bm
  WHERE bm.id       = pbl.market_id
    AND pbl.status  = 'pending'
    AND bm.status   = 'settled'
    AND bm.result   IS NOT NULL;

  GET DIAGNOSTICS v_fixed_legs = ROW_COUNT;
  RAISE NOTICE 'Repaired % parlay leg(s) on settled markets', v_fixed_legs;

  -- Step 2: run parlay completion check for every parlay that had a leg on
  -- one of the now-updated markets (same logic as settle_market).
  FOR v_parlay_id IN
    SELECT DISTINCT pbl.parlay_id
    FROM parlay_bet_legs pbl
    JOIN bet_markets bm ON bm.id = pbl.market_id
    WHERE bm.status = 'settled'
      AND bm.result IS NOT NULL
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
      RAISE NOTICE 'Parlay % → lost', v_parlay_id;

    ELSIF v_all_won THEN
      SELECT COALESCE(EXP(SUM(LN(odds))), 1) INTO v_effective_odds
      FROM parlay_bet_legs WHERE parlay_id = v_parlay_id AND status = 'won';

      v_payout := ROUND(v_parlay.stake * v_effective_odds);
      UPDATE parlay_bets SET status = 'won' WHERE id = v_parlay_id;
      UPDATE participants SET coin_balance = coin_balance + v_payout
      WHERE id = v_parlay.participant_id;
      RAISE NOTICE 'Parlay % → won, payout %', v_parlay_id, v_payout;

    ELSIF v_all_settled AND NOT v_any_lost AND NOT ('won' = ANY(v_leg_statuses)) THEN
      UPDATE parlay_bets SET status = 'void' WHERE id = v_parlay_id;
      UPDATE participants SET coin_balance = coin_balance + v_parlay.stake
      WHERE id = v_parlay.participant_id;
      RAISE NOTICE 'Parlay % → void, stake refunded', v_parlay_id;

    ELSE
      RAISE NOTICE 'Parlay % still pending (% legs unsettled)', v_parlay_id,
        (SELECT COUNT(*) FROM parlay_bet_legs WHERE parlay_id = v_parlay_id AND status = 'pending');
    END IF;
  END LOOP;

END; $$;

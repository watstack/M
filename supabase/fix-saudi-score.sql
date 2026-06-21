-- Corrective patch: Spain vs Saudi Arabia (match 45) score 5-0 → 4-0
-- The upstream data provider reported the wrong final score (5-0 instead of 4-0).
-- This fixes wc_matches (fixture carousel), re-settles the correct_score market,
-- and reverses/replays all affected single-bet and parlay payouts.

-- 1. Fix the displayed score in the fixture carousel data source
UPDATE wc_matches
SET home_score = 4
WHERE home_tla = 'ESP' AND away_tla = 'KSA' AND home_score = 5;

-- 2. Re-settle each correct_score market for match 45 settled with the wrong result
DO $$
DECLARE
  v_market bet_markets;
BEGIN
  FOR v_market IN
    SELECT * FROM bet_markets
    WHERE match_no = 45
      AND market_type = 'correct_score'
      AND status = 'settled'
      AND result = '5-0'
  LOOP

    -- a. Undo coin payouts for incorrectly-won single bets (selection = '5-0')
    UPDATE participants p
    SET coin_balance = p.coin_balance - b.potential_payout
    FROM bets b
    WHERE b.market_id = v_market.id
      AND b.status = 'won'
      AND b.participant_id = p.id;

    -- b. Reset all single bets on this market to pending
    UPDATE bets
    SET status = 'pending'
    WHERE market_id = v_market.id AND status IN ('won', 'lost');

    -- c. Undo payouts for won parlays that had a leg on this market.
    --    Recomputes the exact payout using EXP(SUM(LN(won-leg odds))), matching
    --    the formula used by settle_market at settlement time.
    UPDATE participants p
    SET coin_balance = p.coin_balance - (
      SELECT ROUND(pb_inner.stake * EXP(SUM(LN(pbl_inner.odds))))
      FROM parlay_bets pb_inner
      JOIN parlay_bet_legs pbl_inner ON pbl_inner.parlay_id = pb_inner.id
      WHERE pb_inner.id = pb_outer.id AND pbl_inner.status = 'won'
      GROUP BY pb_inner.stake
    )
    FROM parlay_bets pb_outer
    JOIN parlay_bet_legs pbl ON pbl.parlay_id = pb_outer.id
    WHERE pbl.market_id = v_market.id
      AND pb_outer.status = 'won'
      AND pb_outer.participant_id = p.id;

    -- d. Reset settled parlay_bets (won or lost) that had a leg settled by
    --    this market back to pending so they can be re-evaluated.
    UPDATE parlay_bets pb
    SET status = 'pending'
    FROM parlay_bet_legs pbl
    WHERE pbl.parlay_id = pb.id
      AND pbl.market_id = v_market.id
      AND pbl.status IN ('won', 'lost')
      AND pb.status IN ('won', 'lost');

    -- e. Reset only the legs tied to this market to pending.
    UPDATE parlay_bet_legs
    SET status = 'pending'
    WHERE market_id = v_market.id AND status IN ('won', 'lost');

    -- f. Reopen the market so settle_market can process it.
    UPDATE bet_markets
    SET status = 'open', result = NULL
    WHERE id = v_market.id;

    -- g. Re-settle with the correct score. The existing RPC awards '4-0' winners,
    --    marks all others lost, and re-triggers the parlay cascade.
    PERFORM settle_market(v_market.id, '4-0');

  END LOOP;
END; $$;

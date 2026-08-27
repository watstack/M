-- Reverses a void_market() call so the market can be re-settled correctly.
-- Symmetric complement to void_market() (supabase/qualify-market.sql) — added
-- to remediate anytime_scorer markets that were auto-voided by a since-fixed
-- bug (wc_matches.goals was always empty, so every anytime_scorer market that
-- reached settlement took the unconditional void branch, refunding stakes
-- even when the match had real goalscorers — see api/_lib/sync-matches.js
-- and the auto-settle.js/auto-settle.cjs anytime_scorer dispatch fix).
-- Run in: Supabase dashboard → SQL Editor, or via MCP apply_migration.
--
-- Usage: call this, then call the market's normal settle RPC (e.g.
-- settle_market_multi for anytime_scorer) with the correct result — this
-- function only undoes void_market()'s effects, it does not re-grade
-- anything itself, so the existing settle RPC can be reused unmodified.
-- Both calls are individually idempotent, so re-running the pair is safe:
-- this no-ops once status is no longer 'void', and the settle RPC no-ops
-- once status is 'settled'.
CREATE OR REPLACE FUNCTION reverse_void_market(
  p_market_id UUID
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_parlay_id      UUID;
  v_parlay         parlay_bets;
  v_effective_odds NUMERIC;
  v_clawback       INT;
BEGIN
  -- Idempotency guard — only ever reverses a market currently sitting void.
  IF NOT EXISTS (SELECT 1 FROM bet_markets WHERE id = p_market_id AND status = 'void') THEN
    RETURN;
  END IF;

  -- Claw back single-bet refunds paid by void_market, put bets back to pending.
  UPDATE participants p
  SET coin_balance = p.coin_balance - b.stake
  FROM bets b
  WHERE b.market_id = p_market_id AND b.status = 'void' AND b.participant_id = p.id;

  UPDATE bets SET status = 'pending'
  WHERE market_id = p_market_id AND status = 'void';

  -- Claw back any parlay payout/refund that already resolved around the void leg.
  FOR v_parlay_id IN
    SELECT DISTINCT parlay_id FROM parlay_bet_legs WHERE market_id = p_market_id AND status = 'void'
  LOOP
    SELECT * INTO v_parlay FROM parlay_bets WHERE id = v_parlay_id FOR UPDATE;

    IF v_parlay.status = 'won' THEN
      -- Effective odds at the time this parlay resolved excluded the still-void
      -- leg — recompute the same way from the currently-'won' legs (unaffected
      -- by this reversal so far) to know exactly what was paid.
      SELECT COALESCE(EXP(SUM(LN(odds))), 1) INTO v_effective_odds
      FROM parlay_bet_legs WHERE parlay_id = v_parlay_id AND status = 'won';
      v_clawback := ROUND(v_parlay.stake * v_effective_odds * v_parlay.promo_boost);
      UPDATE participants SET coin_balance = coin_balance - v_clawback WHERE id = v_parlay.participant_id;
      UPDATE parlay_bets SET status = 'pending' WHERE id = v_parlay_id;

    ELSIF v_parlay.status = 'void' THEN
      UPDATE participants SET coin_balance = coin_balance - v_parlay.stake WHERE id = v_parlay.participant_id;
      UPDATE parlay_bets SET status = 'pending' WHERE id = v_parlay_id;
    END IF;
    -- 'lost' or 'pending': no money was ever moved because of this leg, leave as-is.
  END LOOP;

  -- Reset this market's legs last, after every parlay's clawback above has
  -- computed effective_odds off their still-void state.
  UPDATE parlay_bet_legs SET status = 'pending'
  WHERE market_id = p_market_id AND status = 'void';
END; $$;

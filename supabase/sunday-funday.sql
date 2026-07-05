-- Sunday Funday Promotion: after confirming a bet on a Sunday (AEST), the
-- participant calls heads or tails and watches a coin flip; a correct call
-- gives a +10% odds boost. Automatic (no opt-in), mutually exclusive with
-- Odds Boost on single bets, applied client-side-gated but guarded here
-- against double-application. Additive migration.

-- ─── 1. Guard columns ─────────────────────────────────────────────────────────
ALTER TABLE bets        ADD COLUMN IF NOT EXISTS sunday_funday_boosted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE parlay_bets ADD COLUMN IF NOT EXISTS sunday_funday_boosted BOOLEAN NOT NULL DEFAULT false;

-- ─── 2. apply_sunday_funday_boost (single bets) ──────────────────────────────
-- Bumps bets.odds by 10%; potential_payout is a generated column and
-- recomputes automatically from the new odds.
CREATE OR REPLACE FUNCTION apply_sunday_funday_boost(
  p_bet_id         UUID,
  p_participant_id UUID
) RETURNS bets LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_bet bets;
BEGIN
  SELECT * INTO v_bet FROM bets
  WHERE id = p_bet_id AND participant_id = p_participant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bet_not_found'; END IF;
  IF v_bet.sunday_funday_boosted THEN RAISE EXCEPTION 'already_boosted'; END IF;

  UPDATE bets
  SET odds = ROUND(odds * 1.10, 2), sunday_funday_boosted = true
  WHERE id = p_bet_id
  RETURNING * INTO v_bet;

  RETURN v_bet;
END; $$;

-- ─── 3. apply_sunday_funday_boost_parlay (multi-leg parlays) ─────────────────
-- Bumps parlay_bets.promo_boost by 10%; settle_market already multiplies
-- payout by promo_boost, so no settlement changes are needed.
CREATE OR REPLACE FUNCTION apply_sunday_funday_boost_parlay(
  p_parlay_id      UUID,
  p_participant_id UUID
) RETURNS parlay_bets LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_parlay parlay_bets;
BEGIN
  SELECT * INTO v_parlay FROM parlay_bets
  WHERE id = p_parlay_id AND participant_id = p_participant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'parlay_not_found'; END IF;
  IF v_parlay.sunday_funday_boosted THEN RAISE EXCEPTION 'already_boosted'; END IF;

  UPDATE parlay_bets
  SET promo_boost = ROUND(promo_boost * 1.10, 2), sunday_funday_boosted = true
  WHERE id = p_parlay_id
  RETURNING * INTO v_parlay;

  RETURN v_parlay;
END; $$;

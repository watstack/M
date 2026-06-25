-- Parlay / multi-leg bet support for World Cup 2026 betting.
-- Additive migration — does not alter existing tables except to replace settle_market.
-- Run in: Supabase dashboard → SQL Editor, or via MCP apply_migration.

-- ─── 1. parlay_bets ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parlay_bets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id    UUID NOT NULL REFERENCES tournaments(id)  ON DELETE CASCADE,
  participant_id   UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  stake            INT  NOT NULL CHECK (stake > 0),
  total_odds       NUMERIC(12,2) NOT NULL,
  potential_payout INT  GENERATED ALWAYS AS (ROUND(stake * total_odds)) STORED,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','won','lost','void')),
  placed_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. parlay_bet_legs ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parlay_bet_legs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parlay_id     UUID NOT NULL REFERENCES parlay_bets(id)  ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES tournaments(id)  ON DELETE CASCADE,
  market_id     UUID NOT NULL REFERENCES bet_markets(id)  ON DELETE CASCADE,
  selection     TEXT NOT NULL,
  odds          NUMERIC(8,2) NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','won','lost','void'))
);

-- ─── 3. Realtime ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime'
      AND pr.prrelid = 'public.parlay_bets'::regclass
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.parlay_bets; END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime'
      AND pr.prrelid = 'public.parlay_bet_legs'::regclass
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.parlay_bet_legs; END IF;
END $$;

-- ─── 4. Row Level Security ────────────────────────────────────────────────────
ALTER TABLE parlay_bets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE parlay_bet_legs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read parlay_bets"     ON parlay_bets;
DROP POLICY IF EXISTS "Public read parlay_bet_legs" ON parlay_bet_legs;

CREATE POLICY "Public read parlay_bets"     ON parlay_bets     FOR SELECT USING (true);
CREATE POLICY "Public read parlay_bet_legs" ON parlay_bet_legs FOR SELECT USING (true);

-- ─── 5. place_parlay RPC ─────────────────────────────────────────────────────
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

-- ─── 6. settle_market RPC (replace: now also settles parlay legs) ─────────────
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

      v_payout := ROUND(v_parlay.stake * v_effective_odds);
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

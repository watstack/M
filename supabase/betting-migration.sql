-- Betting arm migration for World Cup 2026 Sweepstake
-- Run in: Supabase dashboard → SQL Editor → New query → Run
-- Safe to re-run (idempotent).

-- ─── 1. Coin balance on participants ─────────────────────────────────────────

ALTER TABLE participants ADD COLUMN IF NOT EXISTS coin_balance INT NOT NULL DEFAULT 1000;

-- ─── 2. Bet markets ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bet_markets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  market_type     TEXT NOT NULL,       -- 'match_result' | 'correct_score' | 'tournament_winner'
  match_id        TEXT,                -- football-data.org fixture ID (null for outrights)
  match_name      TEXT NOT NULL,
  kickoff_time    TIMESTAMPTZ,         -- null for tournament_winner
  close_time      TIMESTAMPTZ,         -- = kickoff_time for match markets
  status          TEXT NOT NULL DEFAULT 'open',   -- 'open' | 'closed' | 'settled' | 'void'
  result          TEXT,                -- winning selection string after settlement
  odds_json       JSONB,               -- { "home": 2.40, "draw": 3.10, "away": 2.80 } or { "ENG": 5.0, ... }
  odds_fetched_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Prevent duplicate markets for the same match+type in a tournament
CREATE UNIQUE INDEX IF NOT EXISTS bet_markets_uniq
ON bet_markets(tournament_id, market_type, match_id)
WHERE match_id IS NOT NULL;

-- One tournament_winner market per tournament
CREATE UNIQUE INDEX IF NOT EXISTS bet_markets_winner_uniq
ON bet_markets(tournament_id, market_type)
WHERE market_type = 'tournament_winner';

-- ─── 3. Bets ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  participant_id  UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  market_id       UUID NOT NULL REFERENCES bet_markets(id) ON DELETE CASCADE,
  selection       TEXT NOT NULL,       -- "home" | "draw" | "away" | "1-0" | "ENG" etc.
  stake           INT  NOT NULL CHECK (stake > 0),
  odds            NUMERIC(8,2) NOT NULL,
  potential_payout INT GENERATED ALWAYS AS (ROUND(stake * odds)) STORED,
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'won' | 'lost' | 'void'
  placed_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 4. Enable realtime ───────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime' AND pr.prrelid = 'public.bet_markets'::regclass
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.bet_markets; END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime' AND pr.prrelid = 'public.bets'::regclass
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.bets; END IF;
END $$;

-- ─── 5. Row Level Security ────────────────────────────────────────────────────

ALTER TABLE bet_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE bets        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read bet_markets"   ON bet_markets;
DROP POLICY IF EXISTS "Anyone can insert markets"  ON bet_markets;
DROP POLICY IF EXISTS "Public read bets"           ON bets;

CREATE POLICY "Public read bet_markets"  ON bet_markets FOR SELECT USING (true);
CREATE POLICY "Anyone can insert markets" ON bet_markets FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update markets" ON bet_markets FOR UPDATE USING (true);
CREATE POLICY "Public read bets"         ON bets        FOR SELECT USING (true);

-- ─── 6. place_bet RPC (atomic balance check → deduct → insert) ───────────────

CREATE OR REPLACE FUNCTION place_bet(
  p_market_id      UUID,
  p_participant_id UUID,
  p_selection      TEXT,
  p_stake          INT,
  p_odds           NUMERIC
) RETURNS bets LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_market  bet_markets;
  v_balance INT;
  v_bet     bets;
BEGIN
  SELECT * INTO v_market FROM bet_markets WHERE id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'market_not_found'; END IF;
  IF v_market.status <> 'open' THEN RAISE EXCEPTION 'market_closed'; END IF;
  IF v_market.close_time IS NOT NULL AND NOW() >= v_market.close_time THEN
    UPDATE bet_markets SET status = 'closed' WHERE id = p_market_id;
    RAISE EXCEPTION 'market_closed';
  END IF;

  SELECT coin_balance INTO v_balance FROM participants
  WHERE id = p_participant_id FOR UPDATE;
  IF v_balance < p_stake THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  UPDATE participants SET coin_balance = coin_balance - p_stake
  WHERE id = p_participant_id;

  INSERT INTO bets(tournament_id, participant_id, market_id, selection, stake, odds)
    VALUES (v_market.tournament_id, p_participant_id, p_market_id, p_selection, p_stake, p_odds)
    RETURNING * INTO v_bet;

  RETURN v_bet;
END; $$;

-- ─── 7. settle_market RPC (idempotent — safe to call multiple times) ─────────

CREATE OR REPLACE FUNCTION settle_market(
  p_market_id UUID,
  p_result    TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM bet_markets WHERE id = p_market_id AND status = 'settled') THEN
    RETURN;
  END IF;

  UPDATE bet_markets SET status = 'settled', result = p_result
  WHERE id = p_market_id AND status <> 'settled';

  UPDATE participants p
  SET coin_balance = p.coin_balance + b.potential_payout
  FROM bets b
  WHERE b.market_id = p_market_id
    AND b.selection = p_result
    AND b.status = 'pending'
    AND b.participant_id = p.id;

  UPDATE bets SET status = CASE WHEN selection = p_result THEN 'won' ELSE 'lost' END
  WHERE market_id = p_market_id AND status = 'pending';
END; $$;

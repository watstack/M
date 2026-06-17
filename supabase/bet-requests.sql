-- Bet Requests — custom yes/no markets proposed by players and priced by admin.
-- Safe to re-run (idempotent).

-- ─── 1. Allow custom markets without a match number ───────────────────────────

ALTER TABLE bet_markets ALTER COLUMN match_no DROP NOT NULL;
-- The unique index bet_markets_no_uniq on (tournament_id, market_type, match_no)
-- treats NULLs as distinct, so multiple custom markets per tournament are fine.

-- ─── 2. bet_requests table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bet_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id  UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  outcome_text   TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
  market_id      UUID REFERENCES bet_markets(id) ON DELETE SET NULL,
  submitted_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 3. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE bet_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read bet_requests"   ON bet_requests;
DROP POLICY IF EXISTS "Anyone can insert requests" ON bet_requests;

CREATE POLICY "Public read bet_requests"   ON bet_requests FOR SELECT USING (true);
CREATE POLICY "Anyone can insert requests" ON bet_requests FOR INSERT  WITH CHECK (true);

-- ─── 4. Realtime ──────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime'
      AND pr.prrelid = 'public.bet_requests'::regclass
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.bet_requests; END IF;
END $$;

-- ─── 5. submit_bet_request RPC ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION submit_bet_request(
  p_participant_id UUID,
  p_tournament_id  UUID,
  p_outcome_text   TEXT
) RETURNS bet_requests LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_req bet_requests;
BEGIN
  IF LENGTH(TRIM(p_outcome_text)) = 0 THEN
    RAISE EXCEPTION 'outcome_text_empty';
  END IF;
  IF LENGTH(p_outcome_text) > 200 THEN
    RAISE EXCEPTION 'outcome_text_too_long';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM participants
    WHERE id = p_participant_id AND tournament_id = p_tournament_id
  ) THEN
    RAISE EXCEPTION 'participant_not_found';
  END IF;

  INSERT INTO bet_requests(tournament_id, participant_id, outcome_text)
  VALUES (p_tournament_id, p_participant_id, TRIM(p_outcome_text))
  RETURNING * INTO v_req;

  RETURN v_req;
END; $$;

-- ─── 6. approve_bet_request RPC ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION approve_bet_request(
  p_code        TEXT,
  p_admin_token TEXT,
  p_request_id  UUID,
  p_yes_odds    NUMERIC,
  p_no_odds     NUMERIC
) RETURNS bet_markets LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tournament_id UUID;
  v_req           bet_requests;
  v_market        bet_markets;
BEGIN
  SELECT id INTO v_tournament_id FROM tournaments
  WHERE code = p_code AND admin_token = p_admin_token;
  IF v_tournament_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT * INTO v_req FROM bet_requests
  WHERE id = p_request_id AND tournament_id = v_tournament_id AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;

  IF p_yes_odds < 1.01 OR p_no_odds < 1.01 THEN
    RAISE EXCEPTION 'odds_too_low';
  END IF;

  INSERT INTO bet_markets(
    tournament_id, market_type, match_name,
    status, odds_json
  ) VALUES (
    v_tournament_id, 'custom', v_req.outcome_text,
    'open', jsonb_build_object('yes', p_yes_odds, 'no', p_no_odds)
  ) RETURNING * INTO v_market;

  UPDATE bet_requests
  SET status = 'approved', market_id = v_market.id
  WHERE id = p_request_id;

  RETURN v_market;
END; $$;

-- ─── 7. reject_bet_request RPC ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION reject_bet_request(
  p_code        TEXT,
  p_admin_token TEXT,
  p_request_id  UUID
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tournament_id UUID;
BEGIN
  SELECT id INTO v_tournament_id FROM tournaments
  WHERE code = p_code AND admin_token = p_admin_token;
  IF v_tournament_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  UPDATE bet_requests SET status = 'rejected'
  WHERE id = p_request_id
    AND tournament_id = v_tournament_id
    AND status = 'pending';

  RETURN FOUND;
END; $$;

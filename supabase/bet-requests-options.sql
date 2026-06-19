-- Bet Request Custom Options — extend bet_requests with proposed options and
-- update RPCs to support arbitrary option sets (not just yes/no).
-- Safe to re-run (idempotent).

-- ─── 1. Add proposed_options column ──────────────────────────────────────────

ALTER TABLE bet_requests ADD COLUMN IF NOT EXISTS proposed_options JSONB;
-- Format: [{"label": "Yes", "odds": 2.0}, {"label": "No", "odds": 1.95}]
-- NULL for legacy requests that predate this migration.

-- ─── 2. submit_bet_request (updated: accepts p_options_json) ─────────────────

CREATE OR REPLACE FUNCTION submit_bet_request(
  p_participant_id UUID,
  p_tournament_id  UUID,
  p_outcome_text   TEXT,
  p_options_json   JSONB DEFAULT NULL
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

  INSERT INTO bet_requests(tournament_id, participant_id, outcome_text, proposed_options)
  VALUES (p_tournament_id, p_participant_id, TRIM(p_outcome_text), p_options_json)
  RETURNING * INTO v_req;

  RETURN v_req;
END; $$;

-- ─── 3. approve_bet_request (updated: accepts p_odds_json instead of yes/no) ─

CREATE OR REPLACE FUNCTION approve_bet_request(
  p_code        TEXT,
  p_admin_token TEXT,
  p_request_id  UUID,
  p_odds_json   JSONB
) RETURNS bet_markets LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tournament_id UUID;
  v_req           bet_requests;
  v_market        bet_markets;
  v_key           TEXT;
  v_val           NUMERIC;
BEGIN
  SELECT id INTO v_tournament_id FROM tournaments
  WHERE code = p_code AND admin_token = p_admin_token;
  IF v_tournament_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT * INTO v_req FROM bet_requests
  WHERE id = p_request_id AND tournament_id = v_tournament_id AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;

  -- Validate all odds values are >= 1.01
  FOR v_key, v_val IN SELECT key, (value::TEXT)::NUMERIC FROM jsonb_each(p_odds_json)
  LOOP
    IF v_val < 1.01 THEN
      RAISE EXCEPTION 'odds_too_low';
    END IF;
  END LOOP;

  INSERT INTO bet_markets(
    tournament_id, market_type, match_name,
    status, odds_json
  ) VALUES (
    v_tournament_id, 'custom', v_req.outcome_text,
    'open', p_odds_json
  ) RETURNING * INTO v_market;

  UPDATE bet_requests
  SET status = 'approved', market_id = v_market.id
  WHERE id = p_request_id;

  RETURN v_market;
END; $$;

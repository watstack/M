-- Extend approve_bet_request and reject_bet_request to support participant-admin auth
-- (is_admin = true) in addition to master admin token, matching the pattern used by
-- settle.js and resolve.js. Also normalises approve_bet_request to accept p_odds_json
-- (a JSONB object of label→odds) which is what the JS client has always sent.

-- ─── approve_bet_request ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION approve_bet_request(
  p_code           TEXT,
  p_admin_token    TEXT    DEFAULT NULL,
  p_request_id     UUID,
  p_odds_json      JSONB,
  p_participant_id UUID    DEFAULT NULL
) RETURNS bet_markets LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tournament_id UUID;
  v_req           bet_requests;
  v_market        bet_markets;
BEGIN
  IF p_admin_token IS NOT NULL THEN
    SELECT id INTO v_tournament_id FROM tournaments
    WHERE code = p_code AND admin_token = p_admin_token::uuid;
  ELSIF p_participant_id IS NOT NULL THEN
    SELECT t.id INTO v_tournament_id
    FROM tournaments t JOIN participants p ON p.tournament_id = t.id
    WHERE t.code = p_code AND p.id = p_participant_id AND p.is_admin = true;
  END IF;
  IF v_tournament_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT * INTO v_req FROM bet_requests
  WHERE id = p_request_id AND tournament_id = v_tournament_id AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;

  IF (SELECT count(*) FROM jsonb_each(p_odds_json)) < 2 THEN
    RAISE EXCEPTION 'need_two_options';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(p_odds_json) WHERE value::numeric < 1.01) THEN
    RAISE EXCEPTION 'odds_too_low';
  END IF;

  INSERT INTO bet_markets(tournament_id, market_type, match_name, status, odds_json)
  VALUES (v_tournament_id, 'custom', v_req.outcome_text, 'open', p_odds_json)
  RETURNING * INTO v_market;

  UPDATE bet_requests SET status = 'approved', market_id = v_market.id
  WHERE id = p_request_id;

  RETURN v_market;
END; $$;

-- ─── reject_bet_request ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION reject_bet_request(
  p_code           TEXT,
  p_admin_token    TEXT    DEFAULT NULL,
  p_request_id     UUID,
  p_participant_id UUID    DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tournament_id UUID;
BEGIN
  IF p_admin_token IS NOT NULL THEN
    SELECT id INTO v_tournament_id FROM tournaments
    WHERE code = p_code AND admin_token = p_admin_token::uuid;
  ELSIF p_participant_id IS NOT NULL THEN
    SELECT t.id INTO v_tournament_id
    FROM tournaments t JOIN participants p ON p.tournament_id = t.id
    WHERE t.code = p_code AND p.id = p_participant_id AND p.is_admin = true;
  END IF;
  IF v_tournament_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  UPDATE bet_requests SET status = 'rejected'
  WHERE id = p_request_id AND tournament_id = v_tournament_id AND status = 'pending';

  RETURN FOUND;
END; $$;

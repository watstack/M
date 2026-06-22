-- Clean rebuild of all bet-request RPCs.
-- Drops every known overload of approve_bet_request, reject_bet_request, and
-- the old 3-param submit_bet_request, then creates single canonical versions.
-- Fixes the ::uuid cast bug introduced in bet-requests-participant-admin.sql
-- (admin_token is TEXT, not UUID — the cast caused a type-operator error).

-- ─── 1. Drop stale old-style overloads (different param counts/types) ─────────

-- Old 3-param submit_bet_request
DROP FUNCTION IF EXISTS submit_bet_request(uuid, uuid, text);

-- Old yes/no approve_bet_request with 6 params (includes close_time)
DROP FUNCTION IF EXISTS approve_bet_request(text, text, uuid, numeric, numeric, timestamptz);

-- Old 4-param version from bet-requests-options.sql (p_admin_token non-optional)
DROP FUNCTION IF EXISTS approve_bet_request(text, text, uuid, jsonb);

-- Old 3-param reject from bet-requests.sql
DROP FUNCTION IF EXISTS reject_bet_request(text, text, uuid);

-- ─── 2. submit_bet_request ────────────────────────────────────────────────────
-- Replaces in-place (same signature already exists — just ensuring clean state).

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

-- ─── 3. approve_bet_request — FIX: remove ::uuid cast ────────────────────────
-- Replaces the existing (text, uuid, jsonb, text, uuid) overload in-place.
-- The only change from what was in DB: admin_token = p_admin_token (no ::uuid).

CREATE OR REPLACE FUNCTION approve_bet_request(
  p_code           TEXT,
  p_request_id     UUID,
  p_odds_json      JSONB,
  p_admin_token    TEXT DEFAULT NULL,
  p_participant_id UUID DEFAULT NULL,
  p_close_time     TIMESTAMPTZ DEFAULT NULL
) RETURNS bet_markets LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tournament_id UUID;
  v_req           bet_requests;
  v_market        bet_markets;
BEGIN
  IF p_admin_token IS NOT NULL THEN
    SELECT id INTO v_tournament_id FROM tournaments
    WHERE code = p_code AND admin_token = p_admin_token;
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

  INSERT INTO bet_markets(tournament_id, market_type, match_name, status, odds_json, close_time)
  VALUES (v_tournament_id, 'custom', v_req.outcome_text, 'open', p_odds_json, p_close_time)
  RETURNING * INTO v_market;

  UPDATE bet_requests SET status = 'approved', market_id = v_market.id
  WHERE id = p_request_id;

  RETURN v_market;
END; $$;

-- ─── 4. reject_bet_request — FIX: remove ::uuid cast ─────────────────────────
-- Replaces the existing (text, uuid, text, uuid) overload in-place.

CREATE OR REPLACE FUNCTION reject_bet_request(
  p_code           TEXT,
  p_request_id     UUID,
  p_admin_token    TEXT DEFAULT NULL,
  p_participant_id UUID DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tournament_id UUID;
BEGIN
  IF p_admin_token IS NOT NULL THEN
    SELECT id INTO v_tournament_id FROM tournaments
    WHERE code = p_code AND admin_token = p_admin_token;
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

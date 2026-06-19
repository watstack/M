-- Per-participant admin flag. Safe to re-run.
ALTER TABLE participants ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Master admin (token holder) grants/revokes participant admin rights.
CREATE OR REPLACE FUNCTION set_participant_admin(
  p_code           text,
  p_admin_token    text,
  p_participant_id uuid,
  p_is_admin       boolean
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_tournament_id uuid;
BEGIN
  SELECT id INTO v_tournament_id FROM tournaments
  WHERE code = p_code AND admin_token = p_admin_token;
  IF v_tournament_id IS NULL THEN RETURN false; END IF;
  UPDATE participants SET is_admin = p_is_admin
  WHERE id = p_participant_id AND tournament_id = v_tournament_id;
  RETURN FOUND;
END; $$;

-- Participant-level admin: update coin balance and cans owed.
CREATE OR REPLACE FUNCTION participant_update_participant(
  p_code                  text,
  p_actor_participant_id  uuid,
  p_target_participant_id uuid,
  p_coin_balance          int,
  p_cans_owed             int
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_tournament_id uuid;
BEGIN
  SELECT tournament_id INTO v_tournament_id FROM participants
  WHERE id = p_actor_participant_id AND is_admin = true
    AND tournament_id = (SELECT id FROM tournaments WHERE code = p_code);
  IF v_tournament_id IS NULL THEN RETURN false; END IF;
  UPDATE participants
  SET coin_balance = p_coin_balance, cans_owed = p_cans_owed
  WHERE id = p_target_participant_id AND tournament_id = v_tournament_id;
  RETURN FOUND;
END; $$;

-- Participant-level admin grants/revokes admin rights (actor must have is_admin = true).
CREATE OR REPLACE FUNCTION participant_set_admin(
  p_code                  text,
  p_actor_participant_id  uuid,
  p_target_participant_id uuid,
  p_is_admin              boolean
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_tournament_id uuid;
BEGIN
  SELECT tournament_id INTO v_tournament_id FROM participants
  WHERE id = p_actor_participant_id AND is_admin = true
    AND tournament_id = (SELECT id FROM tournaments WHERE code = p_code);
  IF v_tournament_id IS NULL THEN RETURN false; END IF;
  UPDATE participants SET is_admin = p_is_admin
  WHERE id = p_target_participant_id AND tournament_id = v_tournament_id;
  RETURN FOUND;
END; $$;

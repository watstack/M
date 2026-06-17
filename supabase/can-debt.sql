-- Add can debt tracking to participants. Safe to re-run.
ALTER TABLE participants ADD COLUMN IF NOT EXISTS cans_owed INT NOT NULL DEFAULT 0;

-- Admin RPC to update coin balance and cans owed for a participant.
-- Verifies admin token before updating (same pattern as update_participant_slots).
CREATE OR REPLACE FUNCTION admin_update_participant(
  p_code           text,
  p_admin_token    text,
  p_participant_id uuid,
  p_coin_balance   int,
  p_cans_owed      int
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_tournament_id uuid;
BEGIN
  SELECT id INTO v_tournament_id FROM tournaments
  WHERE code = p_code AND admin_token = p_admin_token;
  IF v_tournament_id IS NULL THEN RETURN false; END IF;
  UPDATE participants
  SET coin_balance = p_coin_balance, cans_owed = p_cans_owed
  WHERE id = p_participant_id AND tournament_id = v_tournament_id;
  RETURN FOUND;
END; $$;

-- World Cup 2026 Sweepstake — Supabase Schema
-- Safe to run on a fresh OR existing database (all statements are idempotent).
-- Paste into: Supabase dashboard → SQL Editor → New query → Run

-- ─── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tournaments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text UNIQUE NOT NULL,          -- 6-char invite code e.g. "WC26AB"
  admin_token     text NOT NULL,                 -- UUID shown to admin once
  name            text NOT NULL,
  teams_per_person int NOT NULL DEFAULT 3,
  status          text NOT NULL DEFAULT 'open',  -- 'open' | 'drawing' | 'live'
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS participants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   uuid REFERENCES tournaments(id) ON DELETE CASCADE,
  nickname        text NOT NULL,
  avatar_type     int NOT NULL DEFAULT 1,         -- 1-7
  team_slots      int NOT NULL DEFAULT 1,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(tournament_id, nickname)
);

CREATE TABLE IF NOT EXISTS allocations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   uuid REFERENCES tournaments(id) ON DELETE CASCADE,
  participant_id  uuid REFERENCES participants(id) ON DELETE CASCADE,
  team_code       text NOT NULL,                  -- e.g. 'ENG', 'BRA'
  team_name       text NOT NULL,
  draw_order      int,
  allocated_at    timestamptz DEFAULT now()
);

-- ─── Enable Realtime (safe to re-run — skips if already added) ───────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime' AND pr.prrelid = 'public.tournaments'::regclass
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.tournaments; END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime' AND pr.prrelid = 'public.participants'::regclass
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.participants; END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime' AND pr.prrelid = 'public.allocations'::regclass
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.allocations; END IF;
END $$;

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE tournaments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE allocations   ENABLE ROW LEVEL SECURITY;

-- Drop policies first so this is safe to re-run on an existing database
DROP POLICY IF EXISTS "Public read tournaments"       ON tournaments;
DROP POLICY IF EXISTS "Public read participants"      ON participants;
DROP POLICY IF EXISTS "Public read allocations"       ON allocations;
DROP POLICY IF EXISTS "Anyone can create tournament"  ON tournaments;
DROP POLICY IF EXISTS "Anyone can join"               ON participants;
DROP POLICY IF EXISTS "Anyone can insert allocations" ON allocations;

-- Public reads (the invite code is the access gate)
CREATE POLICY "Public read tournaments"  ON tournaments  FOR SELECT USING (true);
CREATE POLICY "Public read participants" ON participants FOR SELECT USING (true);
CREATE POLICY "Public read allocations"  ON allocations  FOR SELECT USING (true);

-- Anyone can create a tournament (admin flow)
CREATE POLICY "Anyone can create tournament" ON tournaments FOR INSERT WITH CHECK (true);

-- Anyone can join (nickname uniqueness enforced by UNIQUE constraint)
CREATE POLICY "Anyone can join" ON participants FOR INSERT WITH CHECK (true);

-- Allocations inserted during draw
CREATE POLICY "Anyone can insert allocations" ON allocations FOR INSERT WITH CHECK (true);

-- ─── Admin-gated RPCs (validate admin_token server-side) ─────────────────────

CREATE OR REPLACE FUNCTION start_draw(p_code text, p_admin_token text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE tournaments SET status = 'drawing'
  WHERE code = p_code AND admin_token = p_admin_token AND status = 'open';
  RETURN FOUND;
END; $$;

CREATE OR REPLACE FUNCTION complete_draw(p_code text, p_admin_token text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE tournaments SET status = 'live'
  WHERE code = p_code AND admin_token = p_admin_token AND status = 'drawing';
  RETURN FOUND;
END; $$;

CREATE OR REPLACE FUNCTION reopen_tournament(p_code text, p_admin_token text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM allocations WHERE tournament_id = (
    SELECT id FROM tournaments WHERE code = p_code AND admin_token = p_admin_token
  );
  UPDATE tournaments SET status = 'open'
  WHERE code = p_code AND admin_token = p_admin_token;
  RETURN FOUND;
END; $$;

CREATE OR REPLACE FUNCTION remove_participant(
  p_tournament_code text,
  p_admin_token     text,
  p_participant_id  uuid
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_tournament_id uuid;
BEGIN
  SELECT id INTO v_tournament_id FROM tournaments
  WHERE code = p_tournament_code AND admin_token = p_admin_token;
  IF v_tournament_id IS NULL THEN RETURN false; END IF;
  DELETE FROM participants WHERE id = p_participant_id AND tournament_id = v_tournament_id;
  RETURN FOUND;
END; $$;

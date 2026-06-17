-- Add can debt tracking to participants. Safe to re-run.
ALTER TABLE participants ADD COLUMN IF NOT EXISTS cans_owed INT NOT NULL DEFAULT 0;

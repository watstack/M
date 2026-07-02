-- Adds columns to capture the 90-minute (regulation-time) score separately
-- from the final score, which may include extra-time goals for knockout
-- matches decided after 90 minutes. Needed so match_result/correct_score/
-- double_chance markets can be graded on regulation time only, per the
-- Win/Draw/Loss betting rules, independent of the "qualify" market (which
-- correctly uses the final/ET-inclusive score to determine who advances).
-- Run in: Supabase dashboard -> SQL Editor, or via MCP apply_migration.

alter table wc_matches add column if not exists home_score_reg int;
alter table wc_matches add column if not exists away_score_reg int;
alter table wc_matches add column if not exists score_duration text;

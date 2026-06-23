-- Remove duplicate wc_matches rows caused by the football API returning
-- inconsistent TLA codes for the same team across different syncs.
--
-- Curaçao: API alternates between 'CUW' and 'CUR'. bet_markets uses 'CUW'.
-- Uruguay:  API alternates between 'URU' and 'URY'. bet_markets uses 'URU'.
--
-- Keeping the rows that match bet_markets.home_code / away_code ensures
-- auto-settle can join wc_matches to bet_markets by team code.

-- Remove stale CUR rows (Curaçao) — bet_markets uses CUW
DELETE FROM wc_matches WHERE home_tla = 'CUR' OR away_tla = 'CUR';

-- Remove stale URY rows (Uruguay) — bet_markets uses URU
DELETE FROM wc_matches WHERE home_tla = 'URY' OR away_tla = 'URY';

-- Remove TIMED placeholder rows with empty TLA codes — they duplicate
-- the SCHEDULED rows for the same timeslot and pollute the team-code map.
DELETE FROM wc_matches WHERE home_tla = '' AND away_tla = '';

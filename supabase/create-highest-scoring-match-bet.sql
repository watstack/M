-- Create "Highest-Scoring Match" custom bet for tournament 9HE9Y5
-- Run this in: Supabase dashboard → SQL Editor → New query → Run
--
-- This creates a custom market with 4 match options for the highest-scoring match.

-- Find the tournament ID for code 9HE9Y5
WITH tournament_data AS (
  SELECT id FROM tournaments WHERE code = '9HE9Y5'
)
-- Create the custom market
INSERT INTO bet_markets (
  tournament_id,
  market_type,
  match_name,
  status,
  odds_json,
  created_at
)
SELECT
  (SELECT id FROM tournament_data),
  'custom',
  'Highest-Scoring Match',
  'open',
  jsonb_build_object(
    'Netherlands vs Sweden', 1.67,
    'Germany vs Ivory Coast', 4.00,
    'Ecuador vs Curaçao', 10.00,
    'Tunisia vs Japan', 20.00
  ),
  NOW()
WHERE EXISTS (SELECT 1 FROM tournament_data)
RETURNING id, tournament_id, market_type, match_name, odds_json, status;

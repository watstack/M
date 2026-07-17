-- Final (Spain v Argentina) + Third-Place Playoff (France v England) market
-- support: extends the semi-final-only "extra" markets (over_under,
-- first_scorer, anytime_scorer) to also cover stage='final'/'third', and adds
-- three brand-new market types (btts, over_under_cards, total_corners) for
-- these two matches only. See api/_lib/market-builder.js's EXTRA_MARKET_STAGES
-- and js/betting.js's STATIC_BTTS_ODDS/STATIC_OU_CARDS_ODDS/STATIC_CORNERS_ODDS
-- for the client-side static odds tables backing btts/over_under_cards/
-- total_corners (those three are display-only, no odds_json ever stored —
-- same as over_under, no backfill needed).
--
-- Run in: Supabase dashboard → SQL Editor, or via MCP apply_migration.

-- ─── 1. backfill_anytime_scorer_odds — extended with the final + third-place
-- team pairs (ARG|ESP, ENG|FRA). Copy of supabase/anytime-scorer-market.sql's
-- version with two more VALUES rows; see that file's header for why this
-- self-heal step exists at all (knockout market rows are always scaffolded
-- locked/odds-less at insert time, and only unlocked+coded later by
-- reconcile_locked_markets(), which deliberately never sets odds_json).
CREATE OR REPLACE FUNCTION backfill_anytime_scorer_odds() RETURNS void LANGUAGE sql AS $$
  UPDATE bet_markets bm
  SET odds_json = pair.odds, odds_fetched_at = NOW()
  FROM (VALUES
    ('ESP|FRA', '{
      "Kylian Mbappe": 2.00, "Ousmane Dembele": 3.30, "Michael Olise": 3.75,
      "Bradley Barcola": 4.00, "Desire Doue": 4.00, "Adrien Rabiot": 7.00,
      "Manu Kone": 10.00, "Aurelien Tchouameni": 12.00, "Lucas Digne": 14.00,
      "Jules Kounde": 15.00, "William Saliba": 15.00,
      "Mikel Oyarzabal": 2.88, "Lamine Yamal": 3.30, "Nico Williams": 4.33,
      "Alex Baena": 5.00, "Dani Olmo": 5.00, "Fabian Ruiz": 7.00,
      "Pedri": 10.00, "Rodri": 10.00, "Pedro Porro": 12.00,
      "Marc Cucurella": 14.00, "Aymeric Laporte": 18.00, "Pau Cubarsi": 18.00
    }'::jsonb),
    ('ARG|ENG', '{
      "Harry Kane": 2.30, "Jude Bellingham": 4.00, "Marcus Rashford": 4.50,
      "Anthony Gordon": 5.00, "Bukayo Saka": 5.00, "Noni Madueke": 5.00,
      "Declan Rice": 9.00, "Nico O''Reilly": 10.00, "Elliot Anderson": 11.00,
      "Reece James": 12.00, "Djed Spence": 14.00, "Ezri Konsa": 15.00,
      "John Stones": 18.00, "Marc Guehi": 18.00,
      "Lionel Messi": 2.30, "Julian Alvarez": 3.30, "Enzo Fernandez": 6.50,
      "Leandro Paredes": 8.00, "Alexis Mac Allister": 8.50,
      "Rodrigo De Paul": 11.00, "Nicolas Tagliafico": 12.00,
      "Cristian Romero": 14.00, "Nahuel Molina": 15.00, "Lisandro Martinez": 17.00
    }'::jsonb),
    ('ARG|ESP', '{
      "Lionel Messi": 2.40, "Lautaro Martinez": 3.60, "Julian Alvarez": 3.60,
      "Giuliano Simeone": 6.50, "Nico Gonzalez": 6.50, "Enzo Fernandez": 7.00,
      "Leandro Paredes": 8.50, "Alexis Mac Allister": 9.50, "Gonzalo Montiel": 12.00,
      "Rodrigo De Paul": 12.00, "Nicolas Tagliafico": 13.00, "Cristian Romero": 15.00,
      "Nahuel Molina": 17.00, "Nicolas Otamendi": 17.00, "Lisandro Martinez": 18.00,
      "Mikel Oyarzabal": 2.60, "Ferran Torres": 3.60, "Lamine Yamal": 3.30,
      "Nico Williams": 4.00, "Dani Olmo": 4.50, "Mikel Merino": 4.50,
      "Alex Baena": 5.50, "Fabian Ruiz": 6.50, "Pedri": 9.50, "Rodri": 9.50,
      "Martin Zubimendi": 10.00, "Pedro Porro": 11.00, "Marc Cucurella": 13.00,
      "Aymeric Laporte": 17.00, "Pau Cubarsi": 17.00
    }'::jsonb),
    ('ENG|FRA', '{
      "Kylian Mbappe": 1.67, "Jean-Philippe Mateta": 2.30, "Marcus Thuram": 2.37,
      "Ousmane Dembele": 2.60, "Michael Olise": 3.00, "Desire Doue": 3.10,
      "Bradley Barcola": 3.20, "Rayan Cherki": 3.40, "Maghnes Akliouche": 3.75,
      "Adrien Rabiot": 5.50, "Warren Zaire-Emery": 6.00, "Theo Hernandez": 7.50,
      "Manu Kone": 8.00, "Maxence Lacroix": 8.00, "N''Golo Kante": 8.00,
      "Aurelien Tchouameni": 9.50, "Malo Gusto": 9.50, "Dayot Upamecano": 11.00,
      "Lucas Digne": 11.00, "Ibrahima Konate": 12.00, "Jules Kounde": 12.00,
      "William Saliba": 12.00, "Lucas Hernandez": 15.00,
      "Harry Kane": 2.10, "Ivan Toney": 2.70, "Ollie Watkins": 2.75,
      "Jude Bellingham": 3.30, "Marcus Rashford": 4.20, "Anthony Gordon": 4.33,
      "Bukayo Saka": 4.50, "Eberechi Eze": 4.50, "Noni Madueke": 4.50,
      "Morgan Rogers": 5.00, "Declan Rice": 8.00, "Nico O''Reilly": 8.50,
      "Elliot Anderson": 9.50, "Kobbie Mainoo": 10.00, "Dan Burn": 11.00,
      "Jarell Quansah": 11.00, "Reece James": 11.00, "Trevoh Chalobah": 12.00,
      "Djed Spence": 13.00, "Ezri Konsa": 14.00, "John Stones": 15.00,
      "Marc Guehi": 15.00
    }'::jsonb)
  ) AS pair(key, odds)
  WHERE bm.market_type = 'anytime_scorer'
    AND bm.odds_json IS NULL
    AND bm.home_code IS NOT NULL AND bm.away_code IS NOT NULL
    AND pair.key = (SELECT string_agg(c, '|' ORDER BY c) FROM unnest(ARRAY[bm.home_code, bm.away_code]) AS c);
$$;

-- ─── 2. backfill_first_scorer_odds — same self-heal shape as
-- backfill_anytime_scorer_odds above, but for first_scorer. Semi-final
-- first_scorer odds keep coming from the live scrape
-- (firstScorerOddsForFixture), so this table only ever has the final/
-- third-place keys — its WHERE clause naturally no-ops for every other match.
CREATE OR REPLACE FUNCTION backfill_first_scorer_odds() RETURNS void LANGUAGE sql AS $$
  UPDATE bet_markets bm
  SET odds_json = pair.odds, odds_fetched_at = NOW()
  FROM (VALUES
    ('ARG|ESP', '{
      "Lionel Messi": 4.50, "Lautaro Martinez": 6.50, "Julian Alvarez": 6.50,
      "Giuliano Simeone": 12.00, "Nico Gonzalez": 12.00, "Enzo Fernandez": 13.00,
      "Leandro Paredes": 15.00, "Alexis Mac Allister": 17.00, "Gonzalo Montiel": 23.00,
      "Rodrigo De Paul": 23.00, "Cristian Romero": 26.00, "Nicolas Tagliafico": 26.00,
      "Nahuel Molina": 34.00, "Nicolas Otamendi": 34.00, "Lisandro Martinez": 36.00,
      "Mikel Oyarzabal": 4.50, "Ferran Torres": 6.00, "Lamine Yamal": 6.00,
      "Nico Williams": 7.00, "Dani Olmo": 8.00, "Mikel Merino": 8.00,
      "Alex Baena": 10.00, "Fabian Ruiz": 11.00, "Rodri": 17.00,
      "Martin Zubimendi": 18.00, "Pedri": 18.00, "Pedro Porro": 21.00,
      "Marc Cucurella": 23.00, "Aymeric Laporte": 31.00, "Pau Cubarsi": 31.00
    }'::jsonb),
    ('ENG|FRA', '{
      "Kylian Mbappe": 3.60, "Jean-Philippe Mateta": 5.00, "Marcus Thuram": 5.00,
      "Ousmane Dembele": 6.00, "Michael Olise": 7.00, "Bradley Barcola": 7.50,
      "Desire Doue": 7.50, "Rayan Cherki": 7.50, "Maghnes Akliouche": 8.50,
      "Adrien Rabiot": 13.00, "Warren Zaire-Emery": 14.00, "Maxence Lacroix": 18.00,
      "Manu Kone": 19.00, "N''Golo Kante": 19.00, "Theo Hernandez": 19.00,
      "Aurelien Tchouameni": 23.00, "Dayot Upamecano": 23.00, "Malo Gusto": 23.00,
      "Lucas Digne": 26.00, "Ibrahima Konate": 31.00, "Jules Kounde": 31.00,
      "William Saliba": 31.00, "Lucas Hernandez": 36.00,
      "Harry Kane": 5.00, "Ivan Toney": 6.00, "Ollie Watkins": 6.50,
      "Jude Bellingham": 7.50, "Anthony Gordon": 10.00, "Marcus Rashford": 10.00,
      "Bukayo Saka": 11.00, "Eberechi Eze": 11.00, "Morgan Rogers": 11.00,
      "Noni Madueke": 11.00, "Declan Rice": 20.00, "Nico O''Reilly": 21.00,
      "Elliot Anderson": 23.00, "Kobbie Mainoo": 23.00, "Dan Burn": 26.00,
      "Jarell Quansah": 26.00, "Reece James": 26.00, "Djed Spence": 31.00,
      "Trevoh Chalobah": 31.00, "Ezri Konsa": 41.00, "John Stones": 41.00,
      "Marc Guehi": 41.00
    }'::jsonb)
  ) AS pair(key, odds)
  WHERE bm.market_type = 'first_scorer'
    AND bm.odds_json IS NULL
    AND bm.home_code IS NOT NULL AND bm.away_code IS NOT NULL
    AND pair.key = (SELECT string_agg(c, '|' ORDER BY c) FROM unnest(ARRAY[bm.home_code, bm.away_code]) AS c);
$$;

-- ─── 3. place_parlay — copy of the current version
-- (supabase/relax-parlay-scorer-conflicts.sql) with one more correlated-legs
-- clause: btts is fully determined by correct_score (same reasoning already
-- applied to over_under below), so block that combo too. over_under_cards/
-- total_corners are independent stats (not derivable from goals/
-- correct_score/match_result), so no new clause needed for them.
CREATE OR REPLACE FUNCTION place_parlay(
  p_participant_id UUID,
  p_legs           JSONB,
  p_stake          INT,
  p_total_odds     NUMERIC
) RETURNS parlay_bets LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_leg        JSONB;
  v_market     bet_markets;
  v_balance    INT;
  v_parlay     parlay_bets;
  v_parlay_id  UUID;
  v_tid        UUID;
BEGIN
  IF jsonb_array_length(p_legs) < 2 THEN
    RAISE EXCEPTION 'parlay_too_few_legs';
  END IF;

  -- Validate all legs (with row locks) before touching money
  FOR v_leg IN SELECT * FROM jsonb_array_elements(p_legs) LOOP
    SELECT * INTO v_market FROM bet_markets
    WHERE id = (v_leg->>'market_id')::UUID FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'market_not_found'; END IF;
    IF v_market.locked           THEN RAISE EXCEPTION 'market_locked'; END IF;
    IF v_market.status <> 'open' THEN RAISE EXCEPTION 'market_closed'; END IF;
    IF v_market.close_time IS NOT NULL AND NOW() >= v_market.close_time THEN
      UPDATE bet_markets SET status = 'closed' WHERE id = v_market.id;
      RAISE EXCEPTION 'market_closed';
    END IF;
    IF v_tid IS NULL THEN v_tid := v_market.tournament_id; END IF;
  END LOOP;

  -- Reject a parlay with two legs on the exact same market (bypasses the
  -- client's per-market dedup, but the DB is the authoritative check).
  IF EXISTS (
    SELECT market_id FROM (
      SELECT (leg->>'market_id')::UUID AS market_id
      FROM jsonb_array_elements(p_legs) AS leg
    ) s GROUP BY market_id HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'parlay_duplicate_leg';
  END IF;

  -- Reject a parlay that combines correlated/redundant markets on the same
  -- match -- see file header for the reasoning behind each clause.
  IF EXISTS (
    SELECT 1 FROM (
      SELECT bm.match_no, bm.market_type
      FROM jsonb_array_elements(p_legs) AS leg
      JOIN bet_markets bm ON bm.id = (leg->>'market_id')::UUID
    ) sub
    GROUP BY match_no
    HAVING (
      COUNT(DISTINCT market_type) FILTER (
        WHERE market_type IN ('match_result', 'correct_score', 'double_chance', 'qualify')
      ) > 1
      OR (bool_or(market_type = 'correct_score') AND bool_or(market_type = 'over_under'))
      OR (bool_or(market_type = 'correct_score') AND bool_or(market_type = 'btts'))
      OR (bool_or(market_type = 'first_scorer') AND bool_or(market_type = 'anytime_scorer'))
    )
  ) THEN
    RAISE EXCEPTION 'parlay_correlated_legs';
  END IF;

  -- Balance check + single deduction for the whole parlay
  SELECT coin_balance INTO v_balance FROM participants
  WHERE id = p_participant_id FOR UPDATE;
  IF v_balance < p_stake THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
  UPDATE participants SET coin_balance = coin_balance - p_stake
  WHERE id = p_participant_id;

  -- Insert parlay header
  INSERT INTO parlay_bets(tournament_id, participant_id, stake, total_odds)
  VALUES (v_tid, p_participant_id, p_stake, p_total_odds)
  RETURNING * INTO v_parlay;
  v_parlay_id := v_parlay.id;

  -- Insert legs
  FOR v_leg IN SELECT * FROM jsonb_array_elements(p_legs) LOOP
    INSERT INTO parlay_bet_legs(parlay_id, tournament_id, market_id, selection, odds)
    VALUES (
      v_parlay_id,
      v_tid,
      (v_leg->>'market_id')::UUID,
      v_leg->>'selection',
      (v_leg->>'odds')::NUMERIC
    );
  END LOOP;

  RETURN v_parlay;
END; $$;

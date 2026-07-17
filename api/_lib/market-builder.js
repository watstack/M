// Shared market row builder for api/markets.js and scripts/scrape-odds.cjs.
// Covers match_result, correct_score, double_chance, qualify (knockout only),
// and first_scorer + over_under + anytime_scorer + btts + over_under_cards +
// total_corners (semi-final, third-place and final only — see
// EXTRA_MARKET_STAGES).
// Applies commenceTimeForFixture correction from odds events when provided.
// Calls h2hOddsForFixture once per fixture (reused for both match_result and double_chance).

const { WC2026_FIXTURES, CODE_NAMES } = require('./fixtures');
const { h2hOddsForFixture, codeForName, firstScorerOddsForFixture } = require('./odds-match');

const teamName = code => CODE_NAMES[code] || code;

// ─── Anytime Goalscorer — static, hand-set odds (one-off manual capture from
// a competitor site's screenshots), not scraped. Keyed by sorted team-code
// pair; flat player→decimal-price map, same odds_json shape as first_scorer.
// Eligible for extra time, NOT penalty shootouts (see settle-lib.js allScorers).
// Covers both semi-finals plus the final (ARG v ESP) and third-place playoff
// (ENG v FRA).
const SF_ANYTIME_SCORER_ODDS = {
  'ESP|FRA': { // France v Spain (semi-final)
    'Kylian Mbappe': 2.00, 'Ousmane Dembele': 3.30, 'Michael Olise': 3.75,
    'Bradley Barcola': 4.00, 'Desire Doue': 4.00, 'Adrien Rabiot': 7.00,
    'Manu Kone': 10.00, 'Aurelien Tchouameni': 12.00, 'Lucas Digne': 14.00,
    'Jules Kounde': 15.00, 'William Saliba': 15.00,
    'Mikel Oyarzabal': 2.88, 'Lamine Yamal': 3.30, 'Nico Williams': 4.33,
    'Alex Baena': 5.00, 'Dani Olmo': 5.00, 'Fabian Ruiz': 7.00,
    'Pedri': 10.00, 'Rodri': 10.00, 'Pedro Porro': 12.00,
    'Marc Cucurella': 14.00, 'Aymeric Laporte': 18.00, 'Pau Cubarsi': 18.00,
  },
  'ARG|ENG': { // England v Argentina (semi-final)
    'Harry Kane': 2.30, 'Jude Bellingham': 4.00, 'Marcus Rashford': 4.50,
    'Anthony Gordon': 5.00, 'Bukayo Saka': 5.00, 'Noni Madueke': 5.00,
    'Declan Rice': 9.00, "Nico O'Reilly": 10.00, 'Elliot Anderson': 11.00,
    'Reece James': 12.00, 'Djed Spence': 14.00, 'Ezri Konsa': 15.00,
    'John Stones': 18.00, 'Marc Guehi': 18.00,
    'Lionel Messi': 2.30, 'Julian Alvarez': 3.30, 'Enzo Fernandez': 6.50,
    'Leandro Paredes': 8.00, 'Alexis Mac Allister': 8.50,
    'Rodrigo De Paul': 11.00, 'Nicolas Tagliafico': 12.00,
    'Cristian Romero': 14.00, 'Nahuel Molina': 15.00, 'Lisandro Martinez': 17.00,
  },
  'ARG|ESP': { // Spain v Argentina (final)
    'Lionel Messi': 2.40, 'Lautaro Martinez': 3.60, 'Julian Alvarez': 3.60,
    'Giuliano Simeone': 6.50, 'Nico Gonzalez': 6.50, 'Enzo Fernandez': 7.00,
    'Leandro Paredes': 8.50, 'Alexis Mac Allister': 9.50, 'Gonzalo Montiel': 12.00,
    'Rodrigo De Paul': 12.00, 'Nicolas Tagliafico': 13.00, 'Cristian Romero': 15.00,
    'Nahuel Molina': 17.00, 'Nicolas Otamendi': 17.00, 'Lisandro Martinez': 18.00,
    'Mikel Oyarzabal': 2.60, 'Ferran Torres': 3.60, 'Lamine Yamal': 3.30,
    'Nico Williams': 4.00, 'Dani Olmo': 4.50, 'Mikel Merino': 4.50,
    'Alex Baena': 5.50, 'Fabian Ruiz': 6.50, 'Pedri': 9.50, 'Rodri': 9.50,
    'Martin Zubimendi': 10.00, 'Pedro Porro': 11.00, 'Marc Cucurella': 13.00,
    'Aymeric Laporte': 17.00, 'Pau Cubarsi': 17.00,
  },
  'ENG|FRA': { // France v England (third-place playoff)
    'Kylian Mbappe': 1.67, 'Jean-Philippe Mateta': 2.30, 'Marcus Thuram': 2.37,
    'Ousmane Dembele': 2.60, 'Michael Olise': 3.00, 'Desire Doue': 3.10,
    'Bradley Barcola': 3.20, 'Rayan Cherki': 3.40, 'Maghnes Akliouche': 3.75,
    'Adrien Rabiot': 5.50, 'Warren Zaire-Emery': 6.00, 'Theo Hernandez': 7.50,
    'Manu Kone': 8.00, 'Maxence Lacroix': 8.00, "N'Golo Kante": 8.00,
    'Aurelien Tchouameni': 9.50, 'Malo Gusto': 9.50, 'Dayot Upamecano': 11.00,
    'Lucas Digne': 11.00, 'Ibrahima Konate': 12.00, 'Jules Kounde': 12.00,
    'William Saliba': 12.00, 'Lucas Hernandez': 15.00,
    'Harry Kane': 2.10, 'Ivan Toney': 2.70, 'Ollie Watkins': 2.75,
    'Jude Bellingham': 3.30, 'Marcus Rashford': 4.20, 'Anthony Gordon': 4.33,
    'Bukayo Saka': 4.50, 'Eberechi Eze': 4.50, 'Noni Madueke': 4.50,
    'Morgan Rogers': 5.00, 'Declan Rice': 8.00, "Nico O'Reilly": 8.50,
    'Elliot Anderson': 9.50, 'Kobbie Mainoo': 10.00, 'Dan Burn': 11.00,
    'Jarell Quansah': 11.00, 'Reece James': 11.00, 'Trevoh Chalobah': 12.00,
    'Djed Spence': 13.00, 'Ezri Konsa': 14.00, 'John Stones': 15.00,
    'Marc Guehi': 15.00,
  },
};

function sfAnytimeScorerOdds(homeCode, awayCode) {
  if (!homeCode || !awayCode) return null;
  return SF_ANYTIME_SCORER_ODDS[[homeCode, awayCode].sort().join('|')] || null;
}

// ─── First Goalscorer for the final/third-place playoff — static, hand-set
// odds (same one-off manual-capture reasoning as SF_ANYTIME_SCORER_ODDS
// above). Semi-final first_scorer odds keep coming from the live scrape
// (firstScorerOddsForFixture) — this table only ever covers ARG|ESP/ENG|FRA.
const STATIC_FIRST_SCORER_ODDS = {
  'ARG|ESP': { // Spain v Argentina (final)
    'Lionel Messi': 4.50, 'Lautaro Martinez': 6.50, 'Julian Alvarez': 6.50,
    'Giuliano Simeone': 12.00, 'Nico Gonzalez': 12.00, 'Enzo Fernandez': 13.00,
    'Leandro Paredes': 15.00, 'Alexis Mac Allister': 17.00, 'Gonzalo Montiel': 23.00,
    'Rodrigo De Paul': 23.00, 'Cristian Romero': 26.00, 'Nicolas Tagliafico': 26.00,
    'Nahuel Molina': 34.00, 'Nicolas Otamendi': 34.00, 'Lisandro Martinez': 36.00,
    'Mikel Oyarzabal': 4.50, 'Ferran Torres': 6.00, 'Lamine Yamal': 6.00,
    'Nico Williams': 7.00, 'Dani Olmo': 8.00, 'Mikel Merino': 8.00,
    'Alex Baena': 10.00, 'Fabian Ruiz': 11.00, 'Rodri': 17.00,
    'Martin Zubimendi': 18.00, 'Pedri': 18.00, 'Pedro Porro': 21.00,
    'Marc Cucurella': 23.00, 'Aymeric Laporte': 31.00, 'Pau Cubarsi': 31.00,
  },
  'ENG|FRA': { // France v England (third-place playoff)
    'Kylian Mbappe': 3.60, 'Jean-Philippe Mateta': 5.00, 'Marcus Thuram': 5.00,
    'Ousmane Dembele': 6.00, 'Michael Olise': 7.00, 'Bradley Barcola': 7.50,
    'Desire Doue': 7.50, 'Rayan Cherki': 7.50, 'Maghnes Akliouche': 8.50,
    'Adrien Rabiot': 13.00, 'Warren Zaire-Emery': 14.00, 'Maxence Lacroix': 18.00,
    'Manu Kone': 19.00, "N'Golo Kante": 19.00, 'Theo Hernandez': 19.00,
    'Aurelien Tchouameni': 23.00, 'Dayot Upamecano': 23.00, 'Malo Gusto': 23.00,
    'Lucas Digne': 26.00, 'Ibrahima Konate': 31.00, 'Jules Kounde': 31.00,
    'William Saliba': 31.00, 'Lucas Hernandez': 36.00,
    'Harry Kane': 5.00, 'Ivan Toney': 6.00, 'Ollie Watkins': 6.50,
    'Jude Bellingham': 7.50, 'Anthony Gordon': 10.00, 'Marcus Rashford': 10.00,
    'Bukayo Saka': 11.00, 'Eberechi Eze': 11.00, 'Morgan Rogers': 11.00,
    'Noni Madueke': 11.00, 'Declan Rice': 20.00, "Nico O'Reilly": 21.00,
    'Elliot Anderson': 23.00, 'Kobbie Mainoo': 23.00, 'Dan Burn': 26.00,
    'Jarell Quansah': 26.00, 'Reece James': 26.00, 'Djed Spence': 31.00,
    'Trevoh Chalobah': 31.00, 'Ezri Konsa': 41.00, 'John Stones': 41.00,
    'Marc Guehi': 41.00,
  },
};

function staticFirstScorerOdds(homeCode, awayCode) {
  if (!homeCode || !awayCode) return null;
  return STATIC_FIRST_SCORER_ODDS[[homeCode, awayCode].sort().join('|')] || null;
}

// ─── Match result / double chance / qualify — static fallback for the final
// and third-place playoff. The live odds source (api/_lib/odds-source.js,
// scraping Oddschecker) has been returning 403s for every fixture — not
// specific to these two matches — so these two singleton, high-profile
// matches get a one-off hand-set snapshot (from a competitor site) to fall
// back on when the scrape has nothing, same reasoning as the tables above.
// Unlike those tables (keyed by sorted pair, reusable across either SF slot),
// these are each a single fixed match, so keyed by exact `${home}|${away}` —
// orientation matters here (draw/qualify home vs away aren't symmetric).
const STATIC_MATCH_RESULT_ODDS = {
  'ESP|ARG': { home: 2.25, draw: 3.00, away: 3.60 }, // Final: Spain (h) v Argentina (a)
  'FRA|ENG': { home: 1.85, draw: 3.90, away: 3.90 }, // Third-place: France (h) v England (a)
};

function staticMatchResultOdds(homeCode, awayCode) {
  if (!homeCode || !awayCode) return null;
  return STATIC_MATCH_RESULT_ODDS[`${homeCode}|${awayCode}`] || null;
}

const STATIC_DOUBLE_CHANCE_ODDS = {
  'ESP|ARG': { '1x': 1.26, 'x2': 1.62, '12': 1.37 }, // Final
  'FRA|ENG': { '1x': 1.23, 'x2': 1.97, '12': 1.22 }, // Third-place
};

function staticDoubleChanceOdds(homeCode, awayCode) {
  if (!homeCode || !awayCode) return null;
  return STATIC_DOUBLE_CHANCE_ODDS[`${homeCode}|${awayCode}`] || null;
}

// "Qualify" market, labeled "To Lift the Cup" (final) / "To Finish Third"
// (third-place) client-side (see js/betting.js) instead of "To Qualify" —
// same market shape (decisive result incl. ET/pens), different display copy.
const STATIC_QUALIFY_ODDS = {
  'ESP|ARG': { home: 1.64, away: 2.26 }, // To Lift the Cup: Spain / Argentina
  'FRA|ENG': { home: 1.42, away: 2.72 }, // To Finish Third: France / England
};

function staticQualifyOdds(homeCode, awayCode) {
  if (!homeCode || !awayCode) return null;
  return STATIC_QUALIFY_ODDS[`${homeCode}|${awayCode}`] || null;
}

// Stages that get the "extra" markets beyond match_result/correct_score/
// double_chance/qualify: first_scorer, over_under, anytime_scorer, btts,
// over_under_cards, total_corners. Originally semi-final only; the final and
// third-place playoff now have hand-set odds too (see odds tables above and
// the static tables in js/betting.js for over_under/btts/cards/corners).
const EXTRA_MARKET_STAGES = new Set(['sf', 'third', 'final']);

// Knockout stages that get a "decisive result" market beyond plain
// match_result (who advances / lifts the cup / finishes third, regardless of
// ET/pens). Labeled "To Qualify" for r32/r16/qf/sf, "To Lift the Cup" for the
// final, "To Finish Third" for the third-place playoff — see js/betting.js.
const KO_QUALIFY_STAGES = new Set(['r32', 'r16', 'qf', 'sf', 'third', 'final']);

function matchNameFor(fx) {
  const h = fx.home.code ? teamName(fx.home.code) : fx.home.label;
  const a = fx.away.code ? teamName(fx.away.code) : fx.away.label;
  return `${h} vs ${a}`;
}

function calcDcOdds({ home, draw, away }) {
  const hp = 1 / home, dp = 1 / draw, ap = 1 / away;
  const r = v => Math.round(v * 100) / 100;
  return { '1x': r(1 / (hp + dp)), 'x2': r(1 / (dp + ap)), '12': r(1 / (hp + ap)) };
}

// Standard Draw No Bet conversion: derive "to qualify" odds from h2h.
// draw must be non-null. Formula: qual = (side * draw) / (side + draw - 1)
function calcQualifyOdds({ home, draw, away }) {
  if (draw == null) return null;
  const r = v => Math.round(v * 100) / 100;
  return {
    home: r((home * draw) / (home + draw - 1)),
    away: r((away * draw) / (away + draw - 1)),
  };
}

// Resolve the authoritative kickoff time from the Odds API event list.
function commenceTimeForFixture(events, fx) {
  const fHome = fx && fx.home && fx.home.code;
  const fAway = fx && fx.away && fx.away.code;
  if (!fHome || !fAway || !Array.isArray(events)) return null;
  for (const ev of events) {
    const evHome = codeForName(ev.home_team);
    const evAway = codeForName(ev.away_team);
    if (!evHome || !evAway) continue;
    if ((evHome === fHome && evAway === fAway) || (evHome === fAway && evAway === fHome)) {
      return ev.commence_time || null;
    }
  }
  return null;
}

/**
 * Build market rows for all 104 WC2026 fixtures.
 *
 * @param {string}      tournamentId
 * @param {Array|null}  h2hEvents     h2h odds events, or null/[] to skip odds
 * @param {Array|null}  scorerEvents  first-goalscorer odds events, or null/[] to skip
 * @param {string|null} fetchedAt     ISO timestamp for odds_fetched_at
 * @returns {{ groupRows: object[], koRows: object[], oddsMatched: number }}
 *
 * groupRows: resolved fixtures — merge-upsert so odds refresh
 * koRows:    unresolved knockout slots — insert-once so team resolution is never clobbered
 *
 * IMPORTANT: PostgREST requires uniform key sets per batch. Callers must split
 * groupRows into withOdds / noOdds before upserting (see api/markets.js).
 */
function buildMarketRows(tournamentId, h2hEvents, scorerEvents, fetchedAt) {
  const groupRows = [];
  const koRows = [];
  let oddsMatched = 0;

  for (const fx of WC2026_FIXTURES) {
    const resolved = !!(fx.home.code && fx.away.code);
    const base = {
      tournament_id: tournamentId,
      match_no: fx.match_no,
      stage: fx.stage,
      match_name: matchNameFor(fx),
      kickoff_time: fx.kickoff_utc,
      close_time: fx.kickoff_utc,
      locked: !resolved,
    };

    if (resolved) {
      base.home_code = fx.home.code;
      base.away_code = fx.away.code;

      // Correct kickoff/close from the live Odds API feed when available.
      const commence = commenceTimeForFixture(h2hEvents, fx);
      if (commence) { base.kickoff_time = commence; base.close_time = commence; }

      // Call h2hOddsForFixture once and reuse for both match_result and double_chance.
      // Falls back to a hand-set snapshot for the final/third-place playoff
      // when the live scrape has nothing for this fixture (see
      // STATIC_MATCH_RESULT_ODDS above) — live odds still take priority when
      // available, so this self-heals to real prices the moment the scrape
      // recovers.
      const liveOdds = Array.isArray(h2hEvents) ? h2hOddsForFixture(h2hEvents, fx) : null;
      const odds = liveOdds || staticMatchResultOdds(fx.home.code, fx.away.code);

      const mr = { ...base, market_type: 'match_result' };
      if (odds) {
        mr.odds_json = odds;
        mr.odds_fetched_at = fetchedAt;
        oddsMatched++;
      }
      groupRows.push(mr);

      groupRows.push({ ...base, market_type: 'correct_score' });

      const dc = { ...base, market_type: 'double_chance' };
      const staticDc = staticDoubleChanceOdds(fx.home.code, fx.away.code);
      if (liveOdds && liveOdds.draw !== null) {
        dc.odds_json = calcDcOdds(liveOdds);
        dc.odds_fetched_at = fetchedAt;
      } else if (staticDc) {
        // Prefer the exact captured snapshot over deriving from the static
        // match_result odds — bookmaker double-chance prices aren't a pure
        // formula of their own 1X2 line, so the derived value would drift
        // from what's actually being offered.
        dc.odds_json = staticDc;
        dc.odds_fetched_at = fetchedAt;
      }
      groupRows.push(dc);

      if (KO_QUALIFY_STAGES.has(fx.stage)) {
        const qm = { ...base, market_type: 'qualify' };
        const staticQual = staticQualifyOdds(fx.home.code, fx.away.code);
        if (staticQual) {
          qm.odds_json = staticQual;
          qm.odds_fetched_at = fetchedAt;
        } else if (odds && odds.draw !== null) {
          qm.odds_json = calcQualifyOdds(odds);
          qm.odds_fetched_at = fetchedAt;
        }
        groupRows.push(qm);
      }

      if (EXTRA_MARKET_STAGES.has(fx.stage)) {
        const fsRow = { ...base, market_type: 'first_scorer' };
        const scorerOdds = fx.stage === 'sf'
          ? (Array.isArray(scorerEvents) ? firstScorerOddsForFixture(scorerEvents, fx) : null)
          : staticFirstScorerOdds(fx.home.code, fx.away.code);
        if (scorerOdds && Object.keys(scorerOdds).length) {
          fsRow.odds_json = scorerOdds;
          fsRow.odds_fetched_at = fetchedAt;
        }
        groupRows.push(fsRow);

        // Odds are static (client-side SF_OVER_UNDER_ODDS/STATIC_BTTS_ODDS/
        // STATIC_OU_CARDS_ODDS/STATIC_CORNERS_ODDS in betting.js), same
        // shape as correct_score — no odds_json computed here.
        groupRows.push({ ...base, market_type: 'over_under' });
        groupRows.push({ ...base, market_type: 'btts' });
        groupRows.push({ ...base, market_type: 'over_under_cards' });
        groupRows.push({ ...base, market_type: 'total_corners' });

        const asRow = { ...base, market_type: 'anytime_scorer' };
        const anytimeOdds = sfAnytimeScorerOdds(fx.home.code, fx.away.code);
        if (anytimeOdds) {
          asRow.odds_json = anytimeOdds;
          asRow.odds_fetched_at = fetchedAt;
        }
        groupRows.push(asRow);
      }
    } else {
      koRows.push({ ...base, market_type: 'match_result' });
      koRows.push({ ...base, market_type: 'correct_score' });
      koRows.push({ ...base, market_type: 'double_chance' });
      if (KO_QUALIFY_STAGES.has(fx.stage)) {
        koRows.push({ ...base, market_type: 'qualify' });
      }
      if (EXTRA_MARKET_STAGES.has(fx.stage)) {
        koRows.push({ ...base, market_type: 'first_scorer' });
        koRows.push({ ...base, market_type: 'over_under' });
        koRows.push({ ...base, market_type: 'anytime_scorer' });
        koRows.push({ ...base, market_type: 'btts' });
        koRows.push({ ...base, market_type: 'over_under_cards' });
        koRows.push({ ...base, market_type: 'total_corners' });
      }
    }
  }

  return { groupRows, koRows, oddsMatched };
}

module.exports = {
  buildMarketRows, matchNameFor, commenceTimeForFixture, calcDcOdds, calcQualifyOdds,
  sfAnytimeScorerOdds, staticFirstScorerOdds,
  staticMatchResultOdds, staticDoubleChanceOdds, staticQualifyOdds,
};

// Shared market row builder for api/markets.js and scripts/refresh-odds.cjs.
// Covers all 3 market types: match_result, correct_score, double_chance.
// Applies commenceTimeForFixture correction from Odds API when events are provided.
// Calls h2hOddsForFixture once per fixture (reused for both match_result and double_chance).

const { WC2026_FIXTURES, CODE_NAMES } = require('./fixtures');
const { h2hOddsForFixture, codeForName } = require('./odds-match');

const teamName = code => CODE_NAMES[code] || code;

// Knockout stages that get a qualify market (who advances, regardless of ET/pens).
// third and final are excluded — no team "qualifies" further from those.
const KO_QUALIFY_STAGES = new Set(['r32', 'r16', 'qf', 'sf']);

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
 * @param {string}     tournamentId
 * @param {Array|null} h2hEvents   Odds API h2h events, or null/[] to skip odds
 * @param {string|null} fetchedAt  ISO timestamp for odds_fetched_at
 * @returns {{ groupRows: object[], koRows: object[], oddsMatched: number }}
 *
 * groupRows: resolved fixtures — merge-upsert so odds refresh
 * koRows:    unresolved knockout slots — insert-once so team resolution is never clobbered
 *
 * IMPORTANT: PostgREST requires uniform key sets per batch. Callers must split
 * groupRows into withOdds / noOdds before upserting (see api/markets.js).
 */
function buildMarketRows(tournamentId, h2hEvents, fetchedAt) {
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
      const odds = Array.isArray(h2hEvents) ? h2hOddsForFixture(h2hEvents, fx) : null;

      const mr = { ...base, market_type: 'match_result' };
      if (odds) {
        mr.odds_json = odds;
        mr.odds_fetched_at = fetchedAt;
        oddsMatched++;
      }
      groupRows.push(mr);

      groupRows.push({ ...base, market_type: 'correct_score' });

      const dc = { ...base, market_type: 'double_chance' };
      if (odds && odds.draw !== null) {
        dc.odds_json = calcDcOdds(odds);
        dc.odds_fetched_at = fetchedAt;
      }
      groupRows.push(dc);

      if (KO_QUALIFY_STAGES.has(fx.stage)) {
        const qm = { ...base, market_type: 'qualify' };
        if (odds && odds.draw !== null) {
          qm.odds_json = calcQualifyOdds(odds);
          qm.odds_fetched_at = fetchedAt;
        }
        groupRows.push(qm);
      }
    } else {
      koRows.push({ ...base, market_type: 'match_result' });
      koRows.push({ ...base, market_type: 'correct_score' });
      koRows.push({ ...base, market_type: 'double_chance' });
      if (KO_QUALIFY_STAGES.has(fx.stage)) {
        koRows.push({ ...base, market_type: 'qualify' });
      }
    }
  }

  return { groupRows, koRows, oddsMatched };
}

module.exports = { buildMarketRows, matchNameFor, commenceTimeForFixture, calcDcOdds, calcQualifyOdds };

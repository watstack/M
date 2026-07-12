#!/usr/bin/env node
// One-time first-goalscorer odds calculation for the World Cup 2026 semi-finals,
// computed from real match history instead of a scrape (Oddschecker blocks
// scraper requests outright — see docs/ODDS_SCRAPE.md). Not part of the
// recurring 4-hourly refresh-odds.yml cron: both SF matchups are already set
// and each team's earlier-round history won't change again before kickoff, so
// this only needs to run once (rerun manually via workflow_dispatch later if
// wanted, e.g. once starting lineups are confirmed closer to kickoff).
//
// Run by .github/workflows/compute-scorer-odds.yml (workflow_dispatch only).

const { fetchESPNMatchesForDates } = require('../api/_lib/espn.js');
const {
  tallyFirstScorers,
  teamFirstGoalProbabilities,
  teamFirstGoalProbabilitiesFromAvgGoals,
  buildFirstScorerOdds,
} = require('../api/_lib/scorer-model.js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const SF_MATCH_NOS = [101, 102];
const MARGIN_MULTIPLIER = 1.07; // ~7% bookmaker-style overround

function rest(path, opts = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
}

async function main() {
  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_KEY) missing.push('SUPABASE_SERVICE_KEY');
  if (missing.length) {
    console.error(`Missing required env: ${missing.join(', ')}`);
    process.exit(1);
  }

  // 1. Find the SF fixtures' team codes + already-cached match_result odds
  // (any one tournament's row — they're all fed by the same global scrape).
  const fixtures = [];
  for (const matchNo of SF_MATCH_NOS) {
    const r = await rest(
      `/bet_markets?market_type=eq.match_result&match_no=eq.${matchNo}` +
      `&select=home_code,away_code,odds_json,match_name&limit=1`
    );
    if (!r.ok) throw new Error(`match_result lookup for ${matchNo} failed: ${r.status}`);
    const rows = await r.json();
    if (!rows.length || !rows[0].home_code || !rows[0].away_code) {
      console.warn(`[compute-scorer-odds] match ${matchNo} has no resolved match_result row yet — skipping`);
      continue;
    }
    fixtures.push({ matchNo, ...rows[0] });
  }
  if (!fixtures.length) {
    console.error('[compute-scorer-odds] no resolved SF fixtures found — nothing to compute');
    process.exit(1);
  }

  const teamCodes = [...new Set(fixtures.flatMap(f => [f.home_code, f.away_code]))];
  console.log(`[compute-scorer-odds] fixtures: ${fixtures.map(f => f.match_name).join(', ')}`);
  console.log(`[compute-scorer-odds] teams: ${teamCodes.join(', ')}`);

  // 2. Discover each team's already-finished matches this tournament from
  // wc_matches (real dates, no guessing) — wc_matches.goals is empty (see
  // docs/ODDS_SCRAPE.md), we only need the dates here to target ESPN's fetch.
  const teamFilter = teamCodes.map(c => `home_tla.eq.${c},away_tla.eq.${c}`).join(',');
  const wcRes = await rest(
    `/wc_matches?status=eq.FINISHED&or=(${teamFilter})&select=home_tla,away_tla,home_score,away_score,utc_date`
  );
  if (!wcRes.ok) throw new Error(`wc_matches lookup failed: ${wcRes.status}`);
  const wcMatches = await wcRes.json();
  const dates = [...new Set(wcMatches.map(m => String(m.utc_date).slice(0, 10)))];
  console.log(`[compute-scorer-odds] ${wcMatches.length} finished match(es) for these teams across ${dates.length} date(s)`);

  // 3. Fetch real scorer-level data from ESPN for those specific dates.
  let espnMatches = [];
  try {
    espnMatches = await fetchESPNMatchesForDates(dates);
  } catch (e) {
    console.error('[compute-scorer-odds] ESPN fetch failed:', e.message);
  }
  console.log(`[compute-scorer-odds] ESPN returned ${espnMatches.length} match(es) total`);

  const tallies = tallyFirstScorers(espnMatches, teamCodes);
  for (const code of teamCodes) {
    const t = tallies[code];
    const topFirst = Object.entries(t.firstScorerCounts).sort((a, b) => b[1] - a[1])[0];
    console.log(`[compute-scorer-odds] ${code}: ${t.gamesPlayed} game(s) matched, ${t.goalsScored} goal(s), top first-scorer: ${topFirst ? `${topFirst[0]} (${topFirst[1]})` : 'none'}`);
  }

  // 4. Team-level "scores first" split: prefer real match_result odds
  // (already encodes opponent quality/home advantage), fall back to average
  // goals scored per game from the ESPN tally itself.
  for (const fx of fixtures) {
    const cached = fx.odds_json;
    let teamProbabilities = cached ? teamFirstGoalProbabilities({ home: cached.home, away: cached.away }) : null;
    if (!teamProbabilities) {
      const h = tallies[fx.home_code], a = tallies[fx.away_code];
      const avgHome = h.gamesPlayed > 0 ? h.goalsScored / h.gamesPlayed : 0.01;
      const avgAway = a.gamesPlayed > 0 ? a.goalsScored / a.gamesPlayed : 0.01;
      teamProbabilities = teamFirstGoalProbabilitiesFromAvgGoals(avgHome, avgAway);
      console.log(`[compute-scorer-odds] ${fx.match_name}: no usable match_result odds, using avg-goals fallback (${fx.home_code} ${avgHome.toFixed(2)}/g, ${fx.away_code} ${avgAway.toFixed(2)}/g)`);
    } else {
      console.log(`[compute-scorer-odds] ${fx.match_name}: team split from match_result odds — ${fx.home_code} ${(teamProbabilities.home * 100).toFixed(1)}%, ${fx.away_code} ${(teamProbabilities.away * 100).toFixed(1)}%`);
    }

    const oddsJson = buildFirstScorerOdds({
      homeTally: tallies[fx.home_code],
      awayTally: tallies[fx.away_code],
      teamProbabilities,
      marginMultiplier: MARGIN_MULTIPLIER,
    });
    console.log(`[compute-scorer-odds] ${fx.match_name} first_scorer odds:`, JSON.stringify(oddsJson));

    // 5. Write to every tournament's first_scorer row for this match in one
    // filtered PATCH (rows already exist and are unlocked — see
    // supabase/reconcile-locked-markets.sql).
    const patchRes = await rest(
      `/bet_markets?market_type=eq.first_scorer&match_no=eq.${fx.matchNo}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ odds_json: oddsJson, odds_fetched_at: new Date().toISOString() }),
      }
    );
    if (!patchRes.ok) {
      const body = await patchRes.text().catch(() => '');
      throw new Error(`bet_markets patch for match ${fx.matchNo} failed: ${patchRes.status} ${body}`);
    }
    console.log(`[compute-scorer-odds] wrote odds_json for match_no=${fx.matchNo} across all tournaments`);
  }

  console.log('[compute-scorer-odds] done');
}

main().catch(err => {
  console.error('[compute-scorer-odds] failed:', err.message);
  process.exit(1);
});

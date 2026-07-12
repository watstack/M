#!/usr/bin/env node
// Auto-settle finished WC 2026 matches across all tournaments.
// Runs every hour via .github/workflows/auto-settle.yml.
// Syncs ESPN/FBD match data, then settles any open/closed bet_markets
// for matches finished ≥ 3 hours ago.

const { syncMatchesToSupabase } = require('../api/_lib/sync-matches.js');
const { makeRest, settleMarketRpc, voidMarketRpc, propagateResult, regulationScore, advancingSide, firstScorerName } = require('../api/_lib/settle-lib.js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FBD_TOKEN    = process.env.FOOTBALL_API_TOKEN;

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;


async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[auto-settle] SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
    process.exit(1);
  }

  const rest = makeRest(SUPABASE_URL, SUPABASE_KEY);

  const { synced } = await syncMatchesToSupabase(
    { supaUrl: SUPABASE_URL, supaKey: SUPABASE_KEY },
    FBD_TOKEN || null,
  );
  console.log(`[auto-settle] synced ${synced} matches`);

  const now    = new Date().toISOString();
  const cutoff = new Date(Date.now() - TWO_HOURS_MS).toISOString();
  const [finRes, mkRes] = await Promise.all([
    rest(`/wc_matches?status=eq.FINISHED&utc_date=lt.${cutoff}&select=home_tla,away_tla,home_score,away_score,home_score_reg,away_score_reg,score_duration,goals,home_id,away_id`),
    rest(`/bet_markets?status=in.(open,closed)&close_time=lte.${now}&select=id,tournament_id,match_no,market_type,stage,home_code,away_code`),
  ]);
  if (!finRes.ok) throw new Error(`wc_matches query ${finRes.status}`);
  if (!mkRes.ok)  throw new Error(`bet_markets query ${mkRes.status}`);

  const finished = await finRes.json();
  const markets  = await mkRes.json();
  console.log(`[auto-settle] ${finished.length} finished matches, ${markets.length} unsettled markets`);
  if (!finished.length || !markets.length) return;

  // Index finished matches by "HOME_TLA-AWAY_TLA" for fast lookup.
  const byTeams = new Map(finished.map(m => [`${m.home_tla}-${m.away_tla}`, m]));

  // Group markets by tournament + match so we settle both market types together.
  const groups = new Map();
  for (const m of markets) {
    const key = `${m.tournament_id}:${m.match_no}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }

  let settled = 0, skipped = 0;

  for (const [, group] of groups) {
    const { tournament_id, match_no, stage, home_code, away_code } = group[0];

    // Skip unresolved knockout bracket slots (teams not yet known).
    if (!home_code || !away_code) { skipped++; continue; }

    let wc = byTeams.get(`${home_code}-${away_code}`);
    let swapped = false;
    if (!wc) { wc = byTeams.get(`${away_code}-${home_code}`); swapped = true; }
    if (!wc || wc.home_score == null || wc.away_score == null) { skipped++; continue; }

    // If ESPN has the teams reversed relative to bet_markets, swap results so
    // home/away still refers to the fixture's home/away team.
    const isKnockout = stage && stage !== 'group';
    const reg = regulationScore(wc);
    const regKnown = reg.source !== 'final_score_assumed' || !isKnockout;
    const regHome = swapped ? reg.away : reg.home;
    const regAway = swapped ? reg.home : reg.away;
    const matchResult  = regKnown ? (regHome > regAway ? 'home' : regAway > regHome ? 'away' : 'draw') : null;
    const correctScore = regKnown ? `${regHome}-${regAway}` : null;

    const adv = advancingSide(wc);
    const advSide = adv == null ? null : (swapped ? (adv === 'home' ? 'away' : 'home') : adv);

    for (const market of group) {
      if (market.market_type === 'qualify') {
        if (advSide != null && await settleMarketRpc(rest, market.id, advSide)) settled++;
        else skipped++;
        continue;
      }
      if (market.market_type === 'first_scorer') {
        const scorer = firstScorerName(wc);
        if (scorer != null) {
          if (await settleMarketRpc(rest, market.id, scorer)) settled++; else skipped++;
        } else if (matchResult === 'draw' && correctScore === '0-0') {
          // Genuine scoreless draw — there is definitionally no first scorer.
          await voidMarketRpc(rest, market.id); settled++;
        } else {
          skipped++; // scorer not yet resolved from the data source — retry next run
        }
        continue;
      }
      if (matchResult == null) { skipped++; continue; }
      const result = market.market_type === 'correct_score' ? correctScore : matchResult;
      if (await settleMarketRpc(rest, market.id, result)) settled++;
    }

    // Propagate knockout winner into the bracket, keyed off the final score's
    // advancing side (not the regulation-time result — a knockout match can
    // be a regulation draw with a decisive ET/pens winner). advSide stays
    // null when the final score itself is still level, meaning the shootout
    // hasn't been resolved by ESPN/FBD yet; admin can settle via the existing
    // /api/resolve + /api/settle UI.
    if (isKnockout && advSide != null) {
      const winnerCode = advSide === 'home' ? home_code : away_code;
      const loserCode  = advSide === 'home' ? away_code : home_code;
      await propagateResult(rest, tournament_id, Number(match_no), winnerCode, loserCode);
    }
  }

  console.log(`[auto-settle] settled ${settled} markets, skipped ${skipped} groups`);
}

main().catch(err => { console.error('[auto-settle] fatal:', err.message); process.exit(1); });

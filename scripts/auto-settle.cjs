#!/usr/bin/env node
// Auto-settle finished WC 2026 matches across all tournaments.
// Runs every hour via .github/workflows/auto-settle.yml.
// Syncs ESPN/FBD match data, then settles any open/closed bet_markets
// for matches finished ≥ 3 hours ago.

const { fetchESPNMatches } = require('../api/_lib/espn.js');
const { fetchFBDMatches }  = require('../api/_lib/fbd.js');
const { makeRest, settleMarketRpc, propagateResult } = require('../api/_lib/settle-lib.js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FBD_TOKEN    = process.env.FOOTBALL_API_TOKEN;

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

async function syncMatches(rest) {
  let matches = [];
  if (FBD_TOKEN) matches = await fetchFBDMatches(FBD_TOKEN);
  if (matches.length === 0) matches = await fetchESPNMatches();
  if (matches.length === 0) return 0;
  const r = await rest('/wc_matches?on_conflict=home_tla,away_tla,utc_date', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(matches),
  });
  if (!r.ok) throw new Error(`wc_matches upsert ${r.status}: ${await r.text().catch(() => '')}`);
  return matches.length;
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[auto-settle] SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
    process.exit(1);
  }

  const rest = makeRest(SUPABASE_URL, SUPABASE_KEY);

  const synced = await syncMatches(rest);
  console.log(`[auto-settle] synced ${synced} matches`);

  const now    = new Date().toISOString();
  const cutoff = new Date(Date.now() - TWO_HOURS_MS).toISOString();
  const [finRes, mkRes] = await Promise.all([
    rest(`/wc_matches?status=eq.FINISHED&utc_date=lt.${cutoff}&select=home_tla,away_tla,home_score,away_score`),
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

    const wc = byTeams.get(`${home_code}-${away_code}`);
    if (!wc || wc.home_score == null || wc.away_score == null) { skipped++; continue; }

    const h = wc.home_score, a = wc.away_score;
    const matchResult  = h > a ? 'home' : a > h ? 'away' : 'draw';
    const correctScore = `${h}-${a}`;

    for (const market of group) {
      const result = market.market_type === 'correct_score' ? correctScore : matchResult;
      if (await settleMarketRpc(rest, market.id, result)) settled++;
    }

    // Propagate knockout winner into the bracket. Skip draws — that means
    // the match went to penalties and ESPN/FBD hasn't resolved the winner yet;
    // admin can settle via the existing /api/resolve + /api/settle UI.
    const isKnockout = stage && stage !== 'group';
    if (isKnockout && matchResult !== 'draw') {
      const winnerCode = matchResult === 'home' ? home_code : away_code;
      const loserCode  = matchResult === 'home' ? away_code : home_code;
      await propagateResult(rest, tournament_id, Number(match_no), winnerCode, loserCode);
    }
  }

  console.log(`[auto-settle] settled ${settled} markets, skipped ${skipped} groups`);
}

main().catch(err => { console.error('[auto-settle] fatal:', err.message); process.exit(1); });

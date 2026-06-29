#!/usr/bin/env node
// Daily odds refresh for every WC2026 sweepstake tournament.
//
// This is the GitHub Pages stand-in for /api/markets. On Vercel the browser
// POSTs /api/markets on load to seed markets + refresh 1X2 odds; GitHub Pages
// can't execute serverless functions, so that never runs and odds_json stays
// null (every price renders "TBC"). This script does the same work on a daily
// cron instead: it ensures a match_result + correct_score + double_chance market
// exists for all 104 fixtures of every tournament, and overlays fresh 1X2 odds
// from The Odds API. Odds only need a daily refresh, which also fits the free-tier
// quota.
//
// Run by .github/workflows/refresh-odds.yml. Reuses the exact same fixture list
// and odds-matching logic as the serverless handler so odds are identical.

const { buildMarketRows } = require('../api/_lib/market-builder.js');
const { resolveSportKey } = require('../api/_lib/sport-key.js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const ODDS_API_KEY = process.env.ODDS_API_KEY;

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

async function upsert(payload, resolution) {
  const r = await rest(`/bet_markets?on_conflict=tournament_id,market_type,match_no`, {
    method: 'POST',
    headers: { Prefer: `resolution=${resolution},return=minimal` },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`bet_markets upsert ${r.status}: ${body}`);
  }
}

// Fetch the full h2h slate once and reuse it for every tournament — they all
// share the same fixtures, so this is a single upstream call per run.
async function fetchH2HEvents() {
  const sport = await resolveSportKey(ODDS_API_KEY);
  if (!sport) {
    console.warn('[odds] no in-season FIFA World Cup sport found on The Odds API — markets will be scaffolded without odds this run (lines open closer to kickoff)');
    return [];
  }
  console.log(`[odds] using sport key: ${sport}`);
  const params = new URLSearchParams({
    apiKey: ODDS_API_KEY, regions: 'uk', oddsFormat: 'decimal', markets: 'h2h',
  });
  const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?${params}`;
  const r = await fetch(url);
  const remaining = r.headers.get('x-requests-remaining');
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Odds API ${r.status}: ${body}`);
  }
  const events = await r.json();
  if (!Array.isArray(events)) throw new Error(`Odds API returned non-array: ${JSON.stringify(events).slice(0, 200)}`);
  console.log(`[odds] fetched ${events.length} h2h event(s)` + (remaining ? ` — ${remaining} API requests remaining this month` : ''));
  return events;
}

async function main() {
  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_KEY) missing.push('SUPABASE_SERVICE_KEY');
  if (!ODDS_API_KEY) missing.push('ODDS_API_KEY');
  if (missing.length) {
    console.error(`Missing required env: ${missing.join(', ')}`);
    process.exit(1);
  }

  // 1. All tournaments share the same fixtures, so fetch odds once.
  const h2hEvents = await fetchH2HEvents();
  const fetchedAt = new Date().toISOString();

  // 2. Every tournament gets its markets ensured + odds refreshed.
  const tRes = await rest(`/tournaments?select=id,code`);
  if (!tRes.ok) throw new Error(`Tournament list failed: ${tRes.status} ${await tRes.text().catch(() => '')}`);
  const tournaments = await tRes.json();
  console.log(`[markets] ${tournaments.length} tournament(s) to refresh`);

  let totalMatched = 0;
  for (const t of tournaments) {
    const { groupRows, koRows, oddsMatched } = buildMarketRows(t.id, h2hEvents, fetchedAt);
    // PostgREST bulk insert requires every object in an array to share the same
    // key set (error PGRST102), so split group rows by whether they carry odds.
    // Both batches merge (so odds refresh); rows without odds simply omit the
    // odds_json key, so a later run that doesn't match never nulls live odds.
    // Knockout rows insert-once (so a later team resolution is never clobbered).
    // status/result are never sent, so already-settled markets are untouched.
    const withOdds = groupRows.filter(r => 'odds_json' in r);
    const noOdds   = groupRows.filter(r => !('odds_json' in r));
    if (withOdds.length) await upsert(withOdds, 'merge-duplicates');
    if (noOdds.length)   await upsert(noOdds, 'merge-duplicates');
    if (koRows.length)   await upsert(koRows, 'ignore-duplicates');
    totalMatched += oddsMatched;
    console.log(`  ${t.code}: ${groupRows.length + koRows.length} markets, ${oddsMatched} odds matched`);
  }

  console.log(`[done] refreshed ${tournaments.length} tournament(s), ${totalMatched} match_result odds set in total`);
  if (totalMatched === 0) {
    console.warn('[warn] no fixtures matched live odds — The Odds API may not list these matches yet (bookmakers post 1X2 lines closer to kickoff). Markets are scaffolded; odds will fill in on a later run.');
  }
}

main().catch(err => {
  console.error('[refresh-odds] failed:', err.message);
  process.exit(1);
});

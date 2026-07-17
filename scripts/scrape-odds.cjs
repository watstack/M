#!/usr/bin/env node
// Odds refresh for every WC2026 sweepstake tournament, every 4 hours.
//
// This is the GitHub Pages stand-in for /api/markets. On Vercel the browser
// POSTs /api/markets on load, which now only scaffolds market rows and never
// fetches odds itself — odds are 100% owned by this cron script, which writes
// straight to Supabase so both the Vercel deployment and the GitHub Pages
// mirror read the same cached prices. GitHub Pages can't execute serverless
// functions at all, so without this job every price would show "TBC".
//
// Replaces the old The-Odds-API-backed refresh-odds.cjs (that key is no
// longer available) with a lightweight scrape via api/_lib/odds-source.js —
// see docs/ODDS_SCRAPE.md for the live-verification checklist that source
// module still needs.
//
// Run by .github/workflows/refresh-odds.yml. Reuses the exact same fixture
// list and odds-matching logic as the serverless handler so odds are identical.

const { buildMarketRows } = require('../api/_lib/market-builder.js');
const { fetchTeamOdds, fetchFirstScorerOdds } = require('../api/_lib/odds-source.js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

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

// Self-heals market rows for a new market_type that were scaffolded locked
// after their match had already been resolved elsewhere (see
// supabase/reconcile-locked-markets.sql for why this can happen). Cheap,
// idempotent, safe to call every run.
async function reconcileLockedMarkets() {
  const r = await rest('/rpc/reconcile_locked_markets', { method: 'POST' });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    console.warn(`[scrape-odds] reconcile_locked_markets failed: ${r.status} ${body}`);
  }
}

// Self-heals odds_json for the final/third-place playoff's static-odds
// markets (anytime_scorer, first_scorer, match_result, double_chance,
// qualify) once reconcileLockedMarkets() above has unlocked + coded their
// rows. These two matches never look "resolved" to buildMarketRows() itself
// (see api/markets.js for why), so this cron — the only reliable, scheduled
// path, unlike the browser-triggered /api/markets — must call all five
// explicitly on every run. Cheap, idempotent, safe to call every run even
// once fully backfilled (no-ops once odds_json is set).
async function backfillStaticOdds() {
  const fns = [
    'backfill_anytime_scorer_odds', 'backfill_first_scorer_odds',
    'backfill_match_result_odds', 'backfill_double_chance_odds', 'backfill_qualify_odds',
  ];
  for (const fn of fns) {
    const r = await rest(`/rpc/${fn}`, { method: 'POST' });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.warn(`[scrape-odds] ${fn} failed: ${r.status} ${body}`);
    }
  }
}

async function main() {
  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_KEY) missing.push('SUPABASE_SERVICE_KEY');
  if (missing.length) {
    console.error(`Missing required env: ${missing.join(', ')}`);
    process.exit(1);
  }

  await reconcileLockedMarkets();
  await backfillStaticOdds();

  // 1. All tournaments share the same fixtures, so scrape odds once. Each
  // fetch is independently try/caught so a broken scorer-page selector never
  // blocks the team-odds refresh, and vice versa — see api/_lib/odds-source.js.
  let h2hEvents = [];
  let scorerEvents = [];
  try {
    h2hEvents = await fetchTeamOdds();
    console.log(`[odds] scraped ${h2hEvents.length} team-odds event(s)`);
  } catch (e) {
    console.error('[scrape-odds] team odds failed:', e.message);
  }
  try {
    scorerEvents = await fetchFirstScorerOdds();
    console.log(`[odds] scraped ${scorerEvents.length} first-scorer event(s)`);
  } catch (e) {
    console.error('[scrape-odds] scorer odds failed:', e.message);
  }
  const fetchedAt = new Date().toISOString();

  // 2. Every tournament gets its markets ensured + odds refreshed.
  const tRes = await rest(`/tournaments?select=id,code`);
  if (!tRes.ok) throw new Error(`Tournament list failed: ${tRes.status} ${await tRes.text().catch(() => '')}`);
  const tournaments = await tRes.json();
  console.log(`[markets] ${tournaments.length} tournament(s) to refresh`);

  let totalMatched = 0;
  for (const t of tournaments) {
    const { groupRows, koRows, oddsMatched } = buildMarketRows(t.id, h2hEvents, scorerEvents, fetchedAt);
    // PostgREST bulk insert requires every object in an array to share the same
    // key set (error PGRST102), so split group rows by whether they carry odds.
    // Both batches merge (so odds refresh); rows without odds simply omit the
    // odds_json key, so a scrape that doesn't match a fixture this run never
    // nulls out its last-cached price (fail-soft — see odds-source.js).
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
    console.warn('[warn] no fixtures matched scraped odds this run — see docs/ODDS_SCRAPE.md if this persists. Markets are scaffolded; odds will fill in on a later run.');
  }
}

main().catch(err => {
  console.error('[scrape-odds] failed:', err.message);
  process.exit(1);
});

#!/usr/bin/env node
// Daily odds refresh for every WC2026 sweepstake tournament.
//
// This is the GitHub Pages stand-in for /api/markets. On Vercel the browser
// POSTs /api/markets on load to seed markets + refresh 1X2 odds; GitHub Pages
// can't execute serverless functions, so that never runs and odds_json stays
// null (every price renders "TBC"). This script does the same work on a daily
// cron instead: it ensures a match_result + correct_score market exists for all
// 104 fixtures of every tournament, and overlays fresh 1X2 odds from The Odds
// API. Odds only need a daily refresh, which also fits the free-tier quota.
//
// Run by .github/workflows/refresh-odds.yml. Reuses the exact same fixture list
// and odds-matching logic as the serverless handler so odds are identical.

const { WC2026_FIXTURES, CODE_NAMES } = require('../api/_lib/fixtures.js');
const { h2hOddsForFixture, codeForName } = require('../api/_lib/odds-match.js');

// The Odds API only serves "in-season" sports, under keys it controls (the
// World Cup is NOT necessarily `soccer_fifa_world_cup_2026`). Rather than
// hardcode a key that may 404 as "Unknown sport", we discover the live key at
// runtime. An explicit ODDS_SPORT_KEY env var overrides discovery if ever needed.
const SPORT_OVERRIDE = process.env.ODDS_SPORT_KEY || null;

const teamName = code => CODE_NAMES[code] || code;
function matchNameFor(fx) {
  const h = fx.home.code ? teamName(fx.home.code) : fx.home.label;
  const a = fx.away.code ? teamName(fx.away.code) : fx.away.label;
  return `${h} vs ${a}`;
}

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

// Discover the live FIFA World Cup match-odds sport key. The /v4/sports list is
// free (no quota cost). Prefer a World-Cup soccer sport that is NOT an outright
// (has_outrights === false → match/h2h odds, not the tournament-winner market).
async function resolveSportKey() {
  if (SPORT_OVERRIDE) { console.log(`[odds] using ODDS_SPORT_KEY override: ${SPORT_OVERRIDE}`); return SPORT_OVERRIDE; }
  const r = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${ODDS_API_KEY}`);
  if (!r.ok) throw new Error(`Odds API sports list ${r.status}: ${await r.text().catch(() => '')}`);
  const sports = await r.json();
  const soccer = (Array.isArray(sports) ? sports : []).filter(s => /^soccer_/.test(s.key || ''));
  console.log('[odds] in-season soccer sports:', soccer.map(s => s.key).join(', ') || '(none)');
  const isWC = s => /world.?cup/i.test(`${s.key} ${s.title}`);
  const wc = soccer.find(s => isWC(s) && s.has_outrights === false)
         || soccer.find(s => isWC(s) && !/winner|outright/i.test(`${s.key} ${s.title}`))
         || soccer.find(isWC);
  return wc ? wc.key : null;
}

// Fetch the full h2h slate once and reuse it for every tournament — they all
// share the same fixtures, so this is a single upstream call per run.
async function fetchH2HEvents() {
  const sport = await resolveSportKey();
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

// The real kickoff time for a fixture, from the matched Odds API event's
// commence_time (authoritative). The static fixture kickoff times can be wrong,
// which makes the betting page auto-close a market before it has kicked off.
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

// Mirror of /api/markets row-building, for one tournament.
function buildRows(tournamentId, h2hEvents, fetchedAt) {
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
      // Correct kickoff/close from the live feed when we can match this fixture,
      // so the page's auto-close fires at the real kickoff, not a stale time.
      const commence = commenceTimeForFixture(h2hEvents, fx);
      if (commence) { base.kickoff_time = commence; base.close_time = commence; }
      const mr = { ...base, market_type: 'match_result' };
      const odds = h2hOddsForFixture(h2hEvents, fx);
      if (odds) {
        mr.odds_json = odds;
        mr.odds_fetched_at = fetchedAt;
        oddsMatched++;
      }
      groupRows.push(mr);
      groupRows.push({ ...base, market_type: 'correct_score' });
    } else {
      koRows.push({ ...base, market_type: 'match_result' });
      koRows.push({ ...base, market_type: 'correct_score' });
    }
  }

  return { groupRows, koRows, oddsMatched };
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
    const { groupRows, koRows, oddsMatched } = buildRows(t.id, h2hEvents, fetchedAt);
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

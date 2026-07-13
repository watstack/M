// Server-side market scaffolding for a tournament.
//
// The browser POSTs /api/markets?code=XXX on load. This deterministically
// ensures a match_result + correct_score + double_chance (+ qualify for
// knockout, + first_scorer for semi-finals) market exists for every one of
// the 104 static WC2026 fixtures (keyed by match_no — no wc_matches, no fuzzy
// sync).
//
// Odds are NOT fetched here. This is a request/response function, the wrong
// place for a scrape-and-cache job — odds are 100% owned by the
// scripts/scrape-odds.cjs GitHub Actions cron (every 4h), which writes
// straight to Supabase. Both this Vercel deployment and the GitHub Pages
// mirror read whatever odds_json that cron last cached.
//
// Knockout fixtures whose teams aren't resolved yet are created `locked` and
// get no odds.

const { buildMarketRows } = require('./_lib/market-builder');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.end(); return; }

  const code = (req.query.code || '').toUpperCase();
  if (!code) return res.status(400).json({ error: 'Missing code parameter' });

  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supaUrl || !supaKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const rest = (path, opts = {}) => fetch(`${supaUrl}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: supaKey,
      Authorization: `Bearer ${supaKey}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });

  try {
    // 1. Resolve tournament
    const tRes = await rest(`/tournaments?code=eq.${encodeURIComponent(code)}&select=id`);
    if (!tRes.ok) return res.status(502).json({ error: 'Tournament lookup failed' });
    const tourns = await tRes.json();
    if (!tourns.length) return res.status(404).json({ error: 'Tournament not found' });
    const tournamentId = tourns[0].id;

    // 1b. Self-heal any market row for a newer market_type that was scaffolded
    // locked after its match had already been resolved elsewhere in this
    // tournament (see supabase/reconcile-locked-markets.sql). Cheap, idempotent,
    // non-fatal if it hiccups.
    const reconcileRes = await rest('/rpc/reconcile_locked_markets', { method: 'POST' });
    if (!reconcileRes.ok) {
      console.warn(`[markets] reconcile_locked_markets failed: ${reconcileRes.status}`);
    }

    // 1c. Self-heal anytime_scorer's odds_json once its match's teams are
    // known (reconcile_locked_markets above unlocks + codes the row but
    // deliberately never sets odds — see supabase/anytime-scorer-market.sql).
    // Static odds, so no live data needed; cheap, idempotent, non-fatal.
    const backfillRes = await rest('/rpc/backfill_anytime_scorer_odds', { method: 'POST' });
    if (!backfillRes.ok) {
      console.warn(`[markets] backfill_anytime_scorer_odds failed: ${backfillRes.status}`);
    }

    // 2. Build market rows from the static fixture list via shared builder.
    // No odds events passed — this endpoint only scaffolds; the cron owns odds.
    const { groupRows, koRows, oddsMatched } = buildMarketRows(tournamentId, null, null, null);

    // Split for PostgREST uniform-key requirement.
    const withOdds = groupRows.filter(r => 'odds_json' in r);
    const noOdds   = groupRows.filter(r => !('odds_json' in r));
    if (withOdds.length) await upsert(rest, withOdds, 'merge-duplicates');
    if (noOdds.length)   await upsert(rest, noOdds,   'merge-duplicates');
    if (koRows.length)   await upsert(rest, koRows,    'ignore-duplicates');

    return res.status(200).json({
      ok: true,
      fixtures: groupRows.length / 3 + koRows.length / 3,
      markets: groupRows.length + koRows.length,
      oddsMatched,
    });
  } catch (err) {
    console.error('[markets] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

async function upsert(rest, payload, resolution) {
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

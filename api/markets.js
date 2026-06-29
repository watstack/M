// Server-side market creation + 24h odds refresh for a tournament.
//
// The browser POSTs /api/markets?code=XXX on load. This deterministically
// ensures a match_result + correct_score + double_chance market exists for every
// one of the 104 static WC2026 fixtures (keyed by match_no — no wc_matches, no
// fuzzy sync), and refreshes 1X2 odds at most once per 24h.
//
// Knockout fixtures whose teams aren't resolved yet are created `locked` and get
// no odds. Odds are fetched through this app's own /api/odds proxy so its 24h CDN
// cache dedupes the upstream Odds API call across all tournaments.

const { buildMarketRows } = require('./_lib/market-builder');

const SPORT = 'soccer_fifa_world_cup_2026';
const ODDS_TTL_MS = 24 * 60 * 60 * 1000; // 24h

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

    // 2. Decide whether odds are stale (refresh at most every 24h)
    const exRes = await rest(
      `/bet_markets?tournament_id=eq.${tournamentId}` +
      `&market_type=eq.match_result&select=match_no,odds_fetched_at`
    );
    const existing = exRes.ok ? await exRes.json() : [];
    const newest = existing.reduce((acc, m) => {
      const t = m.odds_fetched_at ? new Date(m.odds_fetched_at).getTime() : 0;
      return t > acc ? t : acc;
    }, 0);
    const oddsStale = !existing.length || (Date.now() - newest > ODDS_TTL_MS);

    // Also force a refresh when a newly-resolved fixture has never had odds
    // (e.g. R32 teams just became known within the 24h window).
    const { WC2026_FIXTURES } = require('./_lib/fixtures');
    const pricedNos = new Set(existing.filter(m => m.odds_fetched_at).map(m => m.match_no));
    const hasUnpricedResolved = WC2026_FIXTURES.some(
      fx => fx.home.code && fx.away.code && !pricedNos.has(fx.match_no)
    );
    const shouldFetchOdds = oddsStale || hasUnpricedResolved;

    // 3. Fetch h2h odds when stale (only resolved fixtures get matched)
    let h2hEvents = null;
    let fetchedAt = null;
    if (shouldFetchOdds) {
      const base = selfBase(req);
      h2hEvents = await fetchJson(`${base}/api/odds?sport=${SPORT}&markets=h2h`);
      fetchedAt = new Date().toISOString();
    }

    // 4. Build market rows from the static fixture list via shared builder.
    const { groupRows, koRows, oddsMatched } = buildMarketRows(
      tournamentId,
      shouldFetchOdds ? h2hEvents : null,
      fetchedAt,
    );

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
      oddsRefreshed: oddsStale,
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

async function fetchJson(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function selfBase(req) {
  const host = req.headers.host || '';
  const proto = req.headers['x-forwarded-proto']
    || (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  return `${proto}://${host}`;
}

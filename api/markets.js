// Server-side market creation + 24h odds refresh for a tournament.
//
// The browser POSTs /api/markets?code=XXX on load. This deterministically
// ensures a match_result + correct_score market exists for every one of the 104
// static WC2026 fixtures (keyed by match_no — no wc_matches, no fuzzy sync), and
// refreshes 1X2 odds at most once per 24h.
//
// Knockout fixtures whose teams aren't resolved yet are created `locked` and get
// no odds. Odds are fetched through this app's own /api/odds proxy so its 24h CDN
// cache dedupes the upstream Odds API call across all tournaments.

const { WC2026_FIXTURES, CODE_NAMES } = require('./_lib/fixtures');
const { h2hOddsForFixture } = require('./_lib/odds-match');

const SPORT = 'soccer_fifa_world_cup_2026';
const ODDS_TTL_MS = 24 * 60 * 60 * 1000; // 24h

const teamName = code => CODE_NAMES[code] || code;

function matchNameFor(fx) {
  const h = fx.home.code ? teamName(fx.home.code) : fx.home.label;
  const a = fx.away.code ? teamName(fx.away.code) : fx.away.label;
  return `${h} vs ${a}`;
}

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
      `&market_type=eq.match_result&select=odds_fetched_at`
    );
    const existing = exRes.ok ? await exRes.json() : [];
    const newest = existing.reduce((acc, m) => {
      const t = m.odds_fetched_at ? new Date(m.odds_fetched_at).getTime() : 0;
      return t > acc ? t : acc;
    }, 0);
    const oddsStale = !existing.length || (Date.now() - newest > ODDS_TTL_MS);

    // 3. Fetch h2h odds when stale (only resolved fixtures get matched)
    let h2hEvents = null;
    let fetchedAt = null;
    if (oddsStale) {
      const base = selfBase(req);
      h2hEvents = await fetchJson(`${base}/api/odds?sport=${SPORT}&markets=h2h`);
      fetchedAt = new Date().toISOString();
    }

    // 4. Build deterministic market rows from the static fixture list.
    // status/result are omitted so existing settled markets are never clobbered.
    let oddsMatched = 0;
    const rows = [];
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

      const mr = { ...base, market_type: 'match_result' };
      if (oddsStale && resolved && Array.isArray(h2hEvents)) {
        const odds = h2hOddsForFixture(h2hEvents, fx);
        if (odds) {
          mr.odds_json = odds;
          mr.odds_fetched_at = fetchedAt;
          oddsMatched++;
        }
      }
      rows.push(mr);
      rows.push({ ...base, market_type: 'correct_score' });
    }

    await upsert(rest, rows, 'tournament_id,market_type,match_no');

    return res.status(200).json({
      ok: true,
      fixtures: WC2026_FIXTURES.length,
      markets: rows.length,
      oddsRefreshed: oddsStale,
      oddsMatched,
    });
  } catch (err) {
    console.error('[markets] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

async function upsert(rest, payload, onConflict) {
  const r = await rest(`/bet_markets?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
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

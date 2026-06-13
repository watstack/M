// Server-side market creation + 24h odds refresh for a tournament.
// The browser POSTs /api/markets?code=XXX on load; this ensures bet_markets rows
// exist for every scheduled match (match_result + correct_score) plus the
// tournament_winner market, and refreshes odds at most once per 24h.
//
// Odds are fetched through this app's own /api/odds proxy so its 24h CDN cache
// dedupes the upstream Odds API call across all tournaments.

const { fetchESPNMatches } = require('./_lib/espn');
const { h2hOddsForRow } = require('./_lib/odds-match');

const SPORT = 'soccer_fifa_world_cup_2026';
const ODDS_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const SKIP_STATUSES = ['POSTPONED', 'CANCELLED', 'SUSPENDED'];

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

    // 2. Ensure match data exists
    let rows = await readMatches(rest);
    if (!rows.length) {
      const fresh = await fetchESPNMatches();
      if (fresh.length) {
        await rest('/wc_matches', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(fresh),
        });
        rows = await readMatches(rest);
      }
    }
    const fixtures = rows.filter(r => r.utc_date && !SKIP_STATUSES.includes(r.status));

    // 3. Decide whether odds are stale (refresh at most every 24h)
    const exRes = await rest(
      `/bet_markets?tournament_id=eq.${tournamentId}` +
      `&select=id,market_type,match_id,odds_fetched_at`
    );
    const existing = exRes.ok ? await exRes.json() : [];
    const hasMatchMarkets = existing.some(m => m.market_type === 'match_result');
    const newest = existing.reduce((acc, m) => {
      const t = m.odds_fetched_at ? new Date(m.odds_fetched_at).getTime() : 0;
      return t > acc ? t : acc;
    }, 0);
    const oddsStale = !hasMatchMarkets || (Date.now() - newest > ODDS_TTL_MS);

    // 4. Ensure identity rows exist for every fixture (never touches odds/status)
    const identity = [];
    for (const r of fixtures) {
      const base = {
        tournament_id: tournamentId,
        match_id: String(r.id),
        match_name: `${r.home_name || '?'} vs ${r.away_name || '?'}`,
        kickoff_time: r.utc_date,
        close_time: r.utc_date,
      };
      identity.push({ ...base, market_type: 'match_result' });
      identity.push({ ...base, market_type: 'correct_score' });
    }
    if (identity.length) {
      await upsert(rest, identity, 'tournament_id,market_type,match_id');
    }

    // 5. Refresh odds (only when stale)
    let oddsRefreshed = false;
    if (oddsStale) {
      const base = selfBase(req);
      const h2hEvents = await fetchJson(`${base}/api/odds?sport=${SPORT}&markets=h2h`);
      const fetchedAt = new Date().toISOString();

      // Match-result odds: only rows we could match (payload always carries odds)
      const oddsRows = [];
      for (const r of fixtures) {
        const odds = Array.isArray(h2hEvents) ? h2hOddsForRow(h2hEvents, r) : null;
        if (!odds) continue;
        oddsRows.push({
          tournament_id: tournamentId,
          market_type: 'match_result',
          match_id: String(r.id),
          match_name: `${r.home_name || '?'} vs ${r.away_name || '?'}`,
          odds_json: odds,
          odds_fetched_at: fetchedAt,
        });
      }
      if (oddsRows.length) {
        await upsert(rest, oddsRows, 'tournament_id,market_type,match_id');
        oddsRefreshed = true;
      }
    }

    return res.status(200).json({
      ok: true,
      fixtures: fixtures.length,
      markets: identity.length,
      oddsRefreshed,
    });
  } catch (err) {
    console.error('[markets] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

async function readMatches(rest) {
  const r = await rest('/wc_matches?select=*&order=utc_date.asc&limit=300');
  if (!r.ok) return [];
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

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

// Serverless version of scripts/auto-settle.cjs.
// Called by the browser when it detects a match has just gone FINISHED,
// enabling near-real-time settlement without waiting for the hourly cron.
// Settlement is idempotent — already-settled markets are skipped by the DB RPC.

const { syncMatchesToSupabase } = require('./_lib/sync-matches');
const { makeRest, settleMarketRpc, propagateResult } = require('./_lib/settle-lib');

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.end(); return; }

  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supaUrl || !supaKey) {
    return res.status(500).json({ error: 'Supabase service key not configured' });
  }

  const rest = makeRest(supaUrl, supaKey);

  try {
    // Sync latest match data first.
    await syncMatchesToSupabase({ supaUrl, supaKey }, process.env.FOOTBALL_API_TOKEN || null);

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

    if (!finished.length || !markets.length) {
      return res.json({ ok: true, settled: 0, skipped: 0 });
    }

    const byTeams = new Map(finished.map(m => [`${m.home_tla}-${m.away_tla}`, m]));

    const groups = new Map();
    for (const m of markets) {
      const key = `${m.tournament_id}:${m.match_no}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    }

    let settled = 0, skipped = 0;

    for (const [, group] of groups) {
      const { tournament_id, match_no, stage, home_code, away_code } = group[0];

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

      const isKnockout = stage && stage !== 'group';
      if (isKnockout && matchResult !== 'draw') {
        const winnerCode = matchResult === 'home' ? home_code : away_code;
        const loserCode  = matchResult === 'home' ? away_code : home_code;
        await propagateResult(rest, tournament_id, Number(match_no), winnerCode, loserCode);
      }
    }

    console.log(`[auto-settle] settled ${settled}, skipped ${skipped}`);
    return res.json({ ok: true, settled, skipped });
  } catch (err) {
    console.error('[auto-settle] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

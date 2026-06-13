// Knockout matchup resolution (admin-guarded, keyed by match_no).
//
// POST /api/resolve  { code, adminToken, matchNo, homeCode?, awayCode? }
//
// Fills one or both team codes for a knockout fixture — used for the Round-of-32
// slots that depend on final group standings / best-third assignments (which the
// settlement propagation can't derive on its own). Once a match's two teams are
// set it unlocks and odds attach on the next /api/markets refresh. Settling that
// match then propagates winners onward via BRACKET_FEED automatically.

const { makeRest, verifyAdmin, setMatchTeams, teamName } = require('./_lib/settle-lib');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { code, adminToken, matchNo, homeCode, awayCode } = req.body || {};
  if (!code || !adminToken || matchNo == null || (!homeCode && !awayCode)) {
    return res.status(400).json({ error: 'code, adminToken, matchNo and at least one of homeCode/awayCode required' });
  }

  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supaUrl || !supaKey) return res.status(500).json({ error: 'Supabase not configured' });

  const rest = makeRest(supaUrl, supaKey);

  try {
    const tournamentId = await verifyAdmin(rest, code, adminToken);
    if (!tournamentId) return res.status(403).json({ error: 'Invalid tournament code or admin token' });

    const state = await setMatchTeams(rest, tournamentId, Number(matchNo), {
      homeCode: homeCode ? String(homeCode).toUpperCase() : undefined,
      awayCode: awayCode ? String(awayCode).toUpperCase() : undefined,
    });
    if (!state) return res.status(404).json({ error: 'No market for that match_no — create markets first' });

    return res.status(200).json({
      ok: true,
      matchNo: Number(matchNo),
      home: state.home_code ? teamName(state.home_code) : null,
      away: state.away_code ? teamName(state.away_code) : null,
      locked: state.locked,
    });
  } catch (err) {
    console.error('[resolve] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

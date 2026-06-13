// Settlement endpoint — called by the bracket when it detects a FINISHED match.
// Verifies the result from the wc_matches cache (ESPN data, keyed by the same
// match id used for bet_markets.match_id), then settles all open bet_markets
// for that match via Supabase RPCs.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { matchId, tournamentId } = req.body || {};
  if (!matchId || !tournamentId) {
    return res.status(400).json({ error: 'matchId and tournamentId required' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server not fully configured' });
  }

  const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };

  // 1. Look up the match in wc_matches to verify it's FINISHED with a final score
  let match;
  try {
    const r = await fetch(
      `${supabaseUrl}/rest/v1/wc_matches?id=eq.${encodeURIComponent(matchId)}&select=status,home_score,away_score`,
      { headers }
    );
    if (!r.ok) return res.status(502).json({ error: 'Failed to fetch match from Supabase' });
    const rows = await r.json();
    match = rows[0];
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach Supabase' });
  }

  if (!match) {
    return res.status(200).json({ settled: 0, reason: 'match_not_found' });
  }
  if (match.status !== 'FINISHED') {
    return res.status(200).json({ settled: 0, reason: 'match_not_finished' });
  }
  if (match.home_score == null || match.away_score == null) {
    return res.status(200).json({ settled: 0, reason: 'no_final_score' });
  }

  const homeGoals = match.home_score;
  const awayGoals = match.away_score;

  // Determine match result selection key
  let matchResult;
  if (homeGoals > awayGoals) matchResult = 'home';
  else if (awayGoals > homeGoals) matchResult = 'away';
  else matchResult = 'draw';

  const correctScoreResult = `${homeGoals}-${awayGoals}`;

  // 2. Fetch all unsettled markets for this match in this tournament
  const marketsRes = await fetch(
    `${supabaseUrl}/rest/v1/bet_markets?tournament_id=eq.${tournamentId}&match_id=eq.${encodeURIComponent(matchId)}&status=neq.settled&select=id,market_type`,
    { headers }
  );

  if (!marketsRes.ok) {
    return res.status(502).json({ error: 'Failed to fetch markets from Supabase' });
  }

  const markets = await marketsRes.json();
  if (!markets.length) {
    return res.status(200).json({ settled: 0, reason: 'no_open_markets' });
  }

  // 3. Settle each market
  let settled = 0;
  for (const market of markets) {
    const result = market.market_type === 'correct_score' ? correctScoreResult : matchResult;

    const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/settle_market`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_market_id: market.id, p_result: result }),
    });

    if (rpcRes.ok) settled++;
  }

  return res.status(200).json({ settled, matchResult, correctScoreResult });
};

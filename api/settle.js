// Settlement endpoint — called by the bracket when it detects a FINISHED match.
// Verifies the result server-side via football-data.org, then settles all
// open bet_markets for that match via Supabase RPCs.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { matchId, tournamentId } = req.body || {};
  if (!matchId || !tournamentId) {
    return res.status(400).json({ error: 'matchId and tournamentId required' });
  }

  const footballToken = process.env.FOOTBALL_API_TOKEN;
  const supabaseUrl   = process.env.SUPABASE_URL;
  const supabaseKey   = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!footballToken || !supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server not fully configured' });
  }

  // 1. Fetch the match from football-data.org to verify it's FINISHED
  let matchData;
  try {
    const r = await fetch(`https://api.football-data.org/v4/matches/${matchId}`, {
      headers: { 'X-Auth-Token': footballToken },
    });
    if (!r.ok) return res.status(502).json({ error: 'Football API error' });
    matchData = await r.json();
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach football API' });
  }

  if (matchData.status !== 'FINISHED') {
    return res.status(200).json({ settled: 0, reason: 'match_not_finished' });
  }

  const ft = matchData.score?.fullTime;
  if (ft?.home == null || ft?.away == null) {
    return res.status(200).json({ settled: 0, reason: 'no_final_score' });
  }

  const homeGoals = ft.home;
  const awayGoals = ft.away;

  // Determine match result selection key
  let matchResult;
  if (homeGoals > awayGoals) matchResult = 'home';
  else if (awayGoals > homeGoals) matchResult = 'away';
  else matchResult = 'draw';

  const correctScoreResult = `${homeGoals}-${awayGoals}`;

  // 2. Fetch all unsettled markets for this match in this tournament
  const marketsRes = await fetch(
    `${supabaseUrl}/rest/v1/bet_markets?tournament_id=eq.${tournamentId}&match_id=eq.${matchId}&status=neq.settled&select=id,market_type`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
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
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_market_id: market.id, p_result: result }),
    });

    if (rpcRes.ok) settled++;
  }

  return res.status(200).json({ settled, matchResult, correctScoreResult });
};

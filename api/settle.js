// Settlement endpoint (admin-guarded, keyed by match_no).
//
// POST /api/settle
//   { code, adminToken, matchNo, homeScore, awayScore, winner? }
//
// Settles a match's match_result (home/draw/away) and correct_score ("H-A")
// markets from the 90-minute score, then — for knockout matches — propagates the
// advancing team into the slots it feeds (BRACKET_FEED). For knockout games the
// 90-minute score may be a draw, so `winner` ('home'|'away') names the side that
// advances after extra time / penalties; for group games it is derived from the
// score and ignored for propagation.

const { makeRest, verifyAdmin, verifyParticipantAdmin, propagateResult, settleMarketRpc, voidMarketRpc } = require('./_lib/settle-lib');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { code, adminToken, participantId, matchNo, homeScore, awayScore, winner } = req.body || {};
  if (!code || (!adminToken && !participantId) || matchNo == null || homeScore == null || awayScore == null) {
    return res.status(400).json({ error: 'code, adminToken or participantId, matchNo, homeScore, awayScore required' });
  }
  const h = Number(homeScore), a = Number(awayScore);
  if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0) {
    return res.status(400).json({ error: 'Scores must be non-negative integers' });
  }

  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supaUrl || !supaKey) return res.status(500).json({ error: 'Supabase not configured' });

  const rest = makeRest(supaUrl, supaKey);

  try {
    const tournamentId = adminToken
      ? await verifyAdmin(rest, code, adminToken)
      : await verifyParticipantAdmin(rest, code, participantId);
    if (!tournamentId) return res.status(403).json({ error: 'Unauthorized' });

    const matchResult = h > a ? 'home' : a > h ? 'away' : 'draw';
    const correctScore = `${h}-${a}`;

    // Fetch this match's unsettled markets (+ resolved codes for propagation).
    const mRes = await rest(
      `/bet_markets?tournament_id=eq.${tournamentId}&match_no=eq.${matchNo}` +
      `&status=neq.settled&select=id,market_type,stage,home_code,away_code`
    );
    if (!mRes.ok) return res.status(502).json({ error: 'Failed to fetch markets' });
    const markets = await mRes.json();
    if (!markets.length) return res.status(200).json({ settled: 0, reason: 'no_open_markets' });

    const any = markets[0];
    const isKnockout = any.stage && any.stage !== 'group';

    // Pre-compute who advances (needed for qualify market and bracket propagation).
    const advSide = isKnockout
      ? (winner || (h > a ? 'home' : a > h ? 'away' : null))
      : null;

    let settled = 0;
    for (const m of markets) {
      if (m.market_type === 'qualify') {
        // DNB market: settles on 90-min result only. Draw → void (refund).
        if (matchResult === 'draw') {
          await voidMarketRpc(rest, m.id);
        } else {
          if (await settleMarketRpc(rest, m.id, matchResult)) settled++;
        }
      } else {
        const result = m.market_type === 'correct_score' ? correctScore : matchResult;
        if (await settleMarketRpc(rest, m.id, result)) settled++;
      }
    }

    // Knockout propagation (group matches don't feed BRACKET_FEED slots).
    let propagated = [];
    if (isKnockout && any.home_code && any.away_code && advSide) {
      const winnerCode = advSide === 'home' ? any.home_code : any.away_code;
      const loserCode  = advSide === 'home' ? any.away_code : any.home_code;
      propagated = await propagateResult(rest, tournamentId, Number(matchNo), winnerCode, loserCode);
    }

    return res.status(200).json({ settled, matchResult, correctScore, propagated });
  } catch (err) {
    console.error('[settle] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

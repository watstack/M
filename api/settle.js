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
//
// For knockout matches, homeScore/awayScore are expected to be the 90-minute
// score, but admins naturally tend to type in the final (ET/pens-inclusive)
// score instead. To guard against that, when a synced wc_matches row exists
// for the match we prefer its regulation-time score (same source auto-settle
// uses) over the submitted score. If no regulation score can be verified,
// match_result/correct_score/double_chance are left unsettled rather than
// trusting the submitted score as the 90-minute result (see auto-settle.js's
// matching regKnown gate) — only `qualify` settles in that case.

const { makeRest, verifyAdmin, verifyParticipantAdmin, propagateResult, settleMarketRpc, regulationScore } = require('./_lib/settle-lib');

// Look up the most recent wc_matches row for a home/away team-code pair.
async function lookupMatch(rest, homeCode, awayCode) {
  const r = await rest(
    `/wc_matches?home_tla=eq.${homeCode}&away_tla=eq.${awayCode}` +
    `&order=utc_date.desc&limit=1&select=home_score_reg,away_score_reg,goals,home_id,away_id`
  );
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
}

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

    // Default to the submitted score; for knockout matches, override with the
    // synced 90-minute regulation score when available (see file header).
    // If a knockout match's regulation score can't be verified from synced
    // data, don't trust the submitted score as if it were the 90-minute
    // result (admins naturally submit the ET/pens-inclusive final score) —
    // leave match_result/correct_score/double_chance unsettled, same as
    // auto-settle.js's regKnown gate.
    let matchResult = h > a ? 'home' : a > h ? 'away' : 'draw';
    let correctScore = `${h}-${a}`;
    let regKnown = !isKnockout;
    if (isKnockout && any.home_code && any.away_code) {
      let wc = await lookupMatch(rest, any.home_code, any.away_code);
      let swapped = false;
      if (!wc) { wc = await lookupMatch(rest, any.away_code, any.home_code); swapped = true; }
      if (wc) {
        const reg = regulationScore(wc);
        if (reg.source !== 'final_score_assumed') {
          regKnown = true;
          const regHome = swapped ? reg.away : reg.home;
          const regAway = swapped ? reg.home : reg.away;
          matchResult = regHome > regAway ? 'home' : regAway > regHome ? 'away' : 'draw';
          correctScore = `${regHome}-${regAway}`;
        }
      }
    }

    // Pre-compute who advances (needed for qualify market and bracket propagation).
    const advSide = isKnockout
      ? (winner || (h > a ? 'home' : a > h ? 'away' : null))
      : null;

    let settled = 0;
    for (const m of markets) {
      if (m.market_type === 'qualify') {
        // Settles to the side that actually advances (ET/pens winner via
        // advSide). A knockout tie always eventually produces an advancing
        // team, so this never voids — if advSide is unknown (90-min draw and
        // no `winner` supplied), leave it unsettled until admin resubmits
        // with `winner` once the shootout result is known.
        if (advSide) {
          if (await settleMarketRpc(rest, m.id, advSide)) settled++;
        }
      } else if (regKnown) {
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

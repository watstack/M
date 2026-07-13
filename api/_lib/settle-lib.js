// Shared helpers for settlement + knockout resolution.
// Markets are keyed by match_no; team codes for a match live on its bet_markets
// rows (home_code/away_code). Resolving a knockout matchup means filling those
// codes, unlocking, and refreshing the denormalized match_name.

const { WC2026_FIXTURES, BRACKET_FEED, CODE_NAMES } = require('./fixtures');

const FIXTURE_BY_NO = Object.fromEntries(WC2026_FIXTURES.map(f => [f.match_no, f]));
const teamName = code => CODE_NAMES[code] || code;

// PostgREST fetch wrapper bound to a Supabase project + key.
function makeRest(supaUrl, supaKey) {
  return (path, opts = {}) => fetch(`${supaUrl}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: supaKey,
      Authorization: `Bearer ${supaKey}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
}

// Resolve a tournament id from code + admin token, or null if not authorised.
async function verifyAdmin(rest, code, adminToken) {
  if (!code || !adminToken) return null;
  const r = await rest(
    `/tournaments?code=eq.${encodeURIComponent(code)}` +
    `&admin_token=eq.${encodeURIComponent(adminToken)}&select=id`
  );
  if (!r.ok) return null;
  const rows = await r.json();
  return rows.length ? rows[0].id : null;
}

// Resolve a tournament id from code + participant id (must have is_admin = true).
async function verifyParticipantAdmin(rest, code, participantId) {
  if (!code || !participantId) return null;
  const tr = await rest(`/tournaments?code=eq.${encodeURIComponent(code)}&select=id`);
  if (!tr.ok) return null;
  const tRows = await tr.json();
  if (!tRows.length) return null;
  const tournamentId = tRows[0].id;
  const pr = await rest(
    `/participants?id=eq.${encodeURIComponent(participantId)}` +
    `&tournament_id=eq.${encodeURIComponent(tournamentId)}&is_admin=eq.true&select=id`
  );
  if (!pr.ok) return null;
  const pRows = await pr.json();
  return pRows.length ? tournamentId : null;
}

// Display name for one side of a match: the resolved team name, else the static
// fixture's slot label (e.g. "Winner Group A"), else "TBC".
function sideLabel(matchNo, which, code) {
  if (code) return teamName(code);
  const fx = FIXTURE_BY_NO[matchNo];
  const side = fx && fx[which];
  return (side && (side.label || (side.code && teamName(side.code)))) || 'TBC';
}

// Set one or both team codes for a match, then recompute lock + match_name.
// codes: { homeCode?, awayCode? } — only provided sides are written.
async function setMatchTeams(rest, tournamentId, matchNo, codes) {
  const patch = {};
  if (codes.homeCode) patch.home_code = codes.homeCode;
  if (codes.awayCode) patch.away_code = codes.awayCode;
  if (Object.keys(patch).length) {
    await patchMarkets(rest, tournamentId, matchNo, patch);
  }

  // Read back the current codes (one row is enough) and finalise.
  const r = await rest(
    `/bet_markets?tournament_id=eq.${tournamentId}&match_no=eq.${matchNo}` +
    `&market_type=eq.match_result&select=home_code,away_code`
  );
  const row = r.ok ? (await r.json())[0] : null;
  if (!row) return null;

  const both = row.home_code && row.away_code;
  await patchMarkets(rest, tournamentId, matchNo, {
    locked: !both,
    match_name: `${sideLabel(matchNo, 'home', row.home_code)} vs ${sideLabel(matchNo, 'away', row.away_code)}`,
  });
  return { home_code: row.home_code, away_code: row.away_code, locked: !both };
}

// Propagate a finished match's winner/loser into the knockout slots it feeds
// (R16 → final, via BRACKET_FEED). Returns the list of matches advanced.
async function propagateResult(rest, tournamentId, matchNo, winnerCode, loserCode) {
  const advanced = [];
  for (const [downstream, [homeSlot, awaySlot]] of Object.entries(BRACKET_FEED)) {
    const codes = {};
    if (homeSlot === `W${matchNo}`) codes.homeCode = winnerCode;
    if (awaySlot === `W${matchNo}`) codes.awayCode = winnerCode;
    if (homeSlot === `L${matchNo}`) codes.homeCode = loserCode;
    if (awaySlot === `L${matchNo}`) codes.awayCode = loserCode;
    if (Object.keys(codes).length) {
      await setMatchTeams(rest, tournamentId, Number(downstream), codes);
      advanced.push(Number(downstream));
    }
  }
  return advanced;
}

async function patchMarkets(rest, tournamentId, matchNo, body) {
  const r = await rest(
    `/bet_markets?tournament_id=eq.${tournamentId}&match_no=eq.${matchNo}`,
    { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) }
  );
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`bet_markets patch ${r.status}: ${t}`);
  }
}

// Determine the 90-minute (regulation) score for a wc_matches row, in
// decreasing order of confidence:
//   1. home_score_reg/away_score_reg — populated directly from the source
//      API's regulation-time score (currently: football-data.org's
//      score.regularTime, see api/_lib/fbd.js).
//   2. goals array — reconstruct by summing goals with minute <= 90,
//      attributed to home/away via team.id vs home_id/away_id.
//   3. final score — assumed to equal the regulation score. Correct for
//      group-stage matches and any knockout match not decided in ET/pens;
//      wrong whenever a knockout match's final score already reflects an
//      ET/pens result and neither of the above sources is available.
//      Callers must treat this case as "unknown" for knockout matches and
//      not auto-settle off it.
function regulationScore(wc) {
  if (wc.home_score_reg != null && wc.away_score_reg != null) {
    return { home: wc.home_score_reg, away: wc.away_score_reg, source: 'reg_field' };
  }

  const goals = Array.isArray(wc.goals) ? wc.goals
    : (typeof wc.goals === 'string' ? JSON.parse(wc.goals || '[]') : []);
  if (goals.length) {
    const homeId = String(wc.home_id || '');
    const awayId = String(wc.away_id || '');
    const inReg = g => (g.minute ?? 0) <= 90;
    const home = goals.filter(g => String(g.team?.id || '') === homeId && inReg(g)).length;
    const away = goals.filter(g => String(g.team?.id || '') === awayId && inReg(g)).length;
    return { home, away, source: 'goals' };
  }

  return { home: wc.home_score, away: wc.away_score, source: 'final_score_assumed' };
}

// Determine which side actually advances, from the final (ET/pens-inclusive)
// score. Returns null when the final score is still level — the source API
// hasn't resolved a penalty-shootout winner yet, which requires the manual
// admin `winner` override on /api/settle.
function advancingSide(wc) {
  if (wc.home_score == null || wc.away_score == null) return null;
  if (wc.home_score === wc.away_score) return null;
  return wc.home_score > wc.away_score ? 'home' : 'away';
}

// Earliest goal's scorer name from a wc_matches goals[] array, or null if no
// named goal has been recorded yet (own-goal / unknown-scorer entries have
// scorer.name === '', and a genuinely scoreless match has no goals at all).
function firstScorerName(wc) {
  const goals = Array.isArray(wc.goals) ? wc.goals
    : (typeof wc.goals === 'string' ? JSON.parse(wc.goals || '[]') : []);
  const named = goals.filter(g => g.scorer && g.scorer.name);
  if (!named.length) return null;
  named.sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));
  return named[0].scorer.name;
}

// Deduped list of every named scorer in a wc_matches goals[] array, including
// extra time (minute <= 120) but not penalty shootouts — the ESPN feed's
// "goal"-type detail events (which is all `goals` is built from, see
// api/_lib/espn.js) don't include shootout kicks, so no separate filtering
// for those is needed beyond the same trust boundary firstScorerName/
// regulationScore already rely on. Returns [] for a genuine 0-0 through
// full time (anytime_scorer voids in that case, see auto-settle.js).
function allScorers(wc) {
  const goals = Array.isArray(wc.goals) ? wc.goals
    : (typeof wc.goals === 'string' ? JSON.parse(wc.goals || '[]') : []);
  const named = goals.filter(g => g.scorer && g.scorer.name && (g.minute ?? 0) <= 120);
  return [...new Set(named.map(g => g.scorer.name))];
}

async function settleMarketRpc(rest, marketId, result) {
  const r = await rest('/rpc/settle_market', {
    method: 'POST',
    body: JSON.stringify({ p_market_id: marketId, p_result: result }),
  });
  return r.ok;
}

async function settleMarketMultiRpc(rest, marketId, results) {
  const r = await rest('/rpc/settle_market_multi', {
    method: 'POST',
    body: JSON.stringify({ p_market_id: marketId, p_results: results }),
  });
  return r.ok;
}

async function voidMarketRpc(rest, marketId) {
  const r = await rest('/rpc/void_market', {
    method: 'POST',
    body: JSON.stringify({ p_market_id: marketId }),
  });
  return r.ok;
}

module.exports = {
  teamName, makeRest, verifyAdmin, verifyParticipantAdmin, setMatchTeams, propagateResult, settleMarketRpc, settleMarketMultiRpc, voidMarketRpc,
  regulationScore, advancingSide, firstScorerName, allScorers,
};

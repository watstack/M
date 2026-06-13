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

async function settleMarketRpc(rest, marketId, result) {
  const r = await rest('/rpc/settle_market', {
    method: 'POST',
    body: JSON.stringify({ p_market_id: marketId, p_result: result }),
  });
  return r.ok;
}

module.exports = {
  teamName, makeRest, verifyAdmin, setMatchTeams, propagateResult, settleMarketRpc,
};

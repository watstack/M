// Batch odds scraper — fetches WC 2026 odds once and writes to bet_markets.
// Called server-side only; ODDS_API_KEY never reaches the browser.
// Returns: { updated, skipped, quota_remaining, fixtures_found, odds_events_found, errors }

module.exports = async function handler(req, res) {
  const { tournament_id } = req.query;
  if (!tournament_id) {
    return res.status(400).json({ error: 'Missing tournament_id' });
  }

  const ODDS_KEY    = process.env.ODDS_API_KEY;
  const FB_TOKEN    = process.env.FOOTBALL_API_TOKEN;
  const SB_URL      = process.env.SUPABASE_URL;
  const SB_KEY      = process.env.SUPABASE_ANON_KEY;

  if (!ODDS_KEY || !SB_URL || !SB_KEY) {
    return res.status(500).json({ error: 'Server misconfigured — missing env vars' });
  }

  const errors = [];
  let quotaRemaining = null;

  // ─── 1. Fetch WC fixtures ──────────────────────────────────────────────────
  let fixtures = [];
  if (FB_TOKEN) {
    try {
      const r = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
        headers: { 'X-Auth-Token': FB_TOKEN },
      });
      if (r.ok) {
        const data = await r.json();
        fixtures = (data.matches || []).filter(
          m => m.utcDate && !['POSTPONED', 'CANCELLED', 'SUSPENDED'].includes(m.status)
        );
      } else {
        errors.push(`Football API: ${r.status}`);
      }
    } catch (e) {
      errors.push(`Football API: ${e.message}`);
    }
  }

  // ─── 2. Fetch H2H odds (1 API call) ───────────────────────────────────────
  let oddsEvents = [];
  try {
    const url = `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup_2026/odds/?regions=uk&markets=h2h&oddsFormat=decimal&apiKey=${ODDS_KEY}`;
    const r = await fetch(url);
    if (r.ok) {
      quotaRemaining = r.headers.get('x-requests-remaining');
      const data = await r.json();
      oddsEvents = Array.isArray(data) ? data : [];
    } else {
      errors.push(`Odds API H2H: ${r.status} ${await r.text()}`);
    }
  } catch (e) {
    errors.push(`Odds API H2H: ${e.message}`);
  }

  // ─── 3. Fetch outright odds (1 API call) ──────────────────────────────────
  let outrightEvents = [];
  try {
    const url = `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup_2026/outrights/?regions=uk&oddsFormat=decimal&apiKey=${ODDS_KEY}`;
    const r = await fetch(url);
    if (r.ok) {
      if (!quotaRemaining) quotaRemaining = r.headers.get('x-requests-remaining');
      const data = await r.json();
      outrightEvents = Array.isArray(data) ? data : [];
    } else {
      errors.push(`Odds API outrights: ${r.status}`);
    }
  } catch (e) {
    errors.push(`Odds API outrights: ${e.message}`);
  }

  // ─── 4. Load existing markets from DB ─────────────────────────────────────
  const dbH = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
  };

  let existingMarkets = [];
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/bet_markets?tournament_id=eq.${encodeURIComponent(tournament_id)}&select=id,market_type,match_id,status`,
      { headers: dbH }
    );
    if (r.ok) {
      existingMarkets = await r.json();
    } else {
      const body = await r.text();
      return res.status(502).json({ error: `DB read failed: ${r.status} ${body}` });
    }
  } catch (e) {
    return res.status(502).json({ error: `DB read: ${e.message}` });
  }

  const existingByKey = {};
  for (const m of existingMarkets) {
    existingByKey[`${m.market_type}:${m.match_id}`] = m;
  }

  // ─── 5. Build inserts + updates ────────────────────────────────────────────
  const now = new Date().toISOString();
  const inserts = [];
  const updateOps = [];
  let skipped = 0;

  for (const fixture of fixtures) {
    const matchId   = String(fixture.id);
    const matchName = `${fixture.homeTeam?.name || '?'} vs ${fixture.awayTeam?.name || '?'}`;
    const kickoff   = fixture.utcDate;

    const oddsEvent = matchOddsEventToFixture(oddsEvents, fixture);
    const h2h       = oddsEvent ? extractH2HOdds(oddsEvent) : null;
    const oddsJson  = h2h ? { home: h2h.home, draw: h2h.draw, away: h2h.away } : null;

    // match_result
    const mrKey = `match_result:${matchId}`;
    if (existingByKey[mrKey]) {
      if (oddsJson && existingByKey[mrKey].status !== 'settled') {
        updateOps.push({ id: existingByKey[mrKey].id, odds_json: oddsJson, odds_fetched_at: now });
      } else {
        skipped++;
      }
    } else {
      inserts.push({
        tournament_id, market_type: 'match_result', match_id: matchId,
        match_name: matchName, kickoff_time: kickoff, close_time: kickoff,
        odds_json: oddsJson, odds_fetched_at: now,
      });
    }

    // correct_score (no odds needed — fixed table in client)
    const csKey = `correct_score:${matchId}`;
    if (!existingByKey[csKey]) {
      inserts.push({
        tournament_id, market_type: 'correct_score', match_id: matchId,
        match_name: matchName, kickoff_time: kickoff, close_time: kickoff,
        odds_fetched_at: now,
      });
    }
  }

  // tournament_winner
  const winnerOddsJson = extractOutrightOdds(outrightEvents);
  const existingWinner = existingMarkets.find(m => m.market_type === 'tournament_winner');
  if (existingWinner) {
    if (winnerOddsJson && existingWinner.status !== 'settled') {
      updateOps.push({ id: existingWinner.id, odds_json: winnerOddsJson, odds_fetched_at: now });
    }
  } else {
    inserts.push({
      tournament_id, market_type: 'tournament_winner',
      match_name: 'FIFA World Cup 2026 Winner',
      odds_json: winnerOddsJson, odds_fetched_at: now,
    });
  }

  // ─── 6. Persist ────────────────────────────────────────────────────────────
  let insertedCount = 0;
  if (inserts.length) {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/bet_markets`, {
        method: 'POST',
        headers: { ...dbH, Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(inserts),
      });
      if (r.ok) {
        insertedCount = inserts.length;
      } else {
        const body = await r.text();
        errors.push(`Insert failed: ${r.status} ${body}`);
      }
    } catch (e) {
      errors.push(`Insert: ${e.message}`);
    }
  }

  await Promise.all(updateOps.map(async ({ id, odds_json, odds_fetched_at }) => {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/bet_markets?id=eq.${id}`, {
        method: 'PATCH',
        headers: dbH,
        body: JSON.stringify({ odds_json, odds_fetched_at }),
      });
      if (!r.ok) errors.push(`Update ${id}: ${r.status}`);
    } catch (e) {
      errors.push(`Update ${id}: ${e.message}`);
    }
  }));

  return res.status(200).json({
    updated: insertedCount + updateOps.length,
    skipped,
    quota_remaining: quotaRemaining != null ? parseInt(quotaRemaining, 10) : null,
    fixtures_found: fixtures.length,
    odds_events_found: oddsEvents.length,
    errors,
  });
};

// ─── Helpers (mirrors js/betting.js) ─────────────────────────────────────────

function matchOddsEventToFixture(oddsEvents, fixture) {
  if (!oddsEvents?.length) return null;
  const homeNorm = (fixture.homeTeam?.name || '').toLowerCase();
  const awayNorm = (fixture.awayTeam?.name || '').toLowerCase();
  return oddsEvents.find(ev => {
    const h = (ev.home_team || '').toLowerCase();
    const a = (ev.away_team || '').toLowerCase();
    return (h.includes(homeNorm.split(' ')[0]) || homeNorm.includes(h.split(' ')[0]))
        && (a.includes(awayNorm.split(' ')[0]) || awayNorm.includes(a.split(' ')[0]));
  }) || null;
}

function extractH2HOdds(oddsEvent) {
  for (const bm of (oddsEvent?.bookmakers || [])) {
    const mkt = (bm.markets || []).find(m => m.key === 'h2h');
    if (!mkt) continue;
    const outcomes = mkt.outcomes || [];
    if (outcomes.length < 2) continue;
    const draw    = outcomes.find(o => o.name === 'Draw');
    const nonDraw = outcomes.filter(o => o.name !== 'Draw');
    if (nonDraw.length < 2) continue;
    return {
      home: +nonDraw[0].price.toFixed(2),
      draw: draw ? +draw.price.toFixed(2) : null,
      away: +nonDraw[1].price.toFixed(2),
    };
  }
  return null;
}

function extractOutrightOdds(outrightEvents) {
  if (!outrightEvents?.length) return null;
  const event = outrightEvents[0];
  for (const bm of (event.bookmakers || [])) {
    const mkt = (bm.markets || []).find(m => m.key === 'outrights');
    if (!mkt) continue;
    const result = {};
    for (const o of mkt.outcomes) result[o.name] = +o.price.toFixed(2);
    return result;
  }
  return null;
}

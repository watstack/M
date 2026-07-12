// Shared ESPN World Cup match fetch + normalize logic.
// Used by api/sync.js and api/markets.js. Underscore-prefixed path → Vercel does
// not treat this as a serverless route. Inherits api/package.json "commonjs".

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world';

async function fetchESPNMatches() {
  const today = new Date();
  const dates = [];
  // Fetch 14 days back (group stage already played) + 30 days ahead (full schedule)
  for (let d = -14; d <= 30; d++) {
    const dt = new Date(today);
    dt.setUTCDate(dt.getUTCDate() + d);
    dates.push(dt.toISOString().slice(0, 10).replace(/-/g, ''));
  }

  const all = [];
  // Batch 5 dates at a time
  for (let i = 0; i < dates.length; i += 5) {
    const batch = dates.slice(i, i + 5);
    const results = await Promise.all(batch.map(fetchDate));
    all.push(...results.flat());
  }

  // Deduplicate by stable synthetic id (home-away-date)
  const seen = new Set();
  return all.filter(m => !seen.has(m.id) && seen.add(m.id));
}

// Targeted fetch for a specific list of dates (YYYY-MM-DD or YYYYMMDD),
// rather than fetchESPNMatches()'s rolling ±14/+30-day window — needed to
// pull historical group-stage matches that have already scrolled outside
// that window by the time a later knockout round is being priced.
async function fetchESPNMatchesForDates(dates) {
  const normalized = [...new Set(dates.map(d => String(d).replace(/-/g, '')))];
  const all = [];
  for (let i = 0; i < normalized.length; i += 5) {
    const batch = normalized.slice(i, i + 5);
    const results = await Promise.all(batch.map(fetchDate));
    all.push(...results.flat());
  }
  const seen = new Set();
  return all.filter(m => !seen.has(m.id) && seen.add(m.id));
}

async function fetchDate(dateStr) {
  try {
    const r = await fetch(`${ESPN}/scoreboard?limit=50&dates=${dateStr}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const { events = [] } = await r.json();
    return events.map(normalizeEvent).filter(Boolean);
  } catch (e) {
    console.warn(`[espn] fetch failed for ${dateStr}:`, e.message);
    return [];
  }
}

function normalizeEvent(ev) {
  const comp = ev.competitions?.[0];
  if (!comp) return null;

  const home = comp.competitors?.find(c => c.homeAway === 'home');
  const away = comp.competitors?.find(c => c.homeAway === 'away');
  if (!home || !away) return null;

  const sn = (ev.status?.type?.name || '').toUpperCase();
  const status =
    sn.includes('FINAL')    ? 'FINISHED' :
    sn.includes('PROGRESS') ? 'IN_PLAY'  :
    sn.includes('HALFTIME') ? 'PAUSED'   : 'SCHEDULED';

  const isPlayed = status !== 'SCHEDULED';
  const homeScore = isPlayed && home.score != null ? parseInt(home.score, 10) : null;
  const awayScore = isPlayed && away.score != null ? parseInt(away.score, 10) : null;

  // Extract group from competition notes (e.g. "Group A", "Group B")
  const headline = (comp.notes || []).map(n => n.headline || n.text || '').join(' ');
  const gm = headline.match(/group\s+([A-Za-z0-9]+)/i);
  const group = gm ? `GROUP_${gm[1].toUpperCase()}` : null;

  // Determine stage
  const stage = group ? 'GROUP_STAGE' :
    /round.of.32/i.test(headline) ? 'ROUND_OF_32' :
    /round.of.16/i.test(headline) ? 'ROUND_OF_16' :
    /quarter/i.test(headline)     ? 'QUARTER_FINALS' :
    /semi/i.test(headline)        ? 'SEMI_FINALS' :
    /third/i.test(headline)       ? 'THIRD_PLACE' :
    /final/i.test(headline)       ? 'FINAL' : 'GROUP_STAGE';

  // Build scorer list from linescores if available
  const goals = (comp.details || [])
    .filter(d => d.type?.id === '1' || /goal/i.test(d.type?.text || ''))
    .map(d => ({
      minute: d.clock?.displayValue ? parseInt(d.clock.displayValue) : null,
      scorer: { name: d.athletesInvolved?.[0]?.displayName || '' },
      team: { id: String(d.team?.id || '') },
    }));

  const homeTla = (home.team?.abbreviation || '').toUpperCase();
  const awayTla = (away.team?.abbreviation || '').toUpperCase();
  const dateKey = (ev.date || comp.date || '').split('T')[0];
  return {
    id: `${homeTla}-${awayTla}-${dateKey}`,
    home_tla: homeTla,
    home_name: home.team?.shortDisplayName || home.team?.displayName || '',
    home_id: String(home.team?.id || ''),
    away_tla: awayTla,
    away_name: away.team?.shortDisplayName || away.team?.displayName || '',
    away_id: String(away.team?.id || ''),
    home_score: homeScore,
    away_score: awayScore,
    home_score_reg: null,
    away_score_reg: null,
    score_duration: null,
    status,
    utc_date: ev.date || comp.date,
    stage,
    group_name: group,
    goals: goals,
    synced_at: new Date().toISOString(),
  };
}

module.exports = { fetchESPNMatches, fetchESPNMatchesForDates, normalizeEvent };

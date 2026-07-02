// football-data.org v4 match fetch + normalize to wc_matches row format.
// Used by api/sync.js as a fallback when ESPN is unavailable.

const FBD_BASE = 'https://api.football-data.org/v4';

async function fetchFBDMatches(token) {
  try {
    const r = await fetch(`${FBD_BASE}/competitions/WC/matches?season=2026`, {
      headers: { 'X-Auth-Token': token },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      console.warn(`[fbd] fetch failed: ${r.status}`);
      return [];
    }
    const { matches = [] } = await r.json();
    return matches.map(normalizeFBDMatch).filter(Boolean);
  } catch (e) {
    console.warn('[fbd] fetch error:', e.message);
    return [];
  }
}

function normalizeFBDMatch(m) {
  if (!m?.id || !m?.utcDate) return null;
  if (!m.homeTeam?.tla || !m.awayTeam?.tla) return null; // skip unresolved knockout slots
  const isPlayed = ['FINISHED', 'IN_PLAY', 'PAUSED'].includes(m.status);
  const goals = (m.goals || []).map(g => ({
    minute: g.minute ?? null,
    scorer: { name: g.scorer?.name || '' },
    team: { id: String(g.team?.id || '') },
  }));
  const homeTla = (m.homeTeam?.tla || '').toUpperCase();
  const awayTla = (m.awayTeam?.tla || '').toUpperCase();
  const dateKey = (m.utcDate || '').split('T')[0];
  return {
    id: `${homeTla}-${awayTla}-${dateKey}`,
    home_tla: homeTla,
    home_name: m.homeTeam?.shortName || m.homeTeam?.name || '',
    home_id: String(m.homeTeam?.id || ''),
    away_tla: awayTla,
    away_name: m.awayTeam?.shortName || m.awayTeam?.name || '',
    away_id: String(m.awayTeam?.id || ''),
    home_score: isPlayed ? (m.score?.fullTime?.home ?? null) : null,
    away_score: isPlayed ? (m.score?.fullTime?.away ?? null) : null,
    home_score_reg: isPlayed ? (m.score?.regularTime?.home ?? m.score?.fullTime?.home ?? null) : null,
    away_score_reg: isPlayed ? (m.score?.regularTime?.away ?? m.score?.fullTime?.away ?? null) : null,
    score_duration: m.score?.duration || 'REGULAR',
    status: m.status || 'SCHEDULED',
    utc_date: m.utcDate,
    stage: m.stage || 'GROUP_STAGE',
    group_name: m.group || null,
    goals: goals,
    synced_at: new Date().toISOString(),
  };
}

module.exports = { fetchFBDMatches };

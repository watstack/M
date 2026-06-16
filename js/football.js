// Match data via ESPN public API → Supabase wc_matches table.
// On load: /api/sync fetches ESPN in the background and upserts to Supabase.
// getAllMatchData() reads from Supabase and normalises to the existing format.
// Falls back to direct football-data.org if Supabase is empty or unreachable.

const CACHE_TTL_LIVE = 60_000;
const CACHE_TTL_IDLE = 300_000;

let _pollTimer = null;
let _pollCallback = null;
let _syncFired   = false;   // only fire background sync once per session

// ─── Primary path: Supabase ───────────────────────────────────────────────────

async function supaFetch(path) {
  const base    = CONFIG.SUPABASE_URL + '/rest/v1';
  const headers = {
    'apikey':        CONFIG.SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
  };
  const res = await fetch(`${base}${path}`, { headers });
  if (!res.ok) throw new Error(`Supabase ${res.status} for ${path}`);
  return res.json();
}

async function triggerSync() {
  if (_syncFired) return;
  _syncFired = true;
  fetch('/api/sync').catch(e => console.warn('[football] sync failed:', e.message));
}

async function awaitSync() {
  try {
    const r = await fetch('/api/sync');
    if (!r.ok) console.warn('[football] sync returned', r.status);
  } catch (e) {
    console.warn('[football] sync error:', e.message);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function getAllMatchData() {
  // Fire background sync on first call each session
  triggerSync();

  let rows;
  try {
    rows = await supaFetch('/wc_matches?select=*&order=utc_date.asc&limit=300');
  } catch (e) {
    console.warn('[football] Supabase read failed, trying sync+retry:', e.message);
    await awaitSync();
    rows = await supaFetch('/wc_matches?select=*&order=utc_date.asc&limit=300');
  }

  // If table is empty (first deploy), wait for sync then retry
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log('[football] No Supabase data yet — waiting for sync...');
    _syncFired = false;        // allow awaitSync to call /api/sync
    await awaitSync();
    _syncFired = true;
    try {
      rows = await supaFetch('/wc_matches?select=*&order=utc_date.asc&limit=300');
    } catch (_) {}
  }

  // Fall back to football-data.org if Supabase still has nothing
  if (!Array.isArray(rows) || rows.length === 0) {
    console.warn('[football] Supabase empty — falling back to football-data.org');
    return footballDataFallback();
  }

  const finCount = rows.filter(r => r.status === 'FINISHED').length;
  console.log(`[football] Supabase → ${rows.length} matches, ${finCount} FINISHED`);
  return normaliseRows(rows);
}

// ─── Normalise Supabase rows → existing { teams, matches, standings } shape ───

function normaliseRows(rows) {
  const matches = rows.map(r => ({
    id:       r.id,
    status:   r.status,
    utcDate:  r.utc_date,
    stage:    r.stage   || 'GROUP_STAGE',
    group:    r.group_name,
    homeTeam: { id: r.home_id, tla: r.home_tla, shortName: r.home_name, name: r.home_name },
    awayTeam: { id: r.away_id, tla: r.away_tla, shortName: r.away_name, name: r.away_name },
    score: {
      fullTime:  { home: r.home_score, away: r.away_score },
      halfTime:  { home: null, away: null },
    },
    goals: Array.isArray(r.goals) ? r.goals : [],
  }));

  // Unique teams from match data
  const teamMap = new Map();
  for (const m of matches) {
    if (!teamMap.has(m.homeTeam.tla)) teamMap.set(m.homeTeam.tla, m.homeTeam);
    if (!teamMap.has(m.awayTeam.tla)) teamMap.set(m.awayTeam.tla, m.awayTeam);
  }

  return { teams: [...teamMap.values()], matches, standings: computeStandings(matches) };
}

function computeStandings(matches) {
  const groups = {};
  for (const m of matches) {
    const g = m.group;
    if (!g) continue;
    if (!groups[g]) groups[g] = {};
    const addTeam = (t) => {
      if (!groups[g][t.tla]) groups[g][t.tla] = {
        team: { tla: t.tla, shortName: t.shortName, name: t.name },
        playedGames: 0, won: 0, draw: 0, lost: 0,
        goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
      };
    };
    addTeam(m.homeTeam);
    addTeam(m.awayTeam);
    if (m.status === 'FINISHED') {
      const hg = m.score.fullTime.home ?? 0;
      const ag = m.score.fullTime.away ?? 0;
      const ht = groups[g][m.homeTeam.tla];
      const at = groups[g][m.awayTeam.tla];
      ht.playedGames++; at.playedGames++;
      ht.goalsFor  += hg; ht.goalsAgainst += ag;
      at.goalsFor  += ag; at.goalsAgainst += hg;
      ht.goalDifference = ht.goalsFor - ht.goalsAgainst;
      at.goalDifference = at.goalsFor - at.goalsAgainst;
      if (hg > ag)       { ht.won++;  ht.points += 3; at.lost++; }
      else if (ag > hg)  { at.won++;  at.points += 3; ht.lost++; }
      else               { ht.draw++; ht.points += 1; at.draw++; at.points += 1; }
    }
  }
  return Object.entries(groups).map(([g, teams]) => ({
    group: g.replace(/^GROUP_/, 'Group '),
    table: Object.values(teams).sort((a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor
    ),
  }));
}

// ─── Fallback: direct football-data.org ──────────────────────────────────────

async function footballFetch(path) {
  const cacheKey = `wc26_fbd_${path}`;
  const cached   = sessionStorage.getItem(cacheKey);
  if (cached) {
    const { ts, data } = JSON.parse(cached);
    const ttl = (data?.matches || []).some(m => m.status === 'IN_PLAY' || m.status === 'PAUSED')
      ? CACHE_TTL_LIVE : CACHE_TTL_IDLE;
    if (Date.now() - ts < ttl) return data;
  }
  const res = await fetch(`https://api.football-data.org/v4/${path.replace(/^\//, '')}`, {
    headers: { 'X-Auth-Token': CONFIG.FOOTBALL_API_TOKEN },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[football] football-data.org ${res.status} for ${path}:`, body);
    throw new Error(`Football API ${res.status}`);
  }
  const data = await res.json();
  sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
  return data;
}

async function footballDataFallback() {
  const [tData, mData, sData] = await Promise.allSettled([
    footballFetch(`competitions/WC/teams`),
    footballFetch(`competitions/WC/matches?season=2026`),
    footballFetch(`competitions/WC/standings?season=2026`),
  ]);
  return {
    teams:     tData.status === 'fulfilled' ? (tData.value.teams    || []) : [],
    matches:   mData.status === 'fulfilled' ? (mData.value.matches  || []) : [],
    standings: sData.status === 'fulfilled' ? (sData.value.standings || []) : [],
  };
}

// ─── Live polling ─────────────────────────────────────────────────────────────

function hasLiveMatch(data) {
  return (data?.matches || []).some(m => m.status === 'IN_PLAY' || m.status === 'PAUSED');
}

function startPolling(callback) {
  _pollCallback = callback;
  _schedulePoll();
}

function stopPolling() {
  if (_pollTimer) clearTimeout(_pollTimer);
  _pollTimer = null;
  _pollCallback = null;
}

async function _schedulePoll() {
  if (!_pollCallback) return;
  try {
    _syncFired = false;          // allow a fresh sync each poll cycle
    const data = await getAllMatchData();
    _pollCallback(data);
    const delay = hasLiveMatch(data) ? CACHE_TTL_LIVE : CACHE_TTL_IDLE;
    _pollTimer = setTimeout(_schedulePoll, delay);
  } catch (e) {
    console.warn('[football] poll error:', e.message);
    _pollTimer = setTimeout(_schedulePoll, 120_000);
  }
}

// ─── Bracket helpers ──────────────────────────────────────────────────────────


function groupMatchesByStage(matches) {
  const grouped = {};
  for (const m of matches) {
    const s = m.stage || 'GROUP_STAGE';
    if (!grouped[s]) grouped[s] = [];
    grouped[s].push(m);
  }
  return grouped;
}

function getScore(match) {
  if (!match.score || match.status === 'SCHEDULED' || match.status === 'TIMED') {
    return { home: null, away: null };
  }
  const s = match.score.fullTime || match.score.halfTime || {};
  return { home: s.home ?? null, away: s.away ?? null };
}

function matchStatusClass(match) {
  if (match.status === 'IN_PLAY')  return 'live';
  if (match.status === 'PAUSED')   return 'live';
  if (match.status === 'FINISHED') return 'finished';
  return 'scheduled';
}

const TLA_MAP = { GBR: 'ENG' };

function normTeamCode(tla) {
  return TLA_MAP[tla] || (tla || '').toUpperCase();
}

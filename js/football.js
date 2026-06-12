// football-data.org API wrapper for WC 2026.
// Calls api.football-data.org directly from the browser (CORS supported).
// Free tier: 10 req/min. We cache aggressively and poll only when needed.

const WC_CODE = 'WC';
const CACHE_TTL_LIVE = 60_000;    // 60s when a match is live
const CACHE_TTL_IDLE = 300_000;   // 5min otherwise

let _pollTimer = null;
let _pollCallback = null;

// Purge any cached responses that predate the ?season=2026 parameter addition.
(function purgeLegacyCache() {
  const stale = [
    `wc26_api_/competitions/WC/matches`,
    `wc26_api_/competitions/WC/standings`,
    `wc26_api_/competitions/WC/teams`,
  ];
  stale.forEach(k => sessionStorage.removeItem(k));
}());

async function footballFetch(path) {
  const cacheKey = `wc26_api_${path}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    const { ts, data } = JSON.parse(cached);
    const ttl = hasLiveMatch(data) ? CACHE_TTL_LIVE : CACHE_TTL_IDLE;
    if (Date.now() - ts < ttl) return data;
  }
  const cleanPath = path.replace(/^\//, '');
  const res = await fetch(`https://api.football-data.org/v4/${cleanPath}`, {
    headers: { 'X-Auth-Token': CONFIG.FOOTBALL_API_TOKEN },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[football] API ${res.status} for ${path}:`, body);
    throw new Error(`Football API error: ${res.status}`);
  }
  const data = await res.json();
  const finCount = (data.matches || []).filter(m => m.status === 'FINISHED').length;
  if (finCount > 0 || (data.matches || []).length > 0) {
    console.log(`[football] ${path} → ${(data.matches||[]).length} matches, ${finCount} FINISHED`);
  }
  sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
  return data;
}

// Returns true if any match in a response payload is currently in play.
function hasLiveMatch(data) {
  const matches = data?.matches || [];
  return matches.some(m => m.status === 'IN_PLAY' || m.status === 'PAUSED');
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function getTeams() {
  const data = await footballFetch(`/competitions/${WC_CODE}/teams`);
  return data.teams || [];
}

async function getMatches(stage = null) {
  const params = new URLSearchParams({ season: '2026' });
  if (stage) params.set('stage', stage);
  const data = await footballFetch(`/competitions/${WC_CODE}/matches?${params}`);
  return data.matches || [];
}

async function getStandings() {
  const data = await footballFetch(`/competitions/${WC_CODE}/standings?season=2026`);
  return data.standings || [];
}

async function getAllMatchData() {
  const [teams, matches, standings] = await Promise.all([
    getTeams(),
    getMatches(),
    getStandings(),
  ]);
  return { teams, matches, standings };
}

// ─── Live polling ─────────────────────────────────────────────────────────────

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
    const data = await getAllMatchData();
    _pollCallback(data);
    const delay = hasLiveMatch({ matches: data.matches }) ? CACHE_TTL_LIVE : CACHE_TTL_IDLE;
    _pollTimer = setTimeout(_schedulePoll, delay);
  } catch (e) {
    // On error back off 2 min
    _pollTimer = setTimeout(_schedulePoll, 120_000);
  }
}

// ─── Bracket helpers ──────────────────────────────────────────────────────────

const STAGE_ORDER = [
  'GROUP_STAGE',
  'ROUND_OF_32',
  'ROUND_OF_16',
  'QUARTER_FINALS',
  'SEMI_FINALS',
  'THIRD_PLACE',
  'FINAL',
];

const STAGE_LABELS = {
  GROUP_STAGE:   'Group Stage',
  ROUND_OF_32:   'Round of 32',
  ROUND_OF_16:   'Round of 16',
  QUARTER_FINALS:'Quarter-Finals',
  SEMI_FINALS:   'Semi-Finals',
  THIRD_PLACE:   'Third-Place Play-off',
  FINAL:         'Final',
};

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
  if (match.status === 'IN_PLAY') return 'live';
  if (match.status === 'PAUSED') return 'live';
  if (match.status === 'FINISHED') return 'finished';
  return 'scheduled';
}

// Map football-data team tla → our FLAG_COLORS key (usually same, a few differ)
const TLA_MAP = {
  GBR: 'ENG', // fallback if API uses different codes
};

function normTeamCode(tla) {
  return TLA_MAP[tla] || tla;
}

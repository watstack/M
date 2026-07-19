// Shared match-data sync helper: FBD primary, ESPN fallback, wc_matches upsert.
// Used by api/sync.js, api/auto-settle.js, scripts/auto-settle.cjs.

const { fetchESPNMatches, fetchESPNMatchesForDates } = require('./espn');
const { fetchFBDMatches }  = require('./fbd');

// Merge ESPN goals into FBD matches missing them, keyed by the shared
// synthetic id. FBD's score/status fields are never touched — only `goals`
// is backfilled, and only when FBD's own is empty (pure, so it's cheap to
// unit-test independently of the network call in enrichGoalsFromESPN below).
function mergeGoalsFromESPN(matches, espnMatches) {
  const espnById = new Map(espnMatches.map(m => [m.id, m]));
  return matches.map(m => {
    if (m.status !== 'FINISHED' || (m.goals && m.goals.length)) return m;
    const e = espnById.get(m.id);
    return (e && e.goals.length) ? { ...m, goals: e.goals } : m;
  });
}

// football-data.org's free tier (what this app uses) never includes
// scorer/player data, so fetchFBDMatches() always normalizes goals: [].
// Enrich just the finished matches missing goals with ESPN's goals feed
// (targeted by date, not the full rolling-window fetchESPNMatches() sweep).
async function enrichGoalsFromESPN(matches) {
  const needsGoals = matches.filter(m => m.status === 'FINISHED' && (!m.goals || m.goals.length === 0));
  if (!needsGoals.length) return matches;

  const dates = [...new Set(needsGoals.map(m => m.utc_date.split('T')[0]))];
  const espnMatches = await fetchESPNMatchesForDates(dates);
  return mergeGoalsFromESPN(matches, espnMatches);
}

/**
 * Fetch latest WC match data and upsert into wc_matches.
 * @param {{ supaUrl: string, supaKey: string }} db
 * @param {string|null} [fbdToken]
 * @returns {Promise<{ synced: number, source: string }>}
 */
async function syncMatchesToSupabase({ supaUrl, supaKey }, fbdToken) {
  let matches = [];
  let source = 'none';

  if (fbdToken) {
    matches = await fetchFBDMatches(fbdToken);
    source = 'fbd';
    if (matches.length) matches = await enrichGoalsFromESPN(matches);
  }
  if (matches.length === 0) {
    matches = await fetchESPNMatches();
    source = 'espn';
  }
  if (matches.length === 0) return { synced: 0, source };

  const r = await fetch(
    `${supaUrl}/rest/v1/wc_matches?on_conflict=id`,
    {
      method: 'POST',
      headers: {
        apikey: supaKey,
        Authorization: `Bearer ${supaKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(matches),
    }
  );

  if (!r.ok) {
    const body = await r.text().catch(() => '');
    console.warn(`[sync-matches] wc_matches upsert ${r.status}: ${body}`);
    return { synced: 0, source };
  }
  return { synced: matches.length, source };
}

module.exports = { syncMatchesToSupabase, enrichGoalsFromESPN, mergeGoalsFromESPN };

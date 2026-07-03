// Shared match-data sync helper: FBD primary, ESPN fallback, wc_matches upsert.
// Used by api/sync.js, api/auto-settle.js, scripts/auto-settle.cjs.

const { fetchESPNMatches } = require('./espn');
const { fetchFBDMatches }  = require('./fbd');

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

module.exports = { syncMatchesToSupabase };

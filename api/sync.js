// Fetches WC 2026 match data and upserts into the Supabase wc_matches table.
// Primary source: football-data.org (token required). Fallback: ESPN public API.
// Called by the browser on page load; run supabase/wc_matches.sql first.

const { syncMatchesToSupabase } = require('./_lib/sync-matches');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.end(); return; }

  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supaUrl || !supaKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  try {
    const { synced, source } = await syncMatchesToSupabase(
      { supaUrl, supaKey },
      process.env.FOOTBALL_API_TOKEN || null,
    );
    if (source === 'none') {
      return res.json({ ok: true, synced: 0, note: 'No events from ESPN or FBD' });
    }
    console.log(`[sync] Upserted ${synced} matches from ${source}`);
    return res.json({ ok: true, synced, source });
  } catch (err) {
    console.error('[sync] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

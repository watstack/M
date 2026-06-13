// Fetches WC 2026 match data and upserts into the Supabase wc_matches table.
// Primary source: ESPN public API (no auth). Fallback: football-data.org (token required).
// Called by the browser on page load; run supabase/wc_matches.sql first.

const { fetchESPNMatches } = require('./_lib/espn');
const { fetchFBDMatches }  = require('./_lib/fbd');

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
    // FBD is primary (1 fast request). ESPN is fallback (no auth but 45 date fetches).
    let matches = [];
    let source = 'none';

    const token = process.env.FOOTBALL_API_TOKEN;
    if (token) {
      matches = await fetchFBDMatches(token);
      source = 'fbd';
    }
    if (matches.length === 0) {
      matches = await fetchESPNMatches();
      source = 'espn';
    }

    if (matches.length === 0) {
      return res.json({ ok: true, synced: 0, note: 'No events from ESPN or FBD' });
    }

    const r = await fetch(`${supaUrl}/rest/v1/wc_matches`, {
      method: 'POST',
      headers: {
        'apikey': supaKey,
        'Authorization': `Bearer ${supaKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(matches),
    });

    if (!r.ok) {
      const body = await r.text();
      console.error('[sync] Supabase upsert failed:', r.status, body);
      return res.status(500).json({ error: `Supabase ${r.status}: ${body}` });
    }

    console.log(`[sync] Upserted ${matches.length} matches from ${source}`);
    return res.json({ ok: true, synced: matches.length, source });
  } catch (err) {
    console.error('[sync] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

// Fetches WC 2026 match data from ESPN's public API (no auth needed) and
// upserts into the Supabase wc_matches table. Called by the browser on load.
// Run supabase/wc_matches.sql first to create the table.
// ESPN fetch/normalize lives in api/_lib/espn.js (shared with api/markets.js).

const { fetchESPNMatches } = require('./_lib/espn');

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
    const matches = await fetchESPNMatches();

    if (matches.length === 0) {
      return res.json({ ok: true, synced: 0, note: 'No events from ESPN' });
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

    console.log(`[sync] Upserted ${matches.length} matches`);
    return res.json({ ok: true, synced: matches.length });
  } catch (err) {
    console.error('[sync] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

// Diagnostic endpoint — returns DB row counts to help debug empty betting screens.
// Safe to leave deployed; only reads data, no writes.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  const hasFbdToken = !!process.env.FOOTBALL_API_TOKEN;

  if (!supaUrl || !supaKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const q = (path) => fetch(`${supaUrl}/rest/v1${path}`, {
    headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}`, 'Content-Type': 'application/json' },
  });

  try {
    const [wcRes, bmRes] = await Promise.all([
      q('/wc_matches?select=id&limit=1&head=true'),
      q('/bet_markets?select=id,market_type&limit=500'),
    ]);

    const wcCount = parseInt(wcRes.headers.get('content-range')?.split('/')[1] ?? '?');
    const bm = bmRes.ok ? await bmRes.json() : [];
    const byType = bm.reduce((acc, m) => {
      acc[m.market_type] = (acc[m.market_type] || 0) + 1;
      return acc;
    }, {});

    return res.json({
      wc_matches: wcCount,
      bet_markets: byType,
      has_fbd_token: hasFbdToken,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

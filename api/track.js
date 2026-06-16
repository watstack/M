// Records a single page view. Called fire-and-forget from js/analytics.js.
const ALLOWED_PAGES = ['home', 'sweepstake', 'betting', 'admin'];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { page, visitor_id, tournament_code } = req.body || {};
  if (!ALLOWED_PAGES.includes(page)) return res.status(400).json({ error: 'bad page' });
  if (typeof visitor_id !== 'string' || visitor_id.length > 64)
    return res.status(400).json({ error: 'bad visitor_id' });

  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supaUrl || !supaKey) return res.status(500).json({ error: 'not configured' });

  try {
    const r = await fetch(`${supaUrl}/rest/v1/page_views`, {
      method: 'POST',
      headers: {
        apikey: supaKey,
        Authorization: `Bearer ${supaKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        page,
        visitor_id,
        tournament_code: tournament_code || null,
      }),
    });
    return res.status(r.ok ? 200 : 500).json({ ok: r.ok });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

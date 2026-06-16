// Returns aggregated page view stats. No individual visitor IDs are exposed.
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supaUrl || !supaKey) return res.status(500).json({ error: 'not configured' });

  try {
    // Fetch all rows — page_views stays small for a sweepstake site.
    // Supabase REST doesn't support COUNT(DISTINCT) so we aggregate in JS.
    const r = await fetch(`${supaUrl}/rest/v1/page_views?select=page,visitor_id,created_at`, {
      headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` },
    });
    if (!r.ok) return res.status(500).json({ error: 'query failed' });

    const rows = await r.json();
    const totalViews = rows.length;
    const uniqueVisitors = new Set(rows.map(row => row.visitor_id)).size;

    const byPage = {};
    for (const row of rows) {
      if (!byPage[row.page]) byPage[row.page] = { views: 0, visitors: new Set() };
      byPage[row.page].views++;
      byPage[row.page].visitors.add(row.visitor_id);
    }
    const pages = Object.entries(byPage)
      .map(([page, d]) => ({ page, views: d.views, unique_visitors: d.visitors.size }))
      .sort((a, b) => b.views - a.views);

    return res.json({ total_views: totalViews, unique_visitors: uniqueVisitors, pages });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

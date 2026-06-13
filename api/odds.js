// Vercel serverless proxy for The Odds API.
// Keeps ODDS_API_KEY server-side — never exposed to the browser.

module.exports = async function handler(req, res) {
  const { sport, markets, eventIds } = req.query;

  if (!sport) {
    return res.status(400).json({ error: 'Missing sport parameter' });
  }

  // Only allow soccer sports to prevent key abuse
  if (!/^soccer_/.test(sport)) {
    return res.status(403).json({ error: 'Sport not allowed' });
  }

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Odds API key not configured on server' });
  }

  const isOutright = req.query.type === 'outrights';
  const endpoint = isOutright
    ? `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/outrights/`
    : `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/odds/`;

  const params = new URLSearchParams({ apiKey, regions: 'uk', oddsFormat: 'decimal' });
  if (markets) params.set('markets', markets);
  if (eventIds) params.set('eventIds', eventIds);

  try {
    const upstream = await fetch(`${endpoint}?${params}`);
    const data = await upstream.json();

    // Cache 24h at CDN edge — odds only need a daily refresh, and this dedupes
    // the upstream call across all tournaments (free tier is 500 req/month)
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=172800');
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach odds API' });
  }
};

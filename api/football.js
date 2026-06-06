// Vercel serverless proxy for football-data.org.
// Keeps FOOTBALL_API_TOKEN server-side — never exposed to the browser.

module.exports = async function handler(req, res) {
  const { path } = req.query;

  if (!path) {
    return res.status(400).json({ error: 'Missing path parameter' });
  }

  // Only allow WC competition endpoints to prevent token abuse
  if (!/^competitions\/(WC|wc)\/(matches|teams|standings)/.test(path)) {
    return res.status(403).json({ error: 'Path not allowed' });
  }

  const token = process.env.FOOTBALL_API_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Football API token not configured on server' });
  }

  try {
    const upstream = await fetch(`https://api.football-data.org/v4/${path}`, {
      headers: { 'X-Auth-Token': token },
    });

    const data = await upstream.json();

    // Cache 60s at CDN edge; serve stale for 5 min while revalidating
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach football API' });
  }
};

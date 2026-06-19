// GET /api/push-config
// Returns the VAPID public key so the browser can call pushManager.subscribe().
// The public key is safe to expose; the private key never leaves the server.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  if (req.method === 'OPTIONS') { res.end(); return; }

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) return res.status(503).json({ error: 'Push not configured' });

  return res.status(200).json({ publicKey });
};

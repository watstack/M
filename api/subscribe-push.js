// POST /api/subscribe-push
// { code, adminToken, action: 'subscribe'|'unsubscribe', subscription }
// Registers or removes an admin's push subscription for a tournament.
// Admin identity is validated via code + adminToken before any DB write.

const { makeRest, verifyAdmin } = require('./_lib/settle-lib');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { code, adminToken, action, subscription } = req.body || {};
  if (!code || !adminToken || !action)
    return res.status(400).json({ error: 'code, adminToken, action required' });
  if (action !== 'subscribe' && action !== 'unsubscribe')
    return res.status(400).json({ error: 'action must be subscribe or unsubscribe' });

  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supaUrl || !supaKey) return res.status(500).json({ error: 'Supabase not configured' });

  const rest = makeRest(supaUrl, supaKey);

  try {
    const tournamentId = await verifyAdmin(rest, code, adminToken);
    if (!tournamentId) return res.status(403).json({ error: 'Unauthorized' });

    if (action === 'unsubscribe') {
      const endpoint = subscription && subscription.endpoint;
      if (!endpoint) return res.status(400).json({ error: 'subscription.endpoint required' });
      await rest(
        `/push_subscriptions?tournament_id=eq.${encodeURIComponent(tournamentId)}&endpoint=eq.${encodeURIComponent(endpoint)}`,
        { method: 'DELETE', headers: { Prefer: 'return=minimal' } }
      );
      return res.status(200).json({ ok: true });
    }

    // action === 'subscribe'
    const endpoint = subscription && subscription.endpoint;
    const keys     = subscription && subscription.keys;
    const p256dh   = keys && keys.p256dh;
    const auth     = keys && keys.auth;
    if (!endpoint || !p256dh || !auth)
      return res.status(400).json({ error: 'subscription.endpoint, keys.p256dh and keys.auth required' });

    const r = await rest('/push_subscriptions', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ tournament_id: tournamentId, endpoint, p256dh, auth }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return res.status(502).json({ error: `DB write failed: ${t}` });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

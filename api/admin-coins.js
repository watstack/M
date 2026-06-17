// POST /api/admin-coins
// { code, adminToken, participantId, coinBalance, cansOwed }
// Sets coin_balance + cans_owed for one participant, scoped to the admin's tournament.

const { makeRest, verifyAdmin } = require('./_lib/settle-lib');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { code, adminToken, participantId, coinBalance, cansOwed } = req.body || {};
  if (!code || !adminToken || !participantId || coinBalance == null || cansOwed == null)
    return res.status(400).json({ error: 'code, adminToken, participantId, coinBalance, cansOwed required' });

  const coins = Number(coinBalance);
  const cans  = Number(cansOwed);
  if (!Number.isInteger(coins) || coins < 0) return res.status(400).json({ error: 'coinBalance must be a non-negative integer' });
  if (!Number.isInteger(cans)  || cans  < 0) return res.status(400).json({ error: 'cansOwed must be a non-negative integer' });

  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supaUrl || !supaKey) return res.status(500).json({ error: 'Supabase not configured' });

  const rest = makeRest(supaUrl, supaKey);
  try {
    const tournamentId = await verifyAdmin(rest, code, adminToken);
    if (!tournamentId) return res.status(403).json({ error: 'Unauthorized' });

    const r = await rest(
      `/participants?id=eq.${encodeURIComponent(participantId)}&tournament_id=eq.${encodeURIComponent(tournamentId)}`,
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ coin_balance: coins, cans_owed: cans }) }
    );
    if (!r.ok) { const t = await r.text().catch(() => ''); return res.status(502).json({ error: `DB update failed: ${t}` }); }
    const rows = await r.json();
    if (!rows.length) return res.status(404).json({ error: 'Participant not found in this tournament' });
    return res.status(200).json({ ok: true, participantId, coinBalance: coins, cansOwed: cans });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

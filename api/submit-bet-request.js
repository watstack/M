// POST /api/submit-bet-request
// { code, participantId, outcomeText }
// Inserts a bet_request row via the existing submit_bet_request RPC, then fires
// push notifications to all registered admin subscriptions for that tournament.
// Push failures are best-effort and never block the response.

const { makeRest } = require('./_lib/settle-lib');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { code, participantId, outcomeText, options } = req.body || {};
  if (!code || !participantId || !(outcomeText && outcomeText.trim()))
    return res.status(400).json({ error: 'code, participantId, outcomeText required' });

  const supaUrl  = process.env.SUPABASE_URL;
  const supaKey  = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  const vapidPub = process.env.VAPID_PUBLIC_KEY;
  const vapidKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSub = process.env.VAPID_SUBJECT;
  if (!supaUrl || !supaKey) return res.status(500).json({ error: 'Supabase not configured' });

  const rest = makeRest(supaUrl, supaKey);

  try {
    // Resolve tournament id from code
    const tRes = await rest(`/tournaments?code=eq.${encodeURIComponent(code)}&select=id`);
    if (!tRes.ok) return res.status(502).json({ error: 'Tournament lookup failed' });
    const tourns = await tRes.json();
    if (!tourns.length) return res.status(404).json({ error: 'Tournament not found' });
    const tournamentId = tourns[0].id;

    // Insert bet request via existing RPC (handles all validation)
    const rpcBody = {
      p_participant_id: participantId,
      p_tournament_id:  tournamentId,
      p_outcome_text:   outcomeText.trim(),
    };
    if (options !== undefined) rpcBody.p_options_json = options;
    const rpcRes = await rest('/rpc/submit_bet_request', {
      method: 'POST',
      body: JSON.stringify(rpcBody),
    });
    if (!rpcRes.ok) {
      const body = await rpcRes.text().catch(() => '');
      return res.status(rpcRes.status === 400 ? 400 : 502).json({ error: body });
    }
    const betRequest = await rpcRes.json();

    // Fire push notifications (best-effort)
    if (vapidPub && vapidKey && vapidSub) {
      try {
        const webPush = require('web-push');
        webPush.setVapidDetails(vapidSub, vapidPub, vapidKey);

        const subsRes = await rest(
          `/push_subscriptions?tournament_id=eq.${encodeURIComponent(tournamentId)}&select=endpoint,p256dh,auth`
        );
        if (subsRes.ok) {
          const subs = await subsRes.json();
          const payload = JSON.stringify({
            title: 'New bet request',
            body:  `"${outcomeText.trim().slice(0, 80)}"`,
            url:   `/b/${encodeURIComponent(code)}`,
          });
          await Promise.allSettled(subs.map(sub =>
            webPush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload,
              { TTL: 3600 }
            ).catch(err => {
              // 410 Gone = subscription revoked — prune it
              if (err.statusCode === 410) {
                rest(
                  `/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`,
                  { method: 'DELETE', headers: { Prefer: 'return=minimal' } }
                ).catch(() => {});
              }
              console.warn('[push] send failed:', err.statusCode, err.message);
            })
          ));
        }
      } catch (pushErr) {
        console.warn('[push] failed:', pushErr.message);
      }
    }

    return res.status(200).json({ ok: true, id: betRequest.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

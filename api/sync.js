// Fetches WC 2026 match data from ESPN's public API (no auth needed) and
// upserts into the Supabase wc_matches table. Called by the browser on load.
// Run supabase/wc_matches.sql first to create the table.

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world';

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

async function fetchESPNMatches() {
  const today = new Date();
  const dates = [];
  // Fetch 14 days back (group stage already played) + 30 days ahead (full schedule)
  for (let d = -14; d <= 30; d++) {
    const dt = new Date(today);
    dt.setUTCDate(dt.getUTCDate() + d);
    dates.push(dt.toISOString().slice(0, 10).replace(/-/g, ''));
  }

  const all = [];
  // Batch 5 dates at a time
  for (let i = 0; i < dates.length; i += 5) {
    const batch = dates.slice(i, i + 5);
    const results = await Promise.all(batch.map(fetchDate));
    all.push(...results.flat());
  }

  // Deduplicate by id
  const seen = new Set();
  return all.filter(m => !seen.has(m.id) && seen.add(m.id));
}

async function fetchDate(dateStr) {
  try {
    const r = await fetch(`${ESPN}/scoreboard?limit=50&dates=${dateStr}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const { events = [] } = await r.json();
    return events.map(normalizeEvent).filter(Boolean);
  } catch (e) {
    console.warn(`[sync] ESPN fetch failed for ${dateStr}:`, e.message);
    return [];
  }
}

function normalizeEvent(ev) {
  const comp = ev.competitions?.[0];
  if (!comp) return null;

  const home = comp.competitors?.find(c => c.homeAway === 'home');
  const away = comp.competitors?.find(c => c.homeAway === 'away');
  if (!home || !away) return null;

  const sn = (ev.status?.type?.name || '').toUpperCase();
  const status =
    sn.includes('FINAL')    ? 'FINISHED' :
    sn.includes('PROGRESS') ? 'IN_PLAY'  :
    sn.includes('HALFTIME') ? 'PAUSED'   : 'SCHEDULED';

  const isPlayed = status !== 'SCHEDULED';
  const homeScore = isPlayed && home.score != null ? parseInt(home.score, 10) : null;
  const awayScore = isPlayed && away.score != null ? parseInt(away.score, 10) : null;

  // Extract group from competition notes (e.g. "Group A", "Group B")
  const headline = (comp.notes || []).map(n => n.headline || n.text || '').join(' ');
  const gm = headline.match(/group\s+([A-Za-z0-9]+)/i);
  const group = gm ? `GROUP_${gm[1].toUpperCase()}` : null;

  // Determine stage
  const stage = group ? 'GROUP_STAGE' :
    /round.of.32/i.test(headline) ? 'ROUND_OF_32' :
    /round.of.16/i.test(headline) ? 'ROUND_OF_16' :
    /quarter/i.test(headline)     ? 'QUARTER_FINALS' :
    /semi/i.test(headline)        ? 'SEMI_FINALS' :
    /third/i.test(headline)       ? 'THIRD_PLACE' :
    /final/i.test(headline)       ? 'FINAL' : 'GROUP_STAGE';

  // Build scorer list from linescores if available
  const goals = (comp.details || [])
    .filter(d => d.type?.id === '1' || /goal/i.test(d.type?.text || ''))
    .map(d => ({
      minute: d.clock?.displayValue ? parseInt(d.clock.displayValue) : null,
      scorer: { name: d.athletesInvolved?.[0]?.displayName || '' },
      team: { id: String(d.team?.id || '') },
    }));

  return {
    id: String(ev.id),
    home_tla: (home.team?.abbreviation || '').toUpperCase(),
    home_name: home.team?.shortDisplayName || home.team?.displayName || '',
    home_id: String(home.team?.id || ''),
    away_tla: (away.team?.abbreviation || '').toUpperCase(),
    away_name: away.team?.shortDisplayName || away.team?.displayName || '',
    away_id: String(away.team?.id || ''),
    home_score: homeScore,
    away_score: awayScore,
    status,
    utc_date: ev.date || comp.date,
    stage,
    group_name: group,
    goals: JSON.stringify(goals),
    synced_at: new Date().toISOString(),
  };
}

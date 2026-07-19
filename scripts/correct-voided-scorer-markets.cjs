#!/usr/bin/env node
// One-off remediation for anytime_scorer markets that were auto-voided by the
// since-fixed goalscorer-data bug (see api/_lib/sync-matches.js and the
// anytime_scorer dispatch fix in api/auto-settle.js / scripts/auto-settle.cjs).
// Before that fix, wc_matches.goals was always empty, so every anytime_scorer
// market that reached settlement took the unconditional void branch and
// refunded stakes — even for matches with real goalscorers.
//
// For each bet_markets row with market_type='anytime_scorer' AND status='void'
// across all tournaments, re-derives the real scorers from (now-fixed)
// wc_matches.goals. If there were genuinely none, the void was correct and is
// left alone. Otherwise calls reverse_void_market() to undo the wrong refund/
// void, then settle_market_multi() to grade it for real.
//
// first_scorer markets need no correction here — they were never wrongly
// voided (they already had the genuine-0-0 guard pre-fix), just stuck
// unsettled, and self-heal via the next `node scripts/auto-settle.cjs` run
// (or the 15-minute cron) now that goals data flows correctly.
//
// Usage:
//   node scripts/correct-voided-scorer-markets.cjs --dry-run   # review only
//   node scripts/correct-voided-scorer-markets.cjs             # apply

const { syncMatchesToSupabase } = require('../api/_lib/sync-matches.js');
const { makeRest, allScorers } = require('../api/_lib/settle-lib.js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FBD_TOKEN    = process.env.FOOTBALL_API_TOKEN;

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[correct-voided-scorer-markets] SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
    process.exit(1);
  }

  const rest = makeRest(SUPABASE_URL, SUPABASE_KEY);

  const { synced } = await syncMatchesToSupabase(
    { supaUrl: SUPABASE_URL, supaKey: SUPABASE_KEY },
    FBD_TOKEN || null,
  );
  console.log(`[correct-voided-scorer-markets] synced ${synced} matches`);

  const [voidedRes, matchesRes] = await Promise.all([
    rest(`/bet_markets?market_type=eq.anytime_scorer&status=eq.void&select=id,tournament_id,match_no,match_name,home_code,away_code`),
    rest(`/wc_matches?select=home_tla,away_tla,goals,home_id,away_id`),
  ]);
  if (!voidedRes.ok)  throw new Error(`bet_markets query ${voidedRes.status}`);
  if (!matchesRes.ok) throw new Error(`wc_matches query ${matchesRes.status}`);

  const voided  = await voidedRes.json();
  const matches = await matchesRes.json();
  console.log(`[correct-voided-scorer-markets] ${voided.length} voided anytime_scorer market(s) found`);
  if (!voided.length) return;

  const byTeams = new Map(matches.map(m => [`${m.home_tla}-${m.away_tla}`, m]));

  let corrected = 0, confirmed = 0, skipped = 0;

  for (const market of voided) {
    if (!market.home_code || !market.away_code) { skipped++; continue; }

    let wc = byTeams.get(`${market.home_code}-${market.away_code}`);
    if (!wc) wc = byTeams.get(`${market.away_code}-${market.home_code}`);
    if (!wc) {
      console.log(`[skip] ${market.match_name} (${market.id}): no match data found`);
      skipped++;
      continue;
    }

    const scorers = allScorers(wc);
    if (!scorers.length) {
      console.log(`[confirmed] ${market.match_name} (${market.id}): genuine 0-0, void stands`);
      confirmed++;
      continue;
    }

    console.log(`[${DRY_RUN ? 'would-correct' : 'correct'}] ${market.match_name} (${market.id}): ${scorers.join(', ')}`);
    if (DRY_RUN) { corrected++; continue; }

    const rev = await rest('/rpc/reverse_void_market', {
      method: 'POST',
      body: JSON.stringify({ p_market_id: market.id }),
    });
    if (!rev.ok) { console.error(`  reverse_void_market failed: ${rev.status}`); skipped++; continue; }

    const settle = await rest('/rpc/settle_market_multi', {
      method: 'POST',
      body: JSON.stringify({ p_market_id: market.id, p_results: scorers }),
    });
    if (!settle.ok) { console.error(`  settle_market_multi failed: ${settle.status}`); skipped++; continue; }

    corrected++;
  }

  console.log(`[correct-voided-scorer-markets] ${DRY_RUN ? 'would correct' : 'corrected'} ${corrected}, confirmed genuine 0-0 ${confirmed}, skipped ${skipped}`);
}

main().catch(err => { console.error('[correct-voided-scorer-markets] fatal:', err.message); process.exit(1); });

// Server-side odds matching for The Odds API events.
// Ported from js/betting.js (extractH2HOdds / matchOddsEventToFixture / outrights).

// Pull home/draw/away decimal prices out of an Odds API event's h2h market.
function extractH2HOdds(oddsEvent) {
  for (const bm of (oddsEvent?.bookmakers || [])) {
    const mkt = (bm.markets || []).find(m => m.key === 'h2h');
    if (!mkt) continue;
    const outcomes = mkt.outcomes || [];
    if (outcomes.length < 2) continue;
    const draw = outcomes.find(o => o.name === 'Draw');
    const nonDraw = outcomes.filter(o => o.name !== 'Draw');
    if (nonDraw.length < 2) continue;
    return {
      home: +nonDraw[0].price.toFixed(2),
      draw: draw ? +draw.price.toFixed(2) : null,
      away: +nonDraw[1].price.toFixed(2),
    };
  }
  return null;
}

// Fuzzy-match an Odds API event to a wc_matches row by team name.
function matchOddsEventToRow(oddsEvents, row) {
  if (!oddsEvents?.length) return null;
  const homeNorm = (row.home_name || '').toLowerCase();
  const awayNorm = (row.away_name || '').toLowerCase();
  if (!homeNorm || !awayNorm) return null;
  return oddsEvents.find(ev => {
    const h = ev.home_team?.toLowerCase() || '';
    const a = ev.away_team?.toLowerCase() || '';
    return (h.includes(homeNorm.split(' ')[0]) || homeNorm.includes(h.split(' ')[0]))
        && (a.includes(awayNorm.split(' ')[0]) || awayNorm.includes(a.split(' ')[0]));
  }) || null;
}

// Build the { home, draw, away } odds object for a wc_matches row, or null.
function h2hOddsForRow(oddsEvents, row) {
  const ev = matchOddsEventToRow(oddsEvents, row);
  if (!ev) return null;
  const h2h = extractH2HOdds(ev);
  if (!h2h) return null;
  return { home: h2h.home, draw: h2h.draw, away: h2h.away };
}

// Build the { TeamName: price, ... } map from an outrights response, or null.
function outrightOddsMap(outrightEvents) {
  if (!outrightEvents?.length) return null;
  const event = outrightEvents[0];
  for (const bm of (event.bookmakers || [])) {
    const mkt = (bm.markets || []).find(m => m.key === 'outrights');
    if (!mkt) continue;
    const map = {};
    for (const o of mkt.outcomes) map[o.name] = +o.price.toFixed(2);
    return map;
  }
  return null;
}

module.exports = { extractH2HOdds, matchOddsEventToRow, h2hOddsForRow, outrightOddsMap };

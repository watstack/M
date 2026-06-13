// Server-side odds matching for The Odds API events.
// Matches odds events to static WC2026 fixtures by resolving both sides to our
// 3-letter team codes via TEAM_ALIAS — far more reliable than fuzzy name search.

// ─── Team-name → code alias map ──────────────────────────────────────────────
// Keys are normalised (lowercased, de-accented, alphanumerics only). Covers the
// 48 WC2026 teams plus the name variants The Odds API / bookmakers tend to use.
const TEAM_ALIAS = {
  mexico: 'MEX',
  southafrica: 'RSA',
  southkorea: 'KOR', korearepublic: 'KOR', korea: 'KOR',
  czechrepublic: 'CZE', czechia: 'CZE',
  canada: 'CAN',
  switzerland: 'SUI',
  bosniaandherzegovina: 'BIH', bosniaherzegovina: 'BIH', bosnia: 'BIH',
  qatar: 'QAT',
  brazil: 'BRA',
  morocco: 'MAR',
  scotland: 'SCO',
  haiti: 'HAI',
  usa: 'USA', unitedstates: 'USA', unitedstatesofamerica: 'USA',
  paraguay: 'PAR',
  australia: 'AUS',
  turkey: 'TUR', turkiye: 'TUR',
  germany: 'GER',
  curacao: 'CUW',
  ivorycoast: 'CIV', cotedivoire: 'CIV',
  ecuador: 'ECU',
  netherlands: 'NED', holland: 'NED',
  japan: 'JPN',
  sweden: 'SWE',
  tunisia: 'TUN',
  belgium: 'BEL',
  egypt: 'EGY',
  iran: 'IRN', iriran: 'IRN',
  newzealand: 'NZL',
  spain: 'ESP',
  capeverde: 'CPV', caboverde: 'CPV',
  saudiarabia: 'KSA',
  uruguay: 'URU',
  france: 'FRA',
  senegal: 'SEN',
  iraq: 'IRQ',
  norway: 'NOR',
  argentina: 'ARG',
  algeria: 'ALG',
  austria: 'AUT',
  jordan: 'JOR',
  portugal: 'POR',
  drcongo: 'COD', congodr: 'COD', democraticrepublicofcongo: 'COD', dccongo: 'COD',
  uzbekistan: 'UZB',
  colombia: 'COL',
  england: 'ENG',
  croatia: 'CRO',
  ghana: 'GHA',
  panama: 'PAN',
};

function normName(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Resolve an Odds API team-name string to a 3-letter code, or null.
function codeForName(name) {
  return TEAM_ALIAS[normName(name)] || null;
}

// ─── h2h price extraction ────────────────────────────────────────────────────
// Pull home/draw/away decimal prices out of an Odds API event's h2h market.
// `event.home_team` is the nominal home; outcomes are named by team / "Draw".
function extractH2HOdds(oddsEvent) {
  const homeName = oddsEvent?.home_team;
  const awayName = oddsEvent?.away_team;
  for (const bm of (oddsEvent?.bookmakers || [])) {
    const mkt = (bm.markets || []).find(m => m.key === 'h2h');
    if (!mkt) continue;
    const outcomes = mkt.outcomes || [];
    const draw = outcomes.find(o => o.name === 'Draw');
    const home = outcomes.find(o => o.name === homeName);
    const away = outcomes.find(o => o.name === awayName);
    if (!home || !away) continue;
    return {
      home: +home.price.toFixed(2),
      draw: draw ? +draw.price.toFixed(2) : null,
      away: +away.price.toFixed(2),
    };
  }
  return null;
}

// ─── Fixture matching ────────────────────────────────────────────────────────
// Build the { home, draw, away } odds object for a static fixture, or null.
// Resolves both the fixture and each event to codes and matches on the pair,
// swapping home/away prices when the event lists the teams the other way round.
function h2hOddsForFixture(oddsEvents, fixture) {
  const fHome = fixture?.home?.code;
  const fAway = fixture?.away?.code;
  if (!fHome || !fAway || !Array.isArray(oddsEvents)) return null;

  for (const ev of oddsEvents) {
    const evHome = codeForName(ev.home_team);
    const evAway = codeForName(ev.away_team);
    if (!evHome || !evAway) continue;

    const sameOrder = evHome === fHome && evAway === fAway;
    const swapped   = evHome === fAway && evAway === fHome;
    if (!sameOrder && !swapped) continue;

    const h2h = extractH2HOdds(ev);
    if (!h2h) return null;
    // Express odds in the FIXTURE's home/away orientation.
    return sameOrder
      ? { home: h2h.home, draw: h2h.draw, away: h2h.away }
      : { home: h2h.away, draw: h2h.draw, away: h2h.home };
  }
  return null;
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

module.exports = {
  TEAM_ALIAS, normName, codeForName,
  extractH2HOdds, h2hOddsForFixture, outrightOddsMap,
};

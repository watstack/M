// Discovers the live FIFA World Cup match-odds sport key from The Odds API.
// The /v4/sports list is free (no quota cost). Prefer a World-Cup soccer sport
// that is NOT an outright (has_outrights === false → match/h2h odds).
// An explicit ODDS_SPORT_KEY env var overrides discovery if ever needed.
async function resolveSportKey(oddsApiKey) {
  const override = process.env.ODDS_SPORT_KEY;
  if (override) return override;
  const r = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${oddsApiKey}`);
  if (!r.ok) return null;
  const sports = await r.json();
  const soccer = (Array.isArray(sports) ? sports : []).filter(s => /^soccer_/.test(s.key || ''));
  const isWC = s => /world.?cup/i.test(`${s.key} ${s.title}`);
  return (soccer.find(s => isWC(s) && s.has_outrights === false)
       || soccer.find(s => isWC(s) && !/winner|outright/i.test(`${s.key} ${s.title}`))
       || soccer.find(isWC))?.key ?? null;
}

module.exports = { resolveSportKey };

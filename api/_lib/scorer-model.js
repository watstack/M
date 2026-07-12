// Pure, unit-testable first-goalscorer probability model. No I/O — takes
// already-fetched ESPN match data + already-cached match_result odds as
// plain arguments, returns a { "Player Name": price, ... } odds_json.
// Used by scripts/compute-scorer-odds.cjs (a one-time calculation; not part
// of the recurring 4-hourly odds refresh — see docs/ODDS_SCRAPE.md's history
// for why this exists alongside the scraper).

const ANY_OTHER_PLAYER = 'Any Other Player';

// Tally, per team, how often each player scored their team's first goal of
// a match (firstScorerCounts) and how many goals they scored in total
// (totalGoalCounts, used as a fallback signal when firstScorerCounts is too
// sparse). `matches` is an array of ESPN-normalized match rows
// ({ home_tla, home_id, away_tla, away_id, goals: [{minute, scorer:{name}, team:{id}}] }).
// `teamCodes` is the list of team codes to tally (others are ignored).
function tallyFirstScorers(matches, teamCodes) {
  const codesSet = new Set(teamCodes);
  const tallies = {};
  for (const code of teamCodes) {
    tallies[code] = { firstScorerCounts: {}, totalGoalCounts: {}, gamesPlayed: 0, goalsScored: 0 };
  }

  for (const m of (matches || [])) {
    const sides = [
      { code: m.home_tla, id: m.home_id },
      { code: m.away_tla, id: m.away_id },
    ];
    for (const side of sides) {
      if (!codesSet.has(side.code)) continue;
      const t = tallies[side.code];
      t.gamesPlayed++;

      const teamGoals = (Array.isArray(m.goals) ? m.goals : [])
        .filter(g => String(g.team?.id || '') === String(side.id))
        .filter(g => g.scorer && g.scorer.name);
      if (!teamGoals.length) continue;

      t.goalsScored += teamGoals.length;
      for (const g of teamGoals) {
        t.totalGoalCounts[g.scorer.name] = (t.totalGoalCounts[g.scorer.name] || 0) + 1;
      }
      const earliest = teamGoals.slice().sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999))[0];
      t.firstScorerCounts[earliest.scorer.name] = (t.firstScorerCounts[earliest.scorer.name] || 0) + 1;
    }
  }
  return tallies;
}

// P(home team scores the match's first goal) / P(away team scores it),
// normalized from cached match_result implied win probabilities (excludes
// the draw price — encodes opponent quality/home advantage/current form
// already baked into real market pricing, cheaper than a standalone
// expected-goals model). Returns null if odds aren't usable, so the caller
// can fall back to average-goals-per-game.
function teamFirstGoalProbabilities(matchResultOdds) {
  if (!matchResultOdds) return null;
  const { home, away } = matchResultOdds;
  if (!(home > 1) || !(away > 1)) return null;
  const pHome = 1 / home;
  const pAway = 1 / away;
  const sum = pHome + pAway;
  if (!(sum > 0)) return null;
  return { home: pHome / sum, away: pAway / sum };
}

// Fallback team split when match_result odds aren't available: proportional
// to each team's average goals scored per game this tournament.
function teamFirstGoalProbabilitiesFromAvgGoals(homeAvgGoals, awayAvgGoals) {
  const h = Math.max(homeAvgGoals, 0.01);
  const a = Math.max(awayAvgGoals, 0.01);
  return { home: h / (h + a), away: a / (h + a) };
}

const round2 = v => Math.round(v * 100) / 100;

// Splits one team's "scores first" probability mass across its known
// scorers (proportional to firstScorerCounts, or totalGoalCounts as a
// fallback if firstScorerCounts is too sparse to be meaningful), reserves
// `otherPlayerShare` for an "Any Other Player" catch-all (bench/subs/own
// goals/anyone outside the sample), applies the bookmaker-style overround,
// and converts to rounded decimal prices.
function playerOddsForTeam(tally, teamProbability, marginMultiplier, otherPlayerShare = 0.15) {
  const prices = {};
  if (!(teamProbability > 0)) return prices;

  const firstTotal = Object.values(tally?.firstScorerCounts || {}).reduce((a, b) => a + b, 0);
  const useFirst = firstTotal >= 2;
  const source = useFirst ? tally.firstScorerCounts : (tally?.totalGoalCounts || {});
  const sourceTotal = Object.values(source).reduce((a, b) => a + b, 0);

  const priceFor = (probability) => round2(1 / (probability * marginMultiplier));

  if (sourceTotal === 0) {
    // No historical scorer data at all for this team — all mass to the catch-all.
    prices[ANY_OTHER_PLAYER] = priceFor(teamProbability);
    return prices;
  }

  const namedShare = 1 - otherPlayerShare;
  for (const [player, count] of Object.entries(source)) {
    const playerProbability = teamProbability * namedShare * (count / sourceTotal);
    prices[player] = priceFor(playerProbability);
  }
  prices[ANY_OTHER_PLAYER] = priceFor(teamProbability * otherPlayerShare);
  return prices;
}

// End-to-end: combine both teams' tallies + the match's team-level
// first-goal split into one first_scorer odds_json for the fixture.
function buildFirstScorerOdds({ homeTally, awayTally, teamProbabilities, marginMultiplier = 1.07, otherPlayerShare = 0.15 }) {
  const home = playerOddsForTeam(homeTally, teamProbabilities.home, marginMultiplier, otherPlayerShare);
  const away = playerOddsForTeam(awayTally, teamProbabilities.away, marginMultiplier, otherPlayerShare);
  // Two teams' "Any Other Player" buckets merge into one combined price
  // (best/lowest of the two implied prices — since either team's unnamed
  // player could be the first scorer, this outcome is more likely than
  // either team's alone, so it deserves the more favorable — lower — price).
  const merged = { ...home, ...away };
  if (home[ANY_OTHER_PLAYER] != null && away[ANY_OTHER_PLAYER] != null) {
    merged[ANY_OTHER_PLAYER] = round2(Math.min(home[ANY_OTHER_PLAYER], away[ANY_OTHER_PLAYER]));
  }
  return merged;
}

module.exports = {
  ANY_OTHER_PLAYER,
  tallyFirstScorers,
  teamFirstGoalProbabilities,
  teamFirstGoalProbabilitiesFromAvgGoals,
  playerOddsForTeam,
  buildFirstScorerOdds,
};

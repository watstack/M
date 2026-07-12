import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const {
  tallyFirstScorers,
  teamFirstGoalProbabilities,
  teamFirstGoalProbabilitiesFromAvgGoals,
  playerOddsForTeam,
  buildFirstScorerOdds,
} = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'api', '_lib', 'scorer-model.js'));

describe('tallyFirstScorers', () => {
  it('tallies first-scorer and total-goal counts per team, ignoring other teams', () => {
    const matches = [
      {
        home_tla: 'FRA', home_id: '1', away_tla: 'SEN', away_id: '2',
        goals: [
          { minute: 60, scorer: { name: 'Late Sub' }, team: { id: '1' } },
          { minute: 10, scorer: { name: 'Early Striker' }, team: { id: '1' } },
          { minute: 30, scorer: { name: 'Opponent' }, team: { id: '2' } },
        ],
      },
      {
        home_tla: 'IRQ', home_id: '3', away_tla: 'FRA', away_id: '1',
        goals: [
          { minute: 20, scorer: { name: 'Early Striker' }, team: { id: '1' } },
        ],
      },
    ];
    const tallies = tallyFirstScorers(matches, ['FRA']);
    expect(tallies.FRA.gamesPlayed).toBe(2);
    expect(tallies.FRA.goalsScored).toBe(3);
    expect(tallies.FRA.firstScorerCounts).toEqual({ 'Early Striker': 2 });
    expect(tallies.FRA.totalGoalCounts).toEqual({ 'Early Striker': 2, 'Late Sub': 1 });
  });

  it('counts a game with zero goals scored towards gamesPlayed but not goal tallies', () => {
    const matches = [{ home_tla: 'ENG', home_id: '1', away_tla: 'GHA', away_id: '2', goals: [] }];
    const tallies = tallyFirstScorers(matches, ['ENG']);
    expect(tallies.ENG.gamesPlayed).toBe(1);
    expect(tallies.ENG.goalsScored).toBe(0);
    expect(tallies.ENG.firstScorerCounts).toEqual({});
  });

  it('excludes goals with no named scorer (own goals / unknown)', () => {
    const matches = [{
      home_tla: 'ARG', home_id: '1', away_tla: 'ALG', away_id: '2',
      goals: [{ minute: 5, scorer: { name: '' }, team: { id: '1' } }],
    }];
    const tallies = tallyFirstScorers(matches, ['ARG']);
    expect(tallies.ARG.goalsScored).toBe(0);
    expect(tallies.ARG.firstScorerCounts).toEqual({});
  });

  it('ignores teams not in the requested teamCodes list', () => {
    const matches = [{
      home_tla: 'MEX', home_id: '1', away_tla: 'ENG', away_id: '2',
      goals: [{ minute: 5, scorer: { name: 'X' }, team: { id: '1' } }],
    }];
    const tallies = tallyFirstScorers(matches, ['ENG']);
    expect(tallies).toEqual({ ENG: { firstScorerCounts: {}, totalGoalCounts: {}, gamesPlayed: 1, goalsScored: 0 } });
  });
});

describe('teamFirstGoalProbabilities', () => {
  it('normalizes home/away implied probabilities, excluding the draw price', () => {
    const result = teamFirstGoalProbabilities({ home: 2, away: 4 });
    expect(result.home).toBeCloseTo(0.6667, 3);
    expect(result.away).toBeCloseTo(0.3333, 3);
  });

  it('returns null when odds are missing', () => {
    expect(teamFirstGoalProbabilities(null)).toBeNull();
  });

  it('returns null when a price is not a valid decimal odd (<=1)', () => {
    expect(teamFirstGoalProbabilities({ home: 1, away: 3 })).toBeNull();
  });
});

describe('teamFirstGoalProbabilitiesFromAvgGoals', () => {
  it('splits proportionally to average goals scored', () => {
    const result = teamFirstGoalProbabilitiesFromAvgGoals(2, 1);
    expect(result.home).toBeCloseTo(0.6667, 3);
    expect(result.away).toBeCloseTo(0.3333, 3);
  });

  it('floors at 0.01 so a team with zero average goals still gets a nonzero share', () => {
    const result = teamFirstGoalProbabilitiesFromAvgGoals(0, 1);
    expect(result.home).toBeGreaterThan(0);
    expect(result.home).toBeLessThan(result.away);
  });
});

describe('playerOddsForTeam', () => {
  it('splits team probability across firstScorerCounts when there is enough data (>=2 total)', () => {
    const tally = { firstScorerCounts: { A: 3, B: 1 }, totalGoalCounts: { A: 5, B: 2 } };
    const prices = playerOddsForTeam(tally, 0.5, 1);
    expect(prices).toEqual({ A: 3.14, B: 9.41, 'Any Other Player': 13.33 });
  });

  it('falls back to totalGoalCounts when firstScorerCounts is too sparse (<2 total)', () => {
    const tally = { firstScorerCounts: { A: 1 }, totalGoalCounts: { A: 2, B: 3 } };
    const prices = playerOddsForTeam(tally, 0.4, 1);
    expect(prices).toEqual({ A: 7.35, B: 4.9, 'Any Other Player': 16.67 });
  });

  it('puts all probability mass on "Any Other Player" when there is no scorer data at all', () => {
    const tally = { firstScorerCounts: {}, totalGoalCounts: {} };
    const prices = playerOddsForTeam(tally, 0.6, 1);
    expect(prices).toEqual({ 'Any Other Player': 1.67 });
  });

  it('applies the margin multiplier when converting probability to price', () => {
    const tally = { firstScorerCounts: { Only: 5 }, totalGoalCounts: { Only: 5 } };
    const prices = playerOddsForTeam(tally, 0.5, 1.07);
    expect(prices).toEqual({ Only: 2.2, 'Any Other Player': 12.46 });
  });
});

describe('buildFirstScorerOdds', () => {
  it('merges both teams\' player odds and takes the lower "Any Other Player" price', () => {
    const homeTally = { firstScorerCounts: { X: 2 }, totalGoalCounts: { X: 2 } };
    const awayTally = { firstScorerCounts: { Y: 1 }, totalGoalCounts: { Y: 3 } };
    const odds = buildFirstScorerOdds({
      homeTally, awayTally,
      teamProbabilities: { home: 0.6, away: 0.4 },
      marginMultiplier: 1,
    });
    expect(odds.X).toBe(1.96);
    expect(odds.Y).toBe(2.94);
    expect(odds['Any Other Player']).toBe(11.11);
  });
});

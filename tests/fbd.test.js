import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const { normalizeFBDMatch } = require(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'api', '_lib', 'fbd.js')
);

function baseMatch(overrides) {
  return {
    id: 1,
    utcDate: '2026-07-03T18:00:00Z',
    status: 'FINISHED',
    homeTeam: { tla: 'ARG', id: 762 },
    awayTeam: { tla: 'CPV', id: 1930 },
    goals: [],
    ...overrides,
  };
}

describe('normalizeFBDMatch: regulation-score fallback', () => {
  it('uses fullTime as the regulation score for a match decided in regulation', () => {
    const m = baseMatch({ score: { fullTime: { home: 2, away: 1 }, duration: 'REGULAR' } });
    const row = normalizeFBDMatch(m);
    expect(row.home_score_reg).toBe(2);
    expect(row.away_score_reg).toBe(1);
  });

  it('uses score.regularTime when the API supplies it for an extra-time match', () => {
    const m = baseMatch({
      score: { fullTime: { home: 3, away: 2 }, regularTime: { home: 1, away: 1 }, duration: 'EXTRA_TIME' },
    });
    const row = normalizeFBDMatch(m);
    expect(row.home_score_reg).toBe(1);
    expect(row.away_score_reg).toBe(1);
    expect(row.home_score).toBe(3);
    expect(row.away_score).toBe(2);
  });

  it('regression: does NOT mask a missing regularTime with fullTime when duration is EXTRA_TIME', () => {
    // Reported bug: Argentina 3-2 Cape Verde after ET (1-1 after 90 mins).
    // football-data.org didn't supply score.regularTime for this match, and
    // the old fallback (`?? fullTime`) silently asserted the ET-inclusive
    // score as the regulation score, causing match_result to settle "home"
    // instead of "draw".
    const m = baseMatch({
      score: { fullTime: { home: 3, away: 2 }, duration: 'EXTRA_TIME' },
    });
    const row = normalizeFBDMatch(m);
    expect(row.home_score_reg).toBeNull();
    expect(row.away_score_reg).toBeNull();
    expect(row.home_score).toBe(3);
    expect(row.away_score).toBe(2);
  });

  it('does not mask a missing regularTime with fullTime for a penalties match either', () => {
    const m = baseMatch({ score: { fullTime: { home: 1, away: 0 }, duration: 'PENALTIES' } });
    const row = normalizeFBDMatch(m);
    expect(row.home_score_reg).toBeNull();
    expect(row.away_score_reg).toBeNull();
  });
});

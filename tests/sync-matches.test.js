import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const { mergeGoalsFromESPN } = require(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'api', '_lib', 'sync-matches.js')
);

describe('mergeGoalsFromESPN', () => {
  it('fills in goals from ESPN when FBD returned an empty goals array for a finished match', () => {
    const fbdMatches = [
      {
        id: 'ARG-CPV-2026-07-03', status: 'FINISHED', utc_date: '2026-07-03T18:00:00Z',
        home_score: 2, away_score: 1, goals: [],
      },
    ];
    const espnMatches = [
      {
        id: 'ARG-CPV-2026-07-03', status: 'FINISHED',
        goals: [{ minute: 12, scorer: { name: 'Messi' }, team: { id: '1' } }],
      },
    ];

    const result = mergeGoalsFromESPN(fbdMatches, espnMatches);

    expect(result[0].goals).toEqual([{ minute: 12, scorer: { name: 'Messi' }, team: { id: '1' } }]);
    expect(result[0].home_score).toBe(2); // FBD score fields untouched
    expect(result[0].away_score).toBe(1);
  });

  it('never overwrites a non-empty FBD goals array with ESPN data', () => {
    const fbdGoals = [{ minute: 5, scorer: { name: 'FBD Scorer' }, team: { id: '1' } }];
    const fbdMatches = [
      { id: 'ARG-CPV-2026-07-03', status: 'FINISHED', utc_date: '2026-07-03T18:00:00Z', goals: fbdGoals },
    ];
    const espnMatches = [
      { id: 'ARG-CPV-2026-07-03', status: 'FINISHED', goals: [{ minute: 99, scorer: { name: 'Wrong' }, team: { id: '2' } }] },
    ];

    const result = mergeGoalsFromESPN(fbdMatches, espnMatches);

    expect(result[0].goals).toBe(fbdGoals);
  });

  it('does not touch matches that are not yet finished, even with empty goals', () => {
    const fbdMatches = [
      { id: 'ARG-CPV-2026-07-03', status: 'SCHEDULED', utc_date: '2026-07-03T18:00:00Z', goals: [] },
    ];
    const espnMatches = [
      { id: 'ARG-CPV-2026-07-03', status: 'SCHEDULED', goals: [{ minute: 12, scorer: { name: 'Messi' }, team: { id: '1' } }] },
    ];

    const result = mergeGoalsFromESPN(fbdMatches, espnMatches);

    expect(result[0].goals).toEqual([]);
  });

  it('leaves goals empty when ESPN also has nothing for that match', () => {
    const fbdMatches = [
      { id: 'ARG-CPV-2026-07-03', status: 'FINISHED', utc_date: '2026-07-03T18:00:00Z', goals: [] },
    ];

    const result = mergeGoalsFromESPN(fbdMatches, []);

    expect(result[0].goals).toEqual([]);
  });

  it('leaves goals empty when ESPN has the match but with no named goal events', () => {
    const fbdMatches = [
      { id: 'ARG-CPV-2026-07-03', status: 'FINISHED', utc_date: '2026-07-03T18:00:00Z', goals: [] },
    ];
    const espnMatches = [{ id: 'ARG-CPV-2026-07-03', status: 'FINISHED', goals: [] }];

    const result = mergeGoalsFromESPN(fbdMatches, espnMatches);

    expect(result[0].goals).toEqual([]);
  });
});

describe('enrichGoalsFromESPN', () => {
  it('skips the ESPN fetch entirely when no match needs enrichment (no network call, no dependency needed)', async () => {
    const { enrichGoalsFromESPN } = require(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'api', '_lib', 'sync-matches.js')
    );
    const fbdGoals = [{ minute: 5, scorer: { name: 'FBD Scorer' }, team: { id: '1' } }];
    const fbdMatches = [
      { id: 'ARG-CPV-2026-07-03', status: 'FINISHED', utc_date: '2026-07-03T18:00:00Z', goals: fbdGoals },
      { id: 'ESP-FRA-2026-07-04', status: 'SCHEDULED', utc_date: '2026-07-04T18:00:00Z', goals: [] },
    ];

    const result = await enrichGoalsFromESPN(fbdMatches);

    expect(result).toEqual(fbdMatches);
  });
});

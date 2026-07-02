import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const { regulationScore, advancingSide } = require(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'api', '_lib', 'settle-lib.js')
);

describe('regulationScore', () => {
  it('falls back to the final score when no reg fields or goals are present (group stage)', () => {
    const wc = { home_score: 2, away_score: 1, home_score_reg: null, away_score_reg: null, goals: [] };
    expect(regulationScore(wc)).toEqual({ home: 2, away: 1, source: 'final_score_assumed' });
  });

  it('uses home_score_reg/away_score_reg when present, even if it differs from the final score', () => {
    const wc = {
      home_score: 2, away_score: 1,
      home_score_reg: 1, away_score_reg: 1,
      goals: [],
    };
    expect(regulationScore(wc)).toEqual({ home: 1, away: 1, source: 'reg_field' });
  });

  it('reconstructs the regulation score from goals when reg fields are absent', () => {
    const wc = {
      home_score: 2, away_score: 1,
      home_score_reg: null, away_score_reg: null,
      home_id: 'H', away_id: 'A',
      goals: [
        { minute: 10, team: { id: 'H' } },
        { minute: 88, team: { id: 'A' } },
        { minute: 105, team: { id: 'H' } }, // extra-time goal, excluded
      ],
    };
    expect(regulationScore(wc)).toEqual({ home: 1, away: 1, source: 'goals' });
  });

  it('parses goals when stored as a JSON string', () => {
    const wc = {
      home_score: 1, away_score: 0,
      home_score_reg: null, away_score_reg: null,
      home_id: 'H', away_id: 'A',
      goals: JSON.stringify([{ minute: 50, team: { id: 'H' } }]),
    };
    expect(regulationScore(wc)).toEqual({ home: 1, away: 0, source: 'goals' });
  });

  it('falls back to final-score-assumed when neither reg fields nor goals are available', () => {
    const wc = {
      home_score: 2, away_score: 1,
      home_score_reg: null, away_score_reg: null,
      home_id: 'H', away_id: 'A',
      goals: [],
    };
    expect(regulationScore(wc)).toEqual({ home: 2, away: 1, source: 'final_score_assumed' });
  });
});

describe('advancingSide', () => {
  it('returns "home" when the final score favors home', () => {
    expect(advancingSide({ home_score: 2, away_score: 1 })).toBe('home');
  });

  it('returns "away" when the final score favors away', () => {
    expect(advancingSide({ home_score: 1, away_score: 2 })).toBe('away');
  });

  it('returns null when the final score is level (shootout unresolved)', () => {
    expect(advancingSide({ home_score: 1, away_score: 1 })).toBeNull();
  });

  it('returns null when scores are missing', () => {
    expect(advancingSide({ home_score: null, away_score: null })).toBeNull();
  });
});

describe('regression: knockout 90-min draw decided in extra time', () => {
  // Reported bug: a knockout match level 1-1 after 90 minutes, won 2-1 after
  // extra time, was graded as a match_result LOSS for "draw" bettors instead
  // of a WIN, because settlement used the ET-inclusive final score directly.
  const wc = {
    home_score: 2, away_score: 1, // final score, includes the ET winner
    home_score_reg: 1, away_score_reg: 1, // 90-minute score: a draw
    home_id: 'H', away_id: 'A',
    goals: [],
  };

  it('grades match_result as "draw" (regulation-time score), not "home"', () => {
    const reg = regulationScore(wc);
    const matchResult = reg.home > reg.away ? 'home' : reg.away > reg.home ? 'away' : 'draw';
    expect(matchResult).toBe('draw');
  });

  it('grades qualify to the actual ET winner ("home")', () => {
    expect(advancingSide(wc)).toBe('home');
  });
});

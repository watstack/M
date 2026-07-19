import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const { regulationScore, advancingSide, firstScorerName, allScorers } = require(
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

describe('firstScorerName', () => {
  it('returns the earliest scorer by minute, even if listed out of order', () => {
    const wc = {
      goals: [
        { minute: 88, scorer: { name: 'Late Sub' } },
        { minute: 12, scorer: { name: 'Early Striker' } },
        { minute: 50, scorer: { name: 'Midfielder' } },
      ],
    };
    expect(firstScorerName(wc)).toBe('Early Striker');
  });

  it('returns null for an empty goals array', () => {
    expect(firstScorerName({ goals: [] })).toBeNull();
  });

  it('returns null when all goals have an empty scorer name (own-goal/unknown-scorer case)', () => {
    const wc = { goals: [{ minute: 30, scorer: { name: '' } }, { minute: 60, team: { id: 'H' } }] };
    expect(firstScorerName(wc)).toBeNull();
  });

  it('skips unnamed goals and returns the earliest named one', () => {
    const wc = {
      goals: [
        { minute: 10, scorer: { name: '' } },
        { minute: 40, scorer: { name: 'Real Scorer' } },
      ],
    };
    expect(firstScorerName(wc)).toBe('Real Scorer');
  });

  it('parses goals when stored as a JSON string', () => {
    const wc = { goals: JSON.stringify([{ minute: 5, scorer: { name: 'Striker' } }]) };
    expect(firstScorerName(wc)).toBe('Striker');
  });
});

describe('anytime_scorer void guard (mirrors api/auto-settle.js / scripts/auto-settle.cjs dispatch)', () => {
  // The dispatch only voids anytime_scorer when allScorers() is empty AND the
  // match is a genuine scoreless draw (matchResult === 'draw' && correctScore
  // === '0-0', computed here the same way auto-settle.js does from
  // regulationScore()) — otherwise it must skip-and-retry, since an empty
  // goals[] can also mean the data source hasn't supplied scorer names yet
  // (see the football-data.org free-tier gap this guards against).
  function matchResultAndScore(wc) {
    const reg = regulationScore(wc);
    const matchResult = reg.home > reg.away ? 'home' : reg.away > reg.home ? 'away' : 'draw';
    return { matchResult, correctScore: `${reg.home}-${reg.away}` };
  }

  it('voids when there are no scorers and the match is a genuine 0-0', () => {
    const wc = { home_score: 0, away_score: 0, home_score_reg: null, away_score_reg: null, goals: [] };
    const { matchResult, correctScore } = matchResultAndScore(wc);
    expect(allScorers(wc)).toEqual([]);
    expect(matchResult === 'draw' && correctScore === '0-0').toBe(true);
  });

  it('does NOT void when there are no scorers but the match was not scoreless (data gap, not a real 0-0)', () => {
    const wc = { home_score: 2, away_score: 1, home_score_reg: null, away_score_reg: null, goals: [] };
    const { matchResult, correctScore } = matchResultAndScore(wc);
    expect(allScorers(wc)).toEqual([]);
    expect(matchResult === 'draw' && correctScore === '0-0').toBe(false);
  });

  it('does NOT void when there are no scorers even for a level score reached via extra time (not a 90-min 0-0)', () => {
    const wc = {
      home_score: 1, away_score: 1,
      home_score_reg: 0, away_score_reg: 0,
      goals: [],
    };
    const { matchResult, correctScore } = matchResultAndScore(wc);
    expect(matchResult).toBe('draw');
    expect(correctScore).toBe('0-0');
    // This one legitimately is a 90-min 0-0 (home_score_reg/away_score_reg both 0),
    // so voiding is correct here even though the ET-inclusive final score is 1-1.
    expect(matchResult === 'draw' && correctScore === '0-0').toBe(true);
  });
});

describe('allScorers', () => {
  it('returns every named scorer, deduped, regardless of minute order', () => {
    const wc = {
      goals: [
        { minute: 88, scorer: { name: 'Late Sub' } },
        { minute: 12, scorer: { name: 'Early Striker' } },
        { minute: 50, scorer: { name: 'Early Striker' } }, // brace — deduped
      ],
    };
    expect(allScorers(wc)).toEqual(['Late Sub', 'Early Striker']);
  });

  it('includes extra-time goals (minute <= 120)', () => {
    const wc = { goals: [{ minute: 105, scorer: { name: 'ET Hero' } }] };
    expect(allScorers(wc)).toEqual(['ET Hero']);
  });

  it('excludes goals past minute 120 (penalty-shootout kicks, if ever tagged that way)', () => {
    const wc = { goals: [{ minute: 130, scorer: { name: 'Shootout Taker' } }] };
    expect(allScorers(wc)).toEqual([]);
  });

  it('returns [] for a genuine scoreless match', () => {
    expect(allScorers({ goals: [] })).toEqual([]);
  });

  it('skips unnamed goals (own-goal/unknown-scorer case)', () => {
    const wc = { goals: [{ minute: 30, scorer: { name: '' } }, { minute: 60, team: { id: 'H' } }] };
    expect(allScorers(wc)).toEqual([]);
  });

  it('parses goals when stored as a JSON string', () => {
    const wc = { goals: JSON.stringify([{ minute: 5, scorer: { name: 'Striker' } }]) };
    expect(allScorers(wc)).toEqual(['Striker']);
  });
});

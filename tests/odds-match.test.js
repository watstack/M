import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const { firstScorerOddsForFixture, h2hOddsForFixture } = require(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'api', '_lib', 'odds-match.js')
);

const fixture = { home: { code: 'FRA' }, away: { code: 'ARG' } };

describe('firstScorerOddsForFixture', () => {
  it('matches when the event lists teams in the same order as the fixture', () => {
    const events = [{ home_team: 'France', away_team: 'Argentina', players: [
      { name: 'Kylian Mbappe', price: 4.5 },
      { name: 'Lionel Messi', price: 6 },
    ] }];
    expect(firstScorerOddsForFixture(events, fixture)).toEqual({
      'Kylian Mbappe': 4.5, 'Lionel Messi': 6,
    });
  });

  it('matches when the event lists teams swapped relative to the fixture', () => {
    const events = [{ home_team: 'Argentina', away_team: 'France', players: [
      { name: 'Lionel Messi', price: 6 },
    ] }];
    expect(firstScorerOddsForFixture(events, fixture)).toEqual({ 'Lionel Messi': 6 });
  });

  it('returns null when neither side resolves via TEAM_ALIAS', () => {
    const events = [{ home_team: 'Wakanda', away_team: 'Narnia', players: [{ name: 'X', price: 2 }] }];
    expect(firstScorerOddsForFixture(events, fixture)).toBeNull();
  });

  it('returns null when no event matches the fixture at all', () => {
    const events = [{ home_team: 'Germany', away_team: 'Spain', players: [{ name: 'X', price: 2 }] }];
    expect(firstScorerOddsForFixture(events, fixture)).toBeNull();
  });

  it('returns null when the fixture has no resolved team codes (unresolved KO slot)', () => {
    const events = [{ home_team: 'France', away_team: 'Argentina', players: [{ name: 'X', price: 2 }] }];
    expect(firstScorerOddsForFixture(events, { home: {}, away: {} })).toBeNull();
  });

  it('returns null for a matched event with an empty players list', () => {
    const events = [{ home_team: 'France', away_team: 'Argentina', players: [] }];
    expect(firstScorerOddsForFixture(events, fixture)).toBeNull();
  });

  it('drops entries missing a name or price', () => {
    const events = [{ home_team: 'France', away_team: 'Argentina', players: [
      { name: 'Kylian Mbappe', price: 4.5 },
      { name: '', price: 10 },
      { name: 'No Price', price: null },
    ] }];
    expect(firstScorerOddsForFixture(events, fixture)).toEqual({ 'Kylian Mbappe': 4.5 });
  });
});

describe('h2hOddsForFixture (regression check — unchanged by first-scorer additions)', () => {
  it('still matches team-result odds independently of scorer odds', () => {
    const events = [{
      home_team: 'France', away_team: 'Argentina',
      bookmakers: [{ markets: [{ key: 'h2h', outcomes: [
        { name: 'France', price: 2.1 }, { name: 'Draw', price: 3.4 }, { name: 'Argentina', price: 3.2 },
      ] }] }],
    }];
    expect(h2hOddsForFixture(events, fixture)).toEqual({ home: 2.1, draw: 3.4, away: 3.2 });
  });
});

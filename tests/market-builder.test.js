import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const { buildMarketRows } = require(join(here, '..', 'api', '_lib', 'market-builder.js'));
// Same module instance market-builder.js itself requires (Node's require cache
// is keyed by resolved path), so mutating this array is visible to buildMarketRows.
const fixturesModule = require(join(here, '..', 'api', '_lib', 'fixtures.js'));

const TEST_MATCH_NO = 90001;

function pushFakeFixture(overrides) {
  const fx = {
    match_no: TEST_MATCH_NO,
    stage: 'sf',
    group: null,
    matchday: null,
    kickoff_utc: '2026-07-14T19:00:00Z',
    venue: 'Test Stadium',
    home: { slot: 'W97', label: 'Winner Match 97' },
    away: { slot: 'W98', label: 'Winner Match 98' },
    ...overrides,
  };
  fixturesModule.WC2026_FIXTURES.push(fx);
  return fx;
}

afterEach(() => {
  const arr = fixturesModule.WC2026_FIXTURES;
  const idx = arr.findIndex(f => f.match_no === TEST_MATCH_NO);
  if (idx !== -1) arr.splice(idx, 1);
});

const scorerEvents = [
  { home_team: 'France', away_team: 'Argentina', players: [{ name: 'Kylian Mbappe', price: 4.5 }] },
];

describe('buildMarketRows: first_scorer market', () => {
  it('gives a resolved sf-stage fixture a first_scorer row with matched odds', () => {
    pushFakeFixture({ home: { code: 'FRA' }, away: { code: 'ARG' } });
    const { groupRows, koRows } = buildMarketRows('t1', null, scorerEvents, '2026-07-12T00:00:00Z');
    const row = groupRows.find(r => r.match_no === TEST_MATCH_NO && r.market_type === 'first_scorer');
    expect(row).toBeTruthy();
    expect(row.odds_json).toEqual({ 'Kylian Mbappe': 4.5 });
    expect(row.odds_fetched_at).toBe('2026-07-12T00:00:00Z');
    expect(koRows.some(r => r.match_no === TEST_MATCH_NO)).toBe(false);
  });

  it('gives a resolved sf-stage fixture a locked scaffold row when no scorer odds match', () => {
    pushFakeFixture({ home: { code: 'FRA' }, away: { code: 'ARG' } });
    const { groupRows } = buildMarketRows('t1', null, [], '2026-07-12T00:00:00Z');
    const row = groupRows.find(r => r.match_no === TEST_MATCH_NO && r.market_type === 'first_scorer');
    expect(row).toBeTruthy();
    expect('odds_json' in row).toBe(false);
  });

  it('does not give a resolved non-sf fixture a first_scorer row', () => {
    pushFakeFixture({ stage: 'qf', home: { code: 'FRA' }, away: { code: 'ARG' } });
    const { groupRows } = buildMarketRows('t1', null, scorerEvents, '2026-07-12T00:00:00Z');
    expect(groupRows.some(r => r.match_no === TEST_MATCH_NO && r.market_type === 'first_scorer')).toBe(false);
  });

  it('gives an unresolved sf-stage fixture a locked first_scorer scaffold with no odds_json', () => {
    pushFakeFixture(); // default: unresolved slots
    const { koRows, groupRows } = buildMarketRows('t1', null, scorerEvents, '2026-07-12T00:00:00Z');
    const row = koRows.find(r => r.match_no === TEST_MATCH_NO && r.market_type === 'first_scorer');
    expect(row).toBeTruthy();
    expect(row.locked).toBe(true);
    expect('odds_json' in row).toBe(false);
    expect(groupRows.some(r => r.match_no === TEST_MATCH_NO)).toBe(false);
  });

  it('does not give an unresolved non-sf knockout fixture a first_scorer scaffold', () => {
    pushFakeFixture({ stage: 'qf' }); // default: unresolved slots
    const { koRows } = buildMarketRows('t1', null, scorerEvents, '2026-07-12T00:00:00Z');
    expect(koRows.some(r => r.match_no === TEST_MATCH_NO && r.market_type === 'first_scorer')).toBe(false);
  });
});

describe('buildMarketRows: anytime_scorer market', () => {
  it('gives a resolved sf-stage fixture an anytime_scorer row with the static merged odds map', () => {
    pushFakeFixture({ home: { code: 'FRA' }, away: { code: 'ESP' } });
    const { groupRows, koRows } = buildMarketRows('t1', null, null, '2026-07-12T00:00:00Z');
    const row = groupRows.find(r => r.match_no === TEST_MATCH_NO && r.market_type === 'anytime_scorer');
    expect(row).toBeTruthy();
    expect(row.odds_json['Kylian Mbappe']).toBe(2.00);
    expect(row.odds_json['Mikel Oyarzabal']).toBe(2.88);
    expect(row.odds_fetched_at).toBe('2026-07-12T00:00:00Z');
    expect(koRows.some(r => r.match_no === TEST_MATCH_NO)).toBe(false);
  });

  it('gives the other sf pairing (ENG v ARG) its own merged odds map', () => {
    pushFakeFixture({ home: { code: 'ENG' }, away: { code: 'ARG' } });
    const { groupRows } = buildMarketRows('t1', null, null, '2026-07-12T00:00:00Z');
    const row = groupRows.find(r => r.match_no === TEST_MATCH_NO && r.market_type === 'anytime_scorer');
    expect(row).toBeTruthy();
    expect(row.odds_json['Harry Kane']).toBe(2.30);
    expect(row.odds_json['Lionel Messi']).toBe(2.30);
  });

  it('gives a resolved sf-stage fixture with no matching static odds a locked scaffold row', () => {
    pushFakeFixture({ home: { code: 'FRA' }, away: { code: 'ARG' } }); // not a static-odds pairing
    const { groupRows } = buildMarketRows('t1', null, null, '2026-07-12T00:00:00Z');
    const row = groupRows.find(r => r.match_no === TEST_MATCH_NO && r.market_type === 'anytime_scorer');
    expect(row).toBeTruthy();
    expect('odds_json' in row).toBe(false);
  });

  it('does not give a resolved non-sf fixture an anytime_scorer row', () => {
    pushFakeFixture({ stage: 'qf', home: { code: 'FRA' }, away: { code: 'ESP' } });
    const { groupRows } = buildMarketRows('t1', null, null, '2026-07-12T00:00:00Z');
    expect(groupRows.some(r => r.match_no === TEST_MATCH_NO && r.market_type === 'anytime_scorer')).toBe(false);
  });

  it('gives an unresolved sf-stage fixture a locked anytime_scorer scaffold with no odds_json', () => {
    pushFakeFixture(); // default: unresolved slots
    const { koRows, groupRows } = buildMarketRows('t1', null, null, '2026-07-12T00:00:00Z');
    const row = koRows.find(r => r.match_no === TEST_MATCH_NO && r.market_type === 'anytime_scorer');
    expect(row).toBeTruthy();
    expect(row.locked).toBe(true);
    expect('odds_json' in row).toBe(false);
    expect(groupRows.some(r => r.match_no === TEST_MATCH_NO)).toBe(false);
  });

  it('does not give an unresolved non-sf knockout fixture an anytime_scorer scaffold', () => {
    pushFakeFixture({ stage: 'qf' }); // default: unresolved slots
    const { koRows } = buildMarketRows('t1', null, null, '2026-07-12T00:00:00Z');
    expect(koRows.some(r => r.match_no === TEST_MATCH_NO && r.market_type === 'anytime_scorer')).toBe(false);
  });
});

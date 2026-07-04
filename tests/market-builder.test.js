import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const libDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'api', '_lib');
const { buildMarketRows } = require(join(libDir, 'market-builder.js'));
const { WC2026_FIXTURES } = require(join(libDir, 'fixtures.js'));

const TOURNAMENT_ID = 't1';

// Match 89 (Round of 16) ships in the static fixture list as an unresolved
// "Winner Match 74 vs Winner Match 77" slot — no team codes until the R32
// feeder matches are settled.
const R16_MATCH_NO = WC2026_FIXTURES.find(fx => fx.stage === 'r16').match_no;

describe('buildMarketRows knockout resolution', () => {
  it('treats an unresolved knockout slot as locked with no odds, absent an override', () => {
    const { groupRows, koRows } = buildMarketRows(TOURNAMENT_ID, [], null);
    const koMarkets = koRows.filter(r => r.match_no === R16_MATCH_NO);
    expect(koMarkets.length).toBeGreaterThan(0);
    expect(koMarkets.every(r => r.locked === true)).toBe(true);
    expect(groupRows.some(r => r.match_no === R16_MATCH_NO)).toBe(false);
  });

  it('resolves a knockout slot via resolvedCodes and matches its odds', () => {
    const h2hEvents = [{
      home_team: 'France',
      away_team: 'Paraguay',
      bookmakers: [{
        markets: [{
          key: 'h2h',
          outcomes: [
            { name: 'France', price: 1.5 },
            { name: 'Draw', price: 4.2 },
            { name: 'Paraguay', price: 6.0 },
          ],
        }],
      }],
    }];
    const resolvedCodes = { [R16_MATCH_NO]: { homeCode: 'PAR', awayCode: 'FRA' } };

    const { groupRows, koRows, oddsMatched } = buildMarketRows(TOURNAMENT_ID, h2hEvents, '2026-07-04T06:00:00Z', resolvedCodes);

    expect(koRows.some(r => r.match_no === R16_MATCH_NO)).toBe(false);
    const mr = groupRows.find(r => r.match_no === R16_MATCH_NO && r.market_type === 'match_result');
    expect(mr.locked).toBe(false);
    expect(mr.match_name).toBe('Paraguay vs France');
    expect(mr.odds_json).toEqual({ home: 6, draw: 4.2, away: 1.5 });
    expect(oddsMatched).toBeGreaterThan(0);
  });
});

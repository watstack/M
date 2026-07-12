import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const {
  fetchTeamOdds, fetchFirstScorerOdds,
  extractEmbeddedJson, parsePrice, parseMatchWinnerPage, parseFirstScorerSection,
  extractTeamsFromPage, stripTrailingFurniture, _resetCacheForTests,
} = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'api', '_lib', 'odds-source.js'));

const cheerio = require('cheerio');

beforeEach(() => {
  _resetCacheForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parsePrice', () => {
  it('parses plain decimal odds', () => {
    expect(parsePrice('2.10')).toBe(2.1);
  });
  it('parses fractional odds and converts to decimal (confirmed live format, e.g. "6/5")', () => {
    expect(parsePrice('17/20')).toBe(1.85);
    expect(parsePrice('6/5')).toBe(2.2);
  });
  it('returns null for odds <= 1.0 (not valid decimal odds)', () => {
    expect(parsePrice('0.50')).toBeNull();
  });
  it('returns null for non-numeric junk', () => {
    expect(parsePrice('SUSP')).toBeNull();
    expect(parsePrice('')).toBeNull();
    expect(parsePrice(undefined)).toBeNull();
  });
});

describe('extractEmbeddedJson', () => {
  it('parses a __NEXT_DATA__ script blob', () => {
    const html = `<html><body><script id="__NEXT_DATA__" type="application/json">{"props":{"a":1}}</script></body></html>`;
    expect(extractEmbeddedJson(html)).toEqual({ props: { a: 1 } });
  });
  it('returns null when no embedded JSON is present', () => {
    expect(extractEmbeddedJson('<html><body>plain page</body></html>')).toBeNull();
  });
  it('returns null when the embedded blob is malformed JSON', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">{not valid json</script>`;
    expect(extractEmbeddedJson(html)).toBeNull();
  });
});

describe('stripTrailingFurniture', () => {
  it('strips " - Odds Comparison" style suffixes', () => {
    expect(stripTrailingFurniture('France v Argentina - Odds Comparison')).toBe('France v Argentina');
  });
  it('strips a trailing "Betting Odds" suffix (confirmed live H1 format)', () => {
    expect(stripTrailingFurniture('France vs Spain Betting Odds')).toBe('France vs Spain');
  });
});

describe('extractTeamsFromPage', () => {
  it('extracts teams from <title> using " v " separator', () => {
    const $ = cheerio.load('<html><head><title>France v Argentina - Odds Comparison</title></head></html>');
    expect(extractTeamsFromPage($)).toEqual({ home: 'France', away: 'Argentina' });
  });
  it('extracts teams from <h1> using " vs " separator and "Betting Odds" suffix (confirmed live format)', () => {
    const $ = cheerio.load('<html><head><title>Home</title></head><body><h1>France vs Spain Betting Odds</h1></body></html>');
    expect(extractTeamsFromPage($)).toEqual({ home: 'France', away: 'Spain' });
  });
  it('returns null when neither title nor h1 match', () => {
    const $ = cheerio.load('<html><head><title>Home</title></head><body></body></html>');
    expect(extractTeamsFromPage($)).toBeNull();
  });
});

describe('parseMatchWinnerPage', () => {
  const html = `<html><head><title>France v Argentina - Odds Comparison</title></head>
    <body><table>
      <tr><td>France</td><td>2.10</td><td>2.05</td></tr>
      <tr><td>Draw</td><td>3.40</td><td>3.30</td></tr>
      <tr><td>Argentina</td><td>3.20</td><td>3.10</td></tr>
    </table></body></html>`;

  it('extracts home/draw/away best prices into an Odds-API-shaped event', () => {
    const ev = parseMatchWinnerPage(html);
    expect(ev.home_team).toBe('France');
    expect(ev.away_team).toBe('Argentina');
    const outcomes = ev.bookmakers[0].markets[0].outcomes;
    expect(outcomes.find(o => o.name === 'France').price).toBe(2.1);
    expect(outcomes.find(o => o.name === 'Draw').price).toBe(3.4);
    expect(outcomes.find(o => o.name === 'Argentina').price).toBe(3.2);
  });

  it('extracts teams from an h1 using "vs" when the title has no match (confirmed live format)', () => {
    const h1Html = `<html><head><title>Home</title></head>
      <body><h1>France vs Argentina Betting Odds</h1><table>
        <tr><td>France</td><td>2.10</td></tr>
        <tr><td>Argentina</td><td>3.20</td></tr>
      </table></body></html>`;
    const ev = parseMatchWinnerPage(h1Html);
    expect(ev.home_team).toBe('France');
    expect(ev.away_team).toBe('Argentina');
  });

  it('returns null for a page with no recognizable title/team pattern', () => {
    expect(parseMatchWinnerPage('<html><head><title>Home</title></head><body></body></html>')).toBeNull();
  });

  it('returns null when team rows exist but no odds cells parse', () => {
    const badHtml = `<html><head><title>France v Argentina</title></head>
      <body><table><tr><td>France</td><td>SUSP</td></tr><tr><td>Argentina</td><td>SUSP</td></tr></table></body></html>`;
    expect(parseMatchWinnerPage(badHtml)).toBeNull();
  });
});

describe('parseFirstScorerSection', () => {
  it('extracts player name + best price rows beneath a First Goalscorer heading', () => {
    const html = `<html><body><div>
      <h2>First Goalscorer</h2>
      <table>
        <tr><td>Kylian Mbappe</td><td>4.50</td><td>4.33</td></tr>
        <tr><td>Ousmane Dembele</td><td>6.00</td></tr>
      </table>
    </div></body></html>`;
    const result = parseFirstScorerSection(html, 'France', 'Argentina');
    expect(result).toEqual({
      home_team: 'France',
      away_team: 'Argentina',
      players: [
        { name: 'Kylian Mbappe', price: 4.5 },
        { name: 'Ousmane Dembele', price: 6 },
      ],
    });
  });

  it('prefers "First Goalscorer" over "Anytime Goalscorer" when both sections are present (confirmed live: both can appear on one page)', () => {
    const html = `<html><body>
      <div>
        <h2>Anytime Goalscorer</h2>
        <table><tr><td>Kylian Mbappe</td><td>6/5</td></tr></table>
      </div>
      <div>
        <h2>First Goalscorer</h2>
        <table><tr><td>Kylian Mbappe</td><td>4.50</td></tr></table>
      </div>
    </body></html>`;
    const result = parseFirstScorerSection(html, 'France', 'Argentina');
    expect(result.players).toEqual([{ name: 'Kylian Mbappe', price: 4.5 }]);
  });

  it('falls back to "Anytime Goalscorer" when no First Goalscorer section exists', () => {
    const html = `<html><body><div>
      <h2>Anytime Goalscorer</h2>
      <table><tr><td>Kylian Mbappe</td><td>6/5</td></tr></table>
    </div></body></html>`;
    const result = parseFirstScorerSection(html, 'France', 'Argentina');
    expect(result.players).toEqual([{ name: 'Kylian Mbappe', price: 2.2 }]);
  });

  it('returns null when the page has no goalscorer market at all', () => {
    const html = `<html><body><div><h2>Match Betting</h2><table><tr><td>France</td><td>2.1</td></tr></table></div></body></html>`;
    expect(parseFirstScorerSection(html, 'France', 'Argentina')).toBeNull();
  });
});

describe('fetchTeamOdds / fetchFirstScorerOdds: fail-soft contract', () => {
  it('fetchTeamOdds resolves to [] (never throws) when the fixtures page fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(fetchTeamOdds()).resolves.toEqual([]);
  });

  it('fetchFirstScorerOdds resolves to [] (never throws) when the fixtures page fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(fetchFirstScorerOdds()).resolves.toEqual([]);
  });

  it('fetchTeamOdds resolves to [] when the fixtures page returns a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => '' }));
    await expect(fetchTeamOdds()).resolves.toEqual([]);
  });

  it('fetchTeamOdds skips a fixture page that fails to fetch and keeps going', async () => {
    const listHtml = `<html><body><a href="/football/world-cup/france-v-argentina/winner">France v Argentina</a></body></html>`;
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => listHtml })
      .mockRejectedValueOnce(new Error('match page down')));
    await expect(fetchTeamOdds()).resolves.toEqual([]);
  });

  it('discovers fixture links under the real /football/world-cup/{a}-v-{b}/{market} URL shape', async () => {
    const listHtml = `<html><body><a href="/football/world-cup/france-v-argentina/winner">France v Argentina</a></body></html>`;
    const matchHtml = `<html><head><title>France v Argentina</title></head>
      <body><table>
        <tr><td>France</td><td>2.10</td></tr>
        <tr><td>Draw</td><td>3.40</td></tr>
        <tr><td>Argentina</td><td>3.20</td></tr>
      </table></body></html>`;
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => listHtml })
      .mockResolvedValueOnce({ ok: true, text: async () => matchHtml }));
    const events = await fetchTeamOdds();
    expect(events).toHaveLength(1);
    expect(events[0].home_team).toBe('France');
    expect(events[0].away_team).toBe('Argentina');
  });

  it('fetches each fixture page only once total across both fetchTeamOdds and fetchFirstScorerOdds (shared scrape, confirmed live: tabs share one URL)', async () => {
    const listHtml = `<html><body><a href="/football/world-cup/france-v-argentina/winner">France v Argentina</a></body></html>`;
    const matchHtml = `<html><head><title>France v Argentina</title></head>
      <body><table>
        <tr><td>France</td><td>2.10</td></tr>
        <tr><td>Draw</td><td>3.40</td></tr>
        <tr><td>Argentina</td><td>3.20</td></tr>
      </table>
      <div>
        <h2>First Goalscorer</h2>
        <table><tr><td>Kylian Mbappe</td><td>4.50</td></tr></table>
      </div>
      </body></html>`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => listHtml })
      .mockResolvedValueOnce({ ok: true, text: async () => matchHtml });
    vi.stubGlobal('fetch', fetchMock);

    const teamEvents = await fetchTeamOdds();
    const scorerEvents = await fetchFirstScorerOdds();

    expect(fetchMock).toHaveBeenCalledTimes(2); // one for the hub page, one for the single fixture page
    expect(teamEvents).toHaveLength(1);
    expect(scorerEvents).toEqual([{
      home_team: 'France', away_team: 'Argentina',
      players: [{ name: 'Kylian Mbappe', price: 4.5 }],
    }]);
  });
});

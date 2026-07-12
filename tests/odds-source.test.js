import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const {
  fetchTeamOdds, fetchFirstScorerOdds,
  extractEmbeddedJson, parsePrice, parseMatchWinnerPage, parseFirstScorerSection,
} = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'api', '_lib', 'odds-source.js'));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parsePrice', () => {
  it('parses plain decimal odds', () => {
    expect(parsePrice('2.10')).toBe(2.1);
  });
  it('parses fractional odds and converts to decimal', () => {
    expect(parsePrice('17/20')).toBe(1.85);
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

  it('returns null when the page has no first-goalscorer market', () => {
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
    const listHtml = `<html><body><a href="/football/france-v-argentina">France v Argentina</a></body></html>`;
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => listHtml })
      .mockRejectedValueOnce(new Error('match page down')));
    await expect(fetchTeamOdds()).resolves.toEqual([]);
  });

  it('fetchTeamOdds returns a matched event end-to-end from discovery through parsing', async () => {
    const listHtml = `<html><body><a href="/football/france-v-argentina">France v Argentina</a></body></html>`;
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
});

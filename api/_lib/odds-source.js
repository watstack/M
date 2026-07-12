// Lightweight (no headless browser) scraper for match-winner and
// first-goalscorer odds — replaces The Odds API, which this app no longer has
// a key for. Source: Oddschecker (oddschecker.com) World Cup fixture pages,
// picked because it aggregates many bookmakers' prices for many markets
// (1X2 + First/Anytime Goalscorer specials) on one page.
//
// Verified against a live fixture page (2026-07-12, via a manually-shared
// screenshot + confirmed behavior — this sandbox has no network access to
// oddschecker.com itself):
//   - Fixture URL shape: /football/world-cup/{team-a}-v-{team-b}/winner
//     (nested under /football/world-cup/, not directly under /football/).
//   - "Win Markets" / "Player Betting" / "Stats Betting" are client-side tabs
//     that do NOT change the URL — confirmed by the user tapping through on
//     their phone. This means one fetch per fixture page can plausibly serve
//     both match-winner and player-goalscorer odds, on the assumption the tab
//     panels are server-rendered and just CSS/JS-toggled (the standard
//     implementation for a URL-stable tab UI) rather than lazy-loaded via a
//     separate XHR on tab click — unconfirmed, but the fail-soft design below
//     means a wrong guess here just yields empty scorer results, not a crash.
//   - Player markets include both "Anytime Goalscorer" (with an AI-probability
//     feature) and "First Goalscorer" — this module targets "First
//     Goalscorer" specifically, falling back to "Anytime Goalscorer" only if
//     no First Goalscorer section exists on the page.
//   - Odds are fractional (e.g. "6/5", "49/20"), not decimal.
//   - The on-page match heading reads "France vs Spain Betting Odds" — "vs"
//     (not " v ") plus trailing site text; the <title> tag's exact format is
//     still unconfirmed, so team-name extraction accepts both separators and
//     strips known trailing phrases.
// See docs/ODDS_SCRAPE.md for the full verification checklist — remaining
// unconfirmed items are noted there (in particular, whether the goalscorer
// markup is truly present in the initial HTML response for every fixture).
//
// Normalizes output to the same shapes The Odds API used to return, so
// api/_lib/odds-match.js's h2hOddsForFixture/firstScorerOddsForFixture need no
// changes:
//   fetchTeamOdds()        -> [{ home_team, away_team, commence_time, bookmakers: [{ markets: [{ key: 'h2h', outcomes: [{name, price}] }] }] }]
//   fetchFirstScorerOdds() -> [{ home_team, away_team, players: [{ name, price }] }]
//
// Both functions fail soft: they never throw past their own boundary. A
// broken selector or network error is logged as a warning and the function
// returns [], so one broken market never aborts the whole cron run — the
// caller (scripts/scrape-odds.cjs) just keeps whatever odds_json a fixture
// already had cached.

const cheerio = require('cheerio');

const FIXTURES_URL = 'https://www.oddschecker.com/football/world-cup';
const UA = 'Mozilla/5.0 (compatible; wc26-sweepstake-odds-bot/1.0)';

async function fetchHtml(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`fetch ${url} -> ${r.status}`);
  return r.text();
}

// Many modern sites embed the page's full data model as JSON in a
// <script id="__NEXT_DATA__" type="application/json"> tag (or similar) — far
// more robust to scrape than parsing rendered markup, since it survives minor
// CSS/markup redesigns. Try this first; callers fall back to HTML parsing.
function extractEmbeddedJson(html) {
  const patterns = [
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
    /<script type="application\/json" id="__NEXT_DATA__">([\s\S]*?)<\/script>/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (!m) continue;
    try { return JSON.parse(m[1]); } catch { /* fall through */ }
  }
  return null;
}

// Decimal odds cells on odds-comparison sites are typically rendered as plain
// "1.85" or fractional "17/20" (confirmed live: Oddschecker uses fractional,
// e.g. "6/5", "49/20") — accept either, always normalize to decimal.
function parsePrice(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const v = parseFloat(s);
    return v > 1 ? v : null; // decimal odds are always > 1.0
  }
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const num = parseInt(frac[1], 10), den = parseInt(frac[2], 10);
    if (den > 0) return +(1 + num / den).toFixed(2);
  }
  return null;
}

// Strip trailing site furniture from a candidate title/heading string before
// team-name extraction: " - Odds Comparison" / " | Oddschecker" style
// suffixes (split on hyphen/pipe), and the confirmed live H1 pattern
// "Team A vs Team B Betting Odds" (strip trailing "Betting Odds").
function stripTrailingFurniture(text) {
  return String(text || '')
    .split(/\s[-|]\s/)[0]
    .replace(/\s+Betting\s+Odds\s*$/i, '')
    .trim();
}

// Extract { home, away } team names from a fixture page's <title> or <h1>,
// accepting both " v " and " vs " as the separator (confirmed live: the H1
// uses "vs", the <title> tag's exact format is unconfirmed).
function extractTeamsFromPage($) {
  const candidates = [
    $('title').first().text(),
    $('h1').first().text(),
  ];
  for (const raw of candidates) {
    const text = stripTrailingFurniture(raw);
    const m = text.match(/([A-Za-z .']+?)\s+vs?\s+([A-Za-z .']+)$/i);
    if (m) return { home: m[1].trim(), away: m[2].trim() };
  }
  return null;
}

// Best-effort discovery of individual World Cup fixture page URLs from the
// tournament hub page. Prefers an embedded JSON listing; falls back to
// scanning anchors for a "/football/world-cup/team-a-v-team-b(/market)" style
// path (confirmed live shape, e.g. ".../france-v-spain/winner").
async function discoverFixtureLinks() {
  const html = await fetchHtml(FIXTURES_URL);
  const linkPattern = /\/football\/world-cup\/[a-z0-9-]+-v-[a-z0-9-]+(?:\/[a-z0-9-]+)?/i;

  const next = extractEmbeddedJson(html);
  if (next) {
    const links = new Set();
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (typeof node.url === 'string' && linkPattern.test(node.url)) {
        links.add(node.url.startsWith('http') ? node.url : `https://www.oddschecker.com${node.url}`);
      }
      for (const v of Object.values(node)) {
        if (v && typeof v === 'object') walk(v);
      }
    };
    walk(next);
    if (links.size) return [...links];
  }

  const $ = cheerio.load(html);
  const links = new Set();
  $('a[href*="/football/world-cup/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && linkPattern.test(href)) {
      links.add(href.startsWith('http') ? href : `https://www.oddschecker.com${href}`);
    }
  });
  return [...links];
}

// Parse one fixture page's "Match Betting" (1X2) table into an Odds-API-shaped
// h2h event. Returns null if the page doesn't look like a match-odds page.
function parseMatchWinnerPage(html) {
  const $ = cheerio.load(html);

  const teams = extractTeamsFromPage($);
  if (!teams) return null;
  const { home: homeTeam, away: awayTeam } = teams;

  // HTML table scan: rows with a team/draw label + one or more odds cells.
  // Take the best (highest) price offered per outcome across bookmakers.
  const best = { [homeTeam]: null, Draw: null, [awayTeam]: null };
  $('tr').each((_, row) => {
    const cells = $(row).find('td, th').toArray().map(c => $(c).text().trim());
    if (cells.length < 2) return;
    const label = cells[0];
    const key = label === 'Draw' ? 'Draw'
      : label.toLowerCase() === homeTeam.toLowerCase() ? homeTeam
      : label.toLowerCase() === awayTeam.toLowerCase() ? awayTeam
      : null;
    if (!key) return;
    for (const cell of cells.slice(1)) {
      const price = parsePrice(cell);
      if (price != null && (best[key] == null || price > best[key])) best[key] = price;
    }
  });

  if (best[homeTeam] == null || best[awayTeam] == null) return null;

  return {
    home_team: homeTeam,
    away_team: awayTeam,
    commence_time: null,
    bookmakers: [{
      markets: [{
        key: 'h2h',
        outcomes: [
          { name: homeTeam, price: best[homeTeam] },
          ...(best.Draw != null ? [{ name: 'Draw', price: best.Draw }] : []),
          { name: awayTeam, price: best[awayTeam] },
        ],
      }],
    }],
  };
}

// Parse a fixture page's "First Goalscorer" specials table into
// { home_team, away_team, players: [{ name, price }] }. Falls back to
// "Anytime Goalscorer" only if no First Goalscorer section exists on the page
// (confirmed live: both markets can appear on the same page, with Anytime
// Goalscorer listed first — prefer First Goalscorer specifically since that's
// the market this feature targets). Returns null if neither is found.
function parseFirstScorerSection(html, homeTeam, awayTeam) {
  const $ = cheerio.load(html);

  const findHeading = (pattern) =>
    $('*').filter((_, el) => pattern.test($(el).text().trim())).first();

  let heading = findHeading(/^first\s+goal\s*scorer$/i);
  if (!heading.length) heading = findHeading(/^anytime\s+goal\s*scorer$/i);
  if (!heading.length) return null;

  const players = [];
  const section = heading.closest('section, div').length ? heading.closest('section, div') : heading.parent();
  section.find('tr').each((_, row) => {
    const cells = $(row).find('td, th').toArray().map(c => $(c).text().trim());
    if (cells.length < 2) return;
    const name = cells[0];
    if (!name || /goal\s*scorer/i.test(name)) return;
    let best = null;
    for (const cell of cells.slice(1)) {
      const price = parsePrice(cell);
      if (price != null && (best == null || price > best)) best = price;
    }
    if (best != null) players.push({ name, price: best });
  });

  if (!players.length) return null;
  return { home_team: homeTeam, away_team: awayTeam, players };
}

// Fetches every fixture page exactly once and parses both team-winner and
// first-scorer odds from the same HTML response (tabs share one URL — see
// module header), then caches the result for the lifetime of the process so
// fetchTeamOdds()/fetchFirstScorerOdds() calling this within the same cron
// run only scrapes the site once. Never rejects — internal fetch/parse
// failures degrade to empty results with a logged warning.
let _cachedScrapePromise = null;

function _scrapeAllFixtures() {
  if (_cachedScrapePromise) return _cachedScrapePromise;
  _cachedScrapePromise = (async () => {
    let links = [];
    try {
      links = await discoverFixtureLinks();
    } catch (e) {
      console.warn('[odds-source] fixture discovery failed:', e.message);
      return { teamOdds: [], scorerOdds: [] };
    }

    const teamOdds = [];
    const scorerOdds = [];
    for (const url of links) {
      try {
        const html = await fetchHtml(url);
        const mw = parseMatchWinnerPage(html);
        if (!mw) continue;
        teamOdds.push(mw);
        const fs = parseFirstScorerSection(html, mw.home_team, mw.away_team);
        if (fs) scorerOdds.push(fs);
      } catch (e) {
        console.warn(`[odds-source] parse failed for ${url}:`, e.message);
      }
    }
    return { teamOdds, scorerOdds };
  })();
  return _cachedScrapePromise;
}

// Exposed only so tests can isolate scrape runs — production always runs as a
// fresh process per cron invocation, so no reset is needed there.
function _resetCacheForTests() {
  _cachedScrapePromise = null;
}

async function fetchTeamOdds() {
  try {
    const { teamOdds } = await _scrapeAllFixtures();
    return teamOdds;
  } catch (e) {
    console.warn('[odds-source] fetchTeamOdds failed:', e.message);
    return [];
  }
}

async function fetchFirstScorerOdds() {
  try {
    const { scorerOdds } = await _scrapeAllFixtures();
    return scorerOdds;
  } catch (e) {
    console.warn('[odds-source] fetchFirstScorerOdds failed:', e.message);
    return [];
  }
}

module.exports = {
  fetchTeamOdds, fetchFirstScorerOdds,
  // exported for tests / Step 0 debugging
  extractEmbeddedJson, parsePrice, parseMatchWinnerPage, parseFirstScorerSection,
  extractTeamsFromPage, stripTrailingFurniture, _resetCacheForTests,
};

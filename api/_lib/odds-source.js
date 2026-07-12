// Lightweight (no headless browser) scraper for match-winner and
// first-goalscorer odds — replaces The Odds API, which this app no longer has
// a key for. Source: Oddschecker (oddschecker.com) World Cup fixture pages,
// picked because it aggregates many bookmakers' prices for many markets
// (1X2 + First Goalscorer specials) on one page.
//
// IMPORTANT — Step 0 not yet done: this module was written without live
// network access to oddschecker.com (sandboxed dev environment). The URLs and
// selectors below are best-effort, not verified against the real page. Before
// relying on this in production: run it from an environment with normal
// internet access, inspect the actual page (embedded JSON blob vs rendered
// HTML, real selectors, whether SF-stage fixtures carry a first-goalscorer
// market at all), and adjust discoverFixtureLinks/parseMatchWinnerPage/
// parseFirstScorerSection accordingly. See docs/ODDS_SCRAPE.md for the full
// checklist. Until that's done, treat any odds this module returns as unverified.
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
// "1.85" or fractional "17/20" — accept either, always normalize to decimal.
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

// Best-effort discovery of individual World Cup fixture page URLs from the
// tournament hub page. Prefers an embedded JSON listing; falls back to
// scanning anchors for a "/football/team-a-v-team-b" style path.
async function discoverFixtureLinks() {
  const html = await fetchHtml(FIXTURES_URL);
  const next = extractEmbeddedJson(html);
  if (next) {
    const links = new Set();
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (typeof node.url === 'string' && /\/football\/[a-z0-9-]+-v-[a-z0-9-]+/i.test(node.url)) {
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
  $('a[href*="/football/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && /\/football\/[a-z0-9-]+-v-[a-z0-9-]+/i.test(href)) {
      links.add(href.startsWith('http') ? href : `https://www.oddschecker.com${href}`);
    }
  });
  return [...links];
}

// Parse one fixture page's "Match Betting" (1X2) table into an Odds-API-shaped
// h2h event. Returns null if the page doesn't look like a match-odds page.
function parseMatchWinnerPage(html, fallbackTeams) {
  const $ = cheerio.load(html);

  // Strip trailing site furniture (" - Odds Comparison", " | Oddschecker", …)
  // before splitting on " v " so the away-team capture doesn't swallow it.
  const title = ($('title').first().text() || '').split(/\s[-|]\s/)[0];
  const titleMatch = title.match(/([A-Za-z .']+?)\s+v\s+([A-Za-z .']+)$/i);
  const homeTeam = (titleMatch && titleMatch[1].trim()) || fallbackTeams?.home || null;
  const awayTeam = (titleMatch && titleMatch[2].trim()) || fallbackTeams?.away || null;
  if (!homeTeam || !awayTeam) return null;

  // Fallback HTML table scan: rows with a team/draw label + one or more
  // decimal-odds cells. Take the best (highest) price offered per outcome.
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

// Parse a fixture page's "First Goalscorer" specials table (or sub-page) into
// { home_team, away_team, players: [{ name, price }] }. Returns null if no
// first-goalscorer market is found on the page.
function parseFirstScorerSection(html, homeTeam, awayTeam) {
  const $ = cheerio.load(html);
  const players = [];

  // Look for a section headed "First Goalscorer" (or "Anytime Goalscorer" as
  // a fallback) and read player-name + best-price rows beneath it.
  const heading = $('*').filter((_, el) => {
    const t = $(el).text().trim();
    return /^first\s+goalscorer$/i.test(t) || /^anytime\s+goalscorer$/i.test(t);
  }).first();
  if (!heading.length) return null;

  const section = heading.closest('section, div').length ? heading.closest('section, div') : heading.parent();
  section.find('tr').each((_, row) => {
    const cells = $(row).find('td, th').toArray().map(c => $(c).text().trim());
    if (cells.length < 2) return;
    const name = cells[0];
    if (!name || /^first\s+goalscorer$/i.test(name)) return;
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

async function fetchTeamOdds() {
  const events = [];
  let links = [];
  try {
    links = await discoverFixtureLinks();
  } catch (e) {
    console.warn('[odds-source] fixture discovery failed:', e.message);
    return [];
  }
  for (const url of links) {
    try {
      const html = await fetchHtml(url);
      const ev = parseMatchWinnerPage(html);
      if (ev) events.push(ev);
    } catch (e) {
      console.warn(`[odds-source] team-odds parse failed for ${url}:`, e.message);
    }
  }
  return events;
}

async function fetchFirstScorerOdds() {
  const events = [];
  let links = [];
  try {
    links = await discoverFixtureLinks();
  } catch (e) {
    console.warn('[odds-source] fixture discovery failed:', e.message);
    return [];
  }
  for (const url of links) {
    try {
      const html = await fetchHtml(url);
      const mw = parseMatchWinnerPage(html);
      if (!mw) continue;
      const fs = parseFirstScorerSection(html, mw.home_team, mw.away_team);
      if (fs) events.push(fs);
    } catch (e) {
      console.warn(`[odds-source] scorer-odds parse failed for ${url}:`, e.message);
    }
  }
  return events;
}

module.exports = {
  fetchTeamOdds, fetchFirstScorerOdds,
  // exported for tests / Step 0 debugging
  extractEmbeddedJson, parsePrice, parseMatchWinnerPage, parseFirstScorerSection,
};

# Odds scrape — Step 0 verification checklist

`api/_lib/odds-source.js` replaces The Odds API with a scrape of Oddschecker
(oddschecker.com) World Cup fixture pages. It was written in a sandboxed
environment with no network access to oddschecker.com, so its selectors and
URL patterns are **best-effort, not verified**. Before trusting it in
production (i.e. before the 4-hourly `refresh-odds.yml` cron is relied on),
run this checklist from an environment with normal internet access — a local
machine, or a manual `workflow_dispatch` run of the Actions job with extra
logging:

1. Fetch `https://www.oddschecker.com/football/world-cup` and check:
   - Does the response include a `<script id="__NEXT_DATA__" type="application/json">`
     (or similar embedded state) blob? If so, prefer reading fixture links out
     of that JSON over `discoverFixtureLinks()`'s `<a href>` fallback scan.
   - Does the anchor pattern `/football/[team]-v-[team]` still match real
     fixture links, or has the URL scheme changed?
2. Open one individual fixture page (ideally a real semi-final page once SF
   teams resolve, ~2026-07-14/15 — group-stage pages may have different
   market coverage) and check:
   - Where the "Match Betting" (1X2) table actually lives in the DOM —
     confirm/adjust `parseMatchWinnerPage()`'s row-scanning logic.
   - Whether a "First Goalscorer" (or "Anytime Goalscorer") specials section
     exists on the page at all for this fixture, and where — confirm/adjust
     `parseFirstScorerSection()`. If SF fixtures don't carry a scorer market
     this far from kickoff, the `first_scorer` bet_markets rows should stay as
     locked/no-odds scaffolds until lines are posted closer to kickoff — no
     code change needed for that, `buildMarketRows()` already handles it.
3. Confirm current robots.txt / rate-limit posture for the fixture-page URL
   pattern. Keep the scraper's existing polite posture regardless: single
   sequential request per page, realistic `User-Agent`, 4-hourly cadence — do
   not parallelize requests or increase frequency.
4. Run `node -e "require('./api/_lib/odds-source').fetchTeamOdds().then(r => console.log(JSON.stringify(r, null, 2)))"`
   and the equivalent for `fetchFirstScorerOdds()`, confirm non-empty,
   correctly-shaped output for at least one real fixture.

Everything else in the odds pipeline (`api/_lib/odds-match.js`,
`api/_lib/market-builder.js`, `scripts/scrape-odds.cjs`, the UI accordion, and
settlement) is independent of Oddschecker's exact selectors and does not need
to change based on this checklist's findings — only `odds-source.js`'s
internals should need adjusting.

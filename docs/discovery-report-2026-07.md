# Kickoff — Discovery & Learnings Report (Stage 1)

*Prepared 2026-07-07 against `main` at `383ab22` (full history, 361 commits, Apr 2026 → Jul 2026).*
*Scope: understand and characterise what exists. No recommendations. Fact vs inference labelled throughout.*

---

## 0 · What this repository actually contains

The repo (`watstack/m`, locally "M") is a personal experiments repo that Kickoff grew inside:

| Artefact | First commit | What it is |
|---|---|---|
| `washing.html` | `baa0125` (2026-04-11) | Standalone laundry-day page. Unrelated to Kickoff. |
| `trump.html` | `396848d` (2026-05-09) | Standalone satire page. Unrelated. |
| **Kickoff** (everything else) | `fa9034a` (2026-06-06) "Add World Cup 2026 sweepstake app" | The product under discovery. |
| `waitlist.html` | `ce1bef3` (2026-06-23) | Pre-launch landing page titled **"M — One Pass. Every Sport in the City."** — a *sports-venue membership* pitch, not the fantasy league. Signup is a pure front-end mock: `handleSignup()` (waitlist.html:1113) only flips DOM state; the queue counter and referral link (`join.m.sport/r/abc123`) are hardcoded. Nothing is persisted anywhere. |

**Fact:** `package.json` names the project `wc26-sweepstake`. There is no README for the product itself; the only docs are `docs/CUSTOM_BETS.md`, `scripts/README.md`, and `bulletin/README.md`.

**Inference:** the "M" waitlist suggests a broader brand ambition adjacent to Kickoff, but nothing in code links it to the sweepstake/betting app.

---

## 1 · Current-state inventory

### 1.1 Architecture (fact)

A static multi-page PWA + three loosely coupled backends:

- **Static site** on GitHub Pages (`.github/workflows/deploy.yml`; migrated from Vercel hosting at `722e8a7`, 2026-06-06). `build.js` injects Supabase credentials into `js/config.js` at build time and derives the server fixture module `api/_lib/fixtures.js` from the browser sources (`build.js:12-38`).
- **Supabase** (Postgres + Realtime + RPCs) is the primary data plane. The browser talks to it directly with the public anon key (`js/supabase.js:4-7`).
- **Vercel serverless `/api`** (still deployed at `https://m-watstacks-projects.vercel.app`, wired in via `API_BASE_URL` in `deploy.yml`) for anything needing secrets: market creation/odds (`api/markets.js`), match sync (`api/sync.js`), settlement (`api/settle.js`, `api/auto-settle.js`), knockout resolution (`api/resolve.js`), admin coins (`api/admin-coins.js`), push notifications (`api/subscribe-push.js`, `api/push-config.js`).
- **GitHub Actions cron** as a second copy of the server jobs, because GitHub Pages can't run functions: `auto-settle.yml` every 15 min (`scripts/auto-settle.cjs`), `refresh-odds.yml` daily (`scripts/refresh-odds.cjs`). The refresh-odds workflow header records the reason: *"GitHub Pages can't run the /api/markets serverless function, so 1X2 odds were never written to Supabase (every price showed 'TBC')"*.

Pages: `index.html` (landing), `admin.html` (create sweepstake), `sweepstake.html` (join → waiting room → live draw → bracket/groups/players/highlights; ~3,000 lines, most logic inline), `betting.html` (markets, bet slip, my bets, all bets, leaderboard, admin tab; ~2,400 lines, ~1,000 inline), `overview.html` (hub), `design.html` ("Design Kitchen Sink"), `recap-preview.html` (battle-animation prototype), `waitlist.html`.

### 1.2 Data model (fact — `supabase/*.sql`)

- `tournaments` — `code` (6-char invite), `admin_token` (plaintext UUID), `name`, `teams_per_person`, `status` (`open|drawing|live`) (`schema.sql:7-15`).
- `participants` — `nickname`, `avatar_type`, `team_slots`, `is_admin` (`admin-roles.sql`), **`coin_balance INT DEFAULT 1000`** (`betting-migration.sql:7`), **`cans_owed INT`** (`can-debt.sql:2`).
- `allocations` — the sweepstake draw output: `{participant, team_code, team_name, draw_order}` (`schema.sql:28-36`).
- `bet_markets` — keyed by **static `match_no` 1–104** mapping to `js/wc2026-fixtures.js` (`betting-rebuild.sql:16-38`); types `match_result | correct_score | double_chance | qualify | custom`; `odds_json`, `locked`, `close_time`, `result`.
- `bets` — single bets; `potential_payout` is a generated column `ROUND(stake*odds)` (`betting-rebuild.sql:41-52`).
- `parlay_bets` + `parlay_bet_legs` (`parlay-bets.sql`), later gaining `promo_boost` (`parlay-pump.sql`) and `sunday_funday_boosted` (`sunday-funday.sql`).
- `bet_requests` — player-proposed custom markets, admin approves with odds (`bet-requests.sql`).
- `wc_matches` — cache of external results (FBD/ESPN), including `home_score_reg/away_score_reg/score_duration` added later for ET handling (`add-regulation-score.sql`).
- `page_views` — insert-only analytics (`analytics.sql`).

**Where state lives (fact):** all durable state is in Supabase. Identity, however, lives entirely in `localStorage`: participant id per league (`wc26_<CODE>`), admin token (`wc26_admin_<CODE>`, `admin.html:390`), membership lists, daily odds-boost counters (`wc26_boosts_<pid>`, betting.html:1760), spin-promo flags. `js/my-tournaments.js:25-32` documents this explicitly: *"A user's identity on this app lives entirely in localStorage (no login)"* — and the PWA install flow serialises **all** of these tokens (admin tokens included) into the URL hash/query so a fresh install can re-import them (`buildInstallLink`, `my-tournaments.js:88-105`).

### 1.3 Ledger or mutation? (fact)

There is **no ledger**. The scoreboard *is* `participants.coin_balance`, mutated in place:

- `settle_market` RPC: `UPDATE participants SET coin_balance = coin_balance + b.potential_payout ...` (`betting-rebuild.sql:134-145` and successors).
- `place_bet` / `place_parlay`: `UPDATE participants SET coin_balance = coin_balance - p_stake` (`betting-rebuild.sql:111`).
- Admin can overwrite any balance outright (`api/admin-coins.js:31-34`, `admin_update_participant` in `can-debt.sql`).
- The leaderboard is simply `SELECT ... ORDER BY coin_balance DESC` (`js/leaderboard.js:10-18`).

Balance history cannot be reconstructed; the `bets` rows are the only audit trail, and promos/Two-Up/admin edits bypass even that.

### 1.4 One currency, not two (fact)

There are no "points". Coins are simultaneously the wagering allowance **and** the permanent ranking. The 1,000 coins are a one-time default at row creation; a repo-wide search for replenishment logic (`replenish|weekly|topup`) finds nothing. Recovery paths for busted players are social: **`cans_owed`** — an admin-set count of real-world beer cans per participant, surfaced as "🍺 Total pot" on the leaderboard (`js/leaderboard.js:42-45`) — and direct admin balance resets. **Inference:** cans-for-coins is functioning as an informal real-money (real-beer) buy-in mechanic.

### 1.5 Format contract? (fact)

No. There is no `setup/act/settle` plugin surface. Betting is hardcoded end-to-end (market types are string enums scattered across SQL, `api/_lib/market-builder.js`, `js/betting.js`). The sweepstake is a separate feature (draw + allocations) that **never mints anything** — allocations affect only display (bracket avatars, a coin icon on carousel cards for "your team's" matches, `betting.html:1483-1493`). "Custom bets" are data-level flexibility (arbitrary `odds_json` options on a `custom` market), not a format abstraction (`docs/CUSTOM_BETS.md`).

### 1.6 Results entry & settlement (fact)

Three overlapping paths settle the same markets:

1. **Automatic:** cron (15-min) and browser-triggered `/api/auto-settle` sync `wc_matches` from football-data.org (primary) or ESPN (fallback) (`api/_lib/sync-matches.js`), then settle open markets whose `close_time` passed, grading match markets on the **regulation-time score** and `qualify` on the ET/pens outcome (`api/auto-settle.js:70-99`).
2. **Manual admin:** `/api/settle` takes `{matchNo, homeScore, awayScore, winner?}`, but deliberately distrusts the admin's typed score for knockouts — it re-derives the regulation score from synced data and refuses to settle match markets if it can't (`api/settle.js:13-20, 74-98`). This guard is itself a scar from bug `313011f`.
3. **Custom markets:** admin settles by picking the winning option in the Admin tab (`docs/CUSTOM_BETS.md`, `js/admin.js:457-467`).

Knockout bracket slots propagate via a static `BRACKET_FEED` table on settle (`api/_lib/settle-lib.js:90-104`); R32 seeding is manual via `/api/resolve` (used at `fbbccae`, 2026-06-29).

### 1.7 Trust/security model as-is (fact)

The system is **client-trusting almost everywhere**; the invite code is the only access gate (`schema.sql:79`).

- **Any client can set any participant's `coin_balance` directly.** RLS on `participants` allows `UPDATE USING (true) WITH CHECK (true)` (`schema.sql:91`) and the anon key is public. This is not just theoretical — the app itself uses it: Two Up Tuesday deducts stakes with a raw client-side `db.from('participants').update({coin_balance: ...})` (`js/betting.js:1142-1155`).
- **Odds are client-supplied.** `place_bet(p_odds)` / `place_parlay(p_total_odds)` accept whatever the browser sends; the server never checks against `odds_json` (`betting-rebuild.sql:86-119`). The +25% daily Odds Boost is enforced only by a localStorage counter (`betting.html:1767-1815`); the Sunday Funday coin flip is `Math.random()` in the browser, with the +10% RPC checking only ownership and a once-per-bet flag — not that it's Sunday or that a flip was won (`betting.html:2329-2360`, `sunday-funday.sql`).
- **Server-guarded surface exists but is thin:** admin-token/`is_admin` verification on settle/resolve/admin-coins (`api/_lib/settle-lib.js:25-51`) and SECURITY DEFINER RPCs for draw control and bet-request approval (`bet-requests.sql:76-114`). `place_bet`/`place_parlay` do run atomically server-side with row locks, balance checks and close-time guards — stake accounting is sound *if* the inputs are honest.
- **No accounts, no cross-league isolation beyond unguessable UUIDs/codes:** all reads are public (`USING (true)` SELECT policies on every table); anyone with a participant UUID can act as that participant; `?pid=` links (`a15db17`) and install deep-links put identity and admin tokens into URLs.
- **Fact:** nothing prevents a client from fabricating coins; the leaderboard ranks whatever `coin_balance` says. **Inference:** this holds up socially because every league is a friend group and the admin can audit/reset balances by hand.

### 1.8 UI/visual approach (fact)

A real, if informal, design language exists: `css/styles.css` defines CSS custom-property tokens (palette, fonts — Press Start 2P pixel + Chakra Petch + DM Sans), `design.html` is an explicit "Design Kitchen Sink", and there's a themed asset set (pixel-art avatars ×11, arena/pitch SVGs, generated PWA icons, a music system `js/music.js`). But composition is ad-hoc: every page carries hundreds of lines of page-local `<style>`, markup is built by string-concatenating template literals with inline styles (e.g. share-card HTML in `js/betting.js:575-613`), and there are no reusable components. The visual identity went through three named eras in two days — "NeonArena" (`a7dd826`), 8-bit pixel (`19731ee`), "Sunset design system" (`435b12e`).

### 1.9 Works vs stubbed/dead (fact unless noted)

**Working (exercised by a live league — the bulletin spec cites league `9HE9Y5` as live, `bulletin/README.md:22`):** create/join/draw sweepstake with realtime waiting room; bracket & group views; betting on 1X2/correct-score/double-chance/qualify; parlays with correlated-leg guard; custom bet request→approve→settle; auto + manual settlement incl. ET regulation handling and bracket propagation; coin leaderboard with can debts; PWA install with token hand-off; push alerts for bet requests; analytics; promos (Odds Boost, Spin Wheel, Parlay Pump, Sunday Funday).

**Facade / partially real:**
- **Two Up Tuesday**: the game data is a hardcoded in-memory mock for one specific date (`js/betting.js:705-737` — "13 hourly slots for Tue 23 Jun 2026", pre-scripted results), there is no server-side flip, pot, or payout — but it **really deducts coins** (`5799b59` "deduct bet from real coin balance"). Money in, nothing out, by design of the current build.
- **Waitlist**: pure front-end theatre (see §0).
- **Recap/Highlights**: `recap-preview.html` is a style prototype; a working highlights panel is integrated in `sweepstake.html` (`5db9447`, `9e4e168`).

**Dead/legacy:** `supabase/betting-migration.sql` (superseded fuzzy `match_id` pipeline, replaced by `betting-rebuild.sql`); `js/supabase.js` helpers largely duplicated inline into `sweepstake.html` during the June-6 loading-hang firefight (`c022ae1`, `c9b4c96`); `api/debug.js` diagnostic endpoint; `washing.html`/`trump.html`; duplicate `1000070927.jpeg/.jpg` photos at repo root.

---

## 2 · History & learnings audit

Sources: full git history (361 commits, 2026-04-11 → 2026-07-07), PR merge messages (~167 PRs, all from `claude/*` branches). **GitHub Issues: zero, open or closed** — the commit log is the only decision record. No CHANGELOG; no TODO/FIXME comments of substance found.

### 2.1 Change & decision log (fact; "why" quoted where recorded)

| When | What happened | Evidence |
|---|---|---|
| Jun 6 | Sweepstake app lands whole (schema, draw, bracket) | `fa9034a`, `ee53c7b` |
| Jun 6–10 | **Loading-hang firefight**: ~25 consecutive fix commits — CDN → vendored Supabase SDK, scripts inlined into HTML, cache-busting, timeouts, visible step indicators | `618f758`, `78e780a`, `c9b4c96`, `f2eaaa6`, `d295db8`, `480ed4d` |
| Jun 6 | Hosting pivot Vercel → GitHub Pages (API stays on Vercel) | `722e8a7` |
| Jun 7–10 | Draw experience iterated hard: tabbed bracket → full tree → slot machine → "thunderdome arena" → countdown → two-phase allocation rewrite ("admin drives animation directly") | `5d1d491`, `0692436`, `69a240d`, `b11a9f1`, `e05c9b1` |
| Jun 11 | **Betting arm added** ("side betting arm with live leaderboard") — the product's centre of gravity moves here and never moves back | `68a3507` |
| Jun 12–13 | **Match-data pivot ×3**: football-data.org → ESPN-via-Supabase-cache → FBD-primary; then the decisive move — **static 104-fixture scaffold keyed by `match_no`**, dropping the fuzzy `match_id` sync ("Rebuild betting page rendering off static fixture scaffold") | `df7ac8e`, `aba222d`, `3f38d78`, `b071750`, `941937b`, `betting-rebuild.sql` |
| Jun 14 | Odds + settlement move to GitHub Actions cron (because Pages can't run functions) | `bd8e09e`, `b81c9b2`, `refresh-odds.yml` header |
| Jun 16 | Parlays; correlated-legs guard; overview hub; **leaderboard moved from sweepstake page to betting page** | `305eac4`, `36f601f`, `a5df151`, `8e2e57e` |
| Jun 17–18 | Can debt + admin coin management; bet requests (player-proposed markets); daily Odds Boost; analytics rerouted ("write directly to Supabase instead of dead /api routes") | `0a3006d`, `4f5ab43`, `b6a13e8`, `17f855b` |
| Jun 19–20 | Settlement lag cut "~4 hours to ~2 minutes" (browser-triggered auto-settle); PWA install + token deep-links (4 commits of iOS workarounds); double chance; per-participant admins; push notifications; Spin-the-Wheel one-day promo | `7978a1c`, `c7cfd91`→`1676453`, `470ffdd`, `4dda54e`, `2d2ea90`, `4ca4a6c` |
| Jun 21–23 | Promo/UX churn peak: Two Up Tuesday (5 commits), betslip accordion (6 commits), My Bets filters (5 commits); waitlist page (3 redesigns same day) | `cf83cb9`…, `fcb3cfe`…, `ce1bef3`… |
| Jun 24–27 | Parlay Pump promo; then **a one-off per-user promo window shipped as a SQL migration** ("Run Parlay Pump for LaddyLadLad: Sat 27 Jun → Sun 28 Jun") | `da60260`, `8b658d2`, `parlay-pump-laddyladlad-sat-window.sql` |
| Jun 28–Jul 7 | Knockout-phase reality: R32 manual seeding, qualify (DNB) market added then re-fixed, ET/regulation grading bugs, bracket UX to "Google's World Cup pattern", Sunday Funday | `fbbccae`, `f9f0697`→`b262074`, `313011f`, `b6b7dcc`, `ce7c329` |
| Jun 18 | Bulletin: the heavier design (separate repo, Claude API, Twilio, cron) was **explicitly superseded** by a manual Claude-driven spec — the one written-down architecture decision in the repo | `bulletin/README.md:11-16` |

**Abandoned/reversed (fact):** `tournament_winner` outright market (removed `b1ddba6`, `0ce1fb5`); fuzzy `match_id`/`wc_matches`-driven markets (dropped by rebuild); Vercel static hosting; external `js/sweepstake.js` loading (inlined); player-supplied odds on bet requests (removed `38206d0` — admins price everything); early guard-check approach (`e49d6a1` "Remove guard checks that broke test suite").

### 2.2 Bug log — economic & state-loss (fact)

Every economic bug below reached the live league before being fixed:

1. **Double-chance bets couldn't pay out** — `settle_market` didn't know `1x/x2/12`; fixed in the RPC (`ddf1886`, #119) and a client guard extension (`9d37358`).
2. **Duplicate winning bets paid once** — `UPDATE…FROM` picked one row arbitrarily; replaced with a correlated `SUM()` (`6bfcffa`, `fix-duplicate-bet-payout.sql` header narrates the defect).
3. **Settlement fully blocked twice by upsert conflicts** — `wc_matches` dual-constraint 409s (`70a28a7`, `601bc65`) and again in the R32 sync (`d2a68c7`).
4. **Extra-time mis-grading, a 3-fix saga** — knockout draws settled as losses (`f3a37d4`); match markets graded on ET/pens-inclusive scores (`313011f`, adding `add-regulation-score.sql` + the "regKnown" distrust-the-admin guard in `api/settle.js`); manual settle draw grading (`d2a68c7`).
5. **Qualify market settled wrong** — DNB semantics + void-on-draw revised the day after shipping (`b262074`).
6. **ESPN home/away reversal** broke auto-settle lookups (England–Panama incident, `2061104`).
7. **Stale kickoff times hid live knockout matches** from betting entirely (`94e002d`, USA–Belgium incident — the most recent commit).
8. **State-loss class:** the whole Jun 6–10 hang cluster (users stuck on loading), lost sessions on PWA install (fixed by carrying tokens through the URL, `a73fa7d`), and slot changes not persisting (`2168b88`).

**Inference:** the bug pattern is consistent — each new market type or result-source nuance broke settlement in production first; correctness was recovered by adding server-side guards after the fact.

### 2.3 Recurring problem areas (fact — churn)

`git log --name-only` counts: **betting.html 89**, **sweepstake.html 72**, **js/betting.js 47**, admin.html 26, css/styles.css 18, index.html 17, js/overview.js 16, api/markets.js 10, api/settle.js 9. The two monolithic HTML files absorb over 40% of all file-touches. Subsystems that repeatedly broke: script loading/caching (June 6–10), match-data sync & settlement (June 12 onward, still active July 6), and the betslip UI (June 22–23).

### 2.4 Carried assumptions (observations, not verdicts)

- **One tournament, hardcoded:** WC 2026's 104 fixtures, bracket feed, team codes/colours are static source files (`js/wc2026-fixtures.js`, `BRACKET_FEED`, `js/flag-colors.js`); `stage`/group logic, "48 teams" (`js/overview.js:75`) and sport-specific markets are baked in everywhere.
- **Single device, no accounts:** identity = localStorage; recovery = links containing tokens.
- **Trust the client:** public anon key + permissive RLS + client-supplied odds; fairness is social, enforced by a known admin.
- **Admin = token-holder (later + flagged participants):** one plaintext token per league, shown once, carried in URLs.
- **One live league at a time:** promos target a named user/league in migrations (`parlay-pump-laddyladlad-sat-window.sql`); the bulletin spec names `9HE9Y5`; timezone logic is hardcoded to AEST (`js/betting.js:671`).
- **Coins are the score:** the leaderboard, bulletin "Money Table", and can-debt economy all assume balance = standing.
- **Ops-by-SQL:** the `supabase/` directory is a pile of sequential hand-run migrations (23 files) including one-off promo windows; there is no migration tooling or ordering record beyond git dates.

---

## 3 · Per-lens characterisation

### PM lens

What it *tried* to be (per the Kickoff reference): a sport-agnostic, forget-proof, two-currency peer-to-peer fantasy league with a ledger core and pluggable formats. What *shipped*: a **single-event (WC 2026) social sportsbook for one friend group, bolted onto a team-draw sweepstake**, with a one-currency economy and hand-run ops. The concept-proof status by pillar:

- **Proven in code:** invite-code leagues with zero-friction join; the draw as a shared live moment (the most polished, most-iterated flow); betting as the engagement spine (all post–Jun-11 energy went here); custom/requested bets as a genuinely differentiating social mechanic; promos as retention levers (four shipped in ~10 days); near-real-time auto-settlement.
- **Unproven / absent:** any-sport genericity (0%); forget-proof passive earning (the sweepstake mints nothing; an inactive player's rank never moves except downward-relative); the two-currency split (coins only, no replenishment, no points); the ledger (in-place mutation, no history); the format contract (hardcoded); multi-tenancy beyond parallel invite codes (works structurally, but ops — promos, custom bets, resets — are per-league manual).
- **Scope reality:** ~1 month elapsed, ~340 Kickoff commits, ~167 PRs, all via Claude branches, feature-first with fixes chasing live incidents. The cadence tracks the real World Cup calendar (group stage → R32 seeding → ET bugs → bracket views), i.e. the product was operated as a live service for a real tournament while being built.

### Product Design lens

- **Journey as built:** land (`index.html`) → create (`admin.html`) or join via `/s/CODE` (`sweepstake.html`) → pick nickname/avatar/slots → waiting room (realtime, dancing avatars) → cinematic draw → bracket hub. Then the centre of gravity jumps to `betting.html` (via `/b/CODE` or overview): fixture carousel → market cards → betslip (accordion, boost toggle, promo banners) → My Bets/All Bets → leaderboard. `overview.html` was retro-fitted as "canonical tournament hub" (`a5df151`, `20373cf`) to stitch the two halves together; admin controls were later consolidated onto it (`16e2da9`).
- **Coherence:** strong, distinctive art direction (pixel/retro-arcade + bookmaker UI) that survived three restyles; tone is confidently laddish (error copy: "nice try you cheeky bastard… on ya bike 🚲", `js/betting.js:172`) — clearly designed for one specific WhatsApp group's culture (AEST times, beer cans, roast bulletins).
- **Debt/gaps:** two apps in one trench coat — sweepstake and betting have separate nav paradigms, duplicated headers, and the join flow exists in three implementations (`sweepstake.html`, `overview.js`, `admin.html`); no reusable component layer, so every new surface (Two Up, share cards, spin wheel) is bespoke inline HTML/CSS; onboarding for the *bettor* role is absent (you land on 26 market cards with no explanation of coins, boosts, or cans); missing states include "what happens when I'm bankrupt", any notion of season end/winner ceremony, and any surface explaining the sweepstake's stake in outcomes (because it has none). Facade features (Two Up's mock schedule, the waitlist's fake queue) present as real, which is fine for a friends-only toy but is a live design decision nowhere written down.

### Engineering lens

- **Actual data flow:** browser ⇄ Supabase (anon key, permissive RLS, realtime) for state and bet placement via SECURITY DEFINER RPCs; browser → Vercel `/api` for secret-bearing work (odds, sync, settle, push); GitHub cron re-running the same libs (`scripts/*.cjs` wrap `api/_lib/*`); static fixture scaffold (`match_no` 1–104) as the backbone joining client rendering, market creation, odds matching (`api/_lib/odds-match.js` fuzzy name→code), external results (`wc_matches` by TLA pair), and bracket propagation (`BRACKET_FEED`).
- **What is solid (fact):** the post-rebuild market keying (deterministic `match_no`, idempotent upserts); `place_bet`/`place_parlay` atomicity (row locks, balance check, close-time enforcement); `settle_market` idempotency guard; the regulation-score ladder with explicit distrust of ambiguous inputs (`api/_lib/settle-lib.js:117-147` and `api/settle.js` header — some of the most carefully-reasoned comments in the repo); the build-time derivation keeping client/server fixtures from drifting (`build.js`); a real test suite for exactly the burned areas (settle-lib, draw fairness, sanitisation, API proxy — `tests/`, CI on every push).
- **What is fragile (fact):** the whole trust perimeter (any client can write any balance; odds client-supplied; promo entitlements in localStorage; `Math.random()` fairness); settlement's dependence on TLA-pair matching against two inconsistent external feeds (already caused reversals, 409s, stale kickoffs); three settlement writers (cron, browser-trigger, admin) coordinated only by RPC idempotency; the two monolithic HTML files where most logic lives untested; `settle_market` redefined in five successive migration files, so the deployed function body is whichever was run last (git order is the only record); hand-run SQL ops with league-specific promo logic burned into `place_parlay`.
- **Entanglement (fact):** coins couple everything — `participants` is simultaneously identity, wallet, scoreboard, admin registry and beer ledger; `bet_markets.odds_json` doubles as both bookmaker prices and custom-market option lists; promos live in three layers at once (SQL boost columns, RPC window checks, client banners/localStorage gates).

---

## 4 · Verdict — what Kickoff actually is today

Kickoff today is a **working, single-tournament social sportsbook for one WhatsApp friend group, wearing a sweepstake as its front porch**: a static GitHub-Pages PWA over a wide-open Supabase database, with a Vercel/cron settlement pipeline that grades real World Cup 2026 results (regulation-time nuances and all) into an in-place coin balance that doubles as the leaderboard. Its genuinely proven ideas are social — the live draw as an event, player-requested custom markets, promos, can-debt stakes, and a roast bulletin — while every structural pillar of the stated Kickoff vision (any-sport, forget-proof passive earning, coins-vs-points dual currency, append-only ledger, format plugins, server-owned trust) is absent from the code: there is one hardcoded sport and season, one mutable currency, no ledger, no format contract, and a client that is trusted with odds, balances, and randomness. It is best characterised not as an early version of the Kickoff architecture but as a **hand-operated live prototype that discovered the product's social mechanics** — and whose one-month history is a detailed log of exactly which parts of a betting economy break first (settlement grading, payout duplication, result-feed trust) when built client-first.

---

## 5 · Open-questions register

Surfaced by this discovery; deliberately **not answered** here.

1. **Real-money / legal fork.** `cans_owed` is an admin-tracked real-world debt shown as a "pot"; promos replicate real gambling UX (boosts, parlay pumps, coin flips); the "M" waitlist pitches a paid membership. Where is the line between virtual-coin banter and regulated gambling/prize-promotion territory, and who decides?
2. **Scoring topology.** Coins are stake *and* score with no replenishment and no points. Is the intended two-currency split (wagerable coins → permanent points) still the model, and what happens to the existing single-balance history if so?
3. **Ledger vs balance.** Balance history is unrecoverable today (promos/admin edits/Two-Up bypass even the bets table). Is the append-only ledger `{playerId, delta, sourceFormat, sourceEvent, memo}` still the intended core, and what of the current data would need to survive a migration?
4. **Sweepstake shape.** As built, the team draw awards nothing — no handicap, no capped h2h bonus, no passive earn. Is the "auto-dealt team + handicap" earn path still intended, and does the current allocations model carry any of it?
5. **Forget-proof mechanic.** Nothing in code keeps an inactive player engaged or earning. What concretely is "forget-proof" supposed to mean mechanically — passive minting, streak protection, something else?
6. **Resolution trust / oracle.** Three settlement writers exist (two external feeds with known disagreements, plus manual admin, plus admin custom-market judgement). Who is the authoritative oracle per format, and how are disputes/voids adjudicated once leagues aren't run by the developer?
7. **Format contract & second axis.** Betting and sweepstake are hardcoded siblings; custom bets are data, not a format. What is the actual plugin boundary (`setup/act/settle`), and what is the "second axis" the reference alludes to?
8. **Identity & multi-device.** localStorage identity already failed on iOS install (solved by tokens-in-URL). Do logins arrive before or after multi-tenancy, and what happens to existing token-holders?
9. **Multi-tenant isolation.** Every table is world-readable and `participants` world-writable; codes/UUIDs are the only gate. What isolation level does "any user runs their own league" actually require?
10. **Ops model.** Promos, custom bets, resets, and even per-user promo windows ship as hand-run SQL and commit-time constants (AEST, league codes). Which of these become product surface vs remain operator rituals?
11. **Facade features' fate.** Two Up Tuesday takes real coins against a mock game; the waitlist is theatre. Are these throwaway event props or commitments awaiting real backends?
12. **Kickoff vs "M".** The repo hosts both the Kickoff app and an "M — every sport in the city" membership pitch. Is Kickoff the product, a feature of "M", or a market test for it?

---

## 6 · What I could not see (flagged)

- **Live database state** (row counts, actual deployed function bodies, which migrations were really run and in what order) — Supabase was not queried; migration files are read as intended state only.
- **Vercel deployment config/env** (whether all `/api` routes are live and which env vars are set) — inferred from `deploy.yml` and code only.
- **GitHub issue/PR discussion bodies** — issues are zero; PR descriptions beyond merge-commit titles were not retrieved.
- **`js/config.js`** (gitignored, generated) and all secrets — by design.
- **Any external artefacts** (the WhatsApp group, actual bulletins sent, The Odds API usage).

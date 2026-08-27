# Bet Combination Rules (Parlay Correlation Guard)

This document defines which market selections may be combined into a single
parlay (multi-leg bet) for a given match, and why. It's the design reference
for `place_parlay`'s correlated-legs guard (`supabase/relax-parlay-scorer-conflicts.sql`,
carried forward unchanged in `supabase/final-third-place-markets.sql`).

## The rule of thumb

**Two legs on the same match may not be combined if one selection winning
necessarily determines (or is already implied by) the other.** Odds for a
parlay are multiplied together on the assumption that each leg is an
independent event. If two legs always settle together — because they
describe the same underlying outcome from different angles, or one is a
subset of the other — multiplying their odds pays out for risk that was
never actually taken. That's not a bigger bet, it's free money, so it's
blocked outright rather than priced down.

Everything else — any two markets that can independently go either way
regardless of what the other resolves to — is a legitimate combination and
must stay allowed. Being cautious in the other direction (over-blocking)
is also a bug: it stops genuine multis players are entitled to make.

## Markets seen in this pack

From the reviewed odds sheet (Spain v Argentina, France v England):

| Market on the sheet         | `market_type`      | What it settles |
|------------------------------|--------------------|------------------|
| Win-Draw-Win (Full Time)      | `match_result`     | Which side wins, or draw |
| Double Chance                 | `double_chance`     | Any two of the three `match_result` outcomes combined |
| Both Teams To Score            | `btts`              | Whether both teams scored ≥1 goal |
| Over/Under 2.5 Goals            | `over_under`        | Total goals scored |
| Over/Under 2.5 Cards             | `over_under_cards`  | Total cards shown |
| Total Corners 8.5                 | `total_corners`     | Total corners awarded |
| Anytime Goalscorer (per player)    | `anytime_scorer`    | Whether a named player scores at any point |
| First Goalscorer (per player)       | `first_scorer`      | Whether a named player scores the game's first goal |

Two more market types exist elsewhere in the app but weren't in this sheet:
`correct_score` (exact scoreline) and `qualify` (advances to next round in a
knockout match) — included below because they interact with the markets above.

## Combinability rules

### 1. Match-outcome markets are mutually exclusive with each other

`match_result`, `correct_score`, `double_chance`, and `qualify` are all just
different resolutions of "who won" — `double_chance` is a coarser view
(merges two `match_result` outcomes), `correct_score` is a finer one (the
exact score implies the winner), and `qualify` in a knockout match is a
proxy for `match_result` plus extra time/penalties. **Pick at most one
market from this group per match.**

- Blocked: Spain Win (`match_result`) + Spain Or Draw (`double_chance`) —
  the second is guaranteed by the first.
- Blocked: Argentina Win (`match_result`) + 2-1 Argentina (`correct_score`) —
  the second determines the first.
- Allowed: Spain Win (`match_result`) + Over 2.5 Goals (`over_under`) — a
  2-1, 3-0, 3-1, etc. scoreline all satisfy both independently of each other.

### 2. `correct_score` is blocked against anything it fully determines

An exact scoreline pins down *every* stat derived purely from the final
score, so `correct_score` can't be combined with:

- `over_under` — the two digits in a correct-score pick sum to the total
  goals line.
- `btts` — a correct-score pick where both digits are ≥1 always means BTTS
  Yes; any score with a 0 always means BTTS No.

`over_under` and `btts` are each allowed to combine with everything *except*
`correct_score`, because on their own neither one pins down the exact score
(a 2-1 and a 3-0 both satisfy "Over 2.5", but they disagree on BTTS).

- Blocked: 2-1 Spain (`correct_score`) + Over 2.5 Goals (`over_under`) —
  2-1 sums to exactly 3, so this pairing is redundant, not two risks.
- Blocked: 1-1 (`correct_score`) + BTTS Yes (`btts`) — a 1-1 scoreline
  already guarantees BTTS Yes.
- Allowed: BTTS Yes (`btts`) + Over 2.5 Goals (`over_under`) — this is the
  classic "BTTS & Over" multi; neither implies the other (3-0 is Over but
  not BTTS; 1-1 is BTTS but not Over).
- Allowed: Spain Win (`match_result`) + BTTS Yes (`btts`) — a win doesn't
  determine whether both teams scored (2-0 vs 2-1 both have Spain winning).

### 3. `first_scorer` is blocked against `anytime_scorer` for reasoning, not for the same player only

Scoring first is a subset of scoring at any point in the match — whoever
opens the scoring has, by definition, also scored "anytime". So:

- Blocked: Messi First Goalscorer + Messi Anytime Goalscorer — scoring first
  guarantees the anytime leg, so this only ever doubles up on one real event.
- Blocked (same reasoning, different player): once the guard sees both
  market types on one match, it rejects the combination — a first-scorer
  pick, if it hits, is always accompanied by that same player's own
  anytime-scorer market resolving Yes, so mixing the two market types on
  a single match is never priced as two independent risks even when the
  legs name different players. Pick a first-scorer leg *or* anytime-scorer
  leg(s) for a match, not both.
- Allowed: Messi Anytime Goalscorer + Lautaro Martinez Anytime Goalscorer —
  same market type, different players; both can independently hit (or
  both miss) since either or both may score.
- Allowed: Messi First Goalscorer + Spain Win (`match_result`) — Messi
  scoring first doesn't guarantee Spain wins (Argentina can still equalise
  and win), and Spain winning doesn't guarantee Messi scored first.

### 4. Cards and corners are fully independent stats

`over_under_cards` and `total_corners` aren't derived from the scoreline,
the winner, or any goalscorer market — a disciplined, high-corner-count
draw and a card-heavy 4-0 win are both plausible. **They combine freely
with every other market type on the sheet, including each other and
`match_result`/`correct_score`/`btts`/`over_under`/scorer markets.**

- Allowed: Spain Win + Over 8.5 Corners + Under 2.5 Cards — three
  genuinely independent risks.

### 5. Cross-match legs never conflict

All of the above only applies to two legs on the *same* match. A Spain v
Argentina selection and a France v England selection are always
combinable with each other regardless of market type, because they're
settled by two different, unrelated events.

## Summary table (same match only)

| | `match_result` / `double_chance` / `qualify` | `correct_score` | `over_under` | `btts` | `over_under_cards` | `total_corners` | `first_scorer` | `anytime_scorer` |
|---|---|---|---|---|---|---|---|---|
| **`match_result`/`double_chance`/`qualify`** | ✗ (same group) | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **`correct_score`** | ✗ | — | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| **`over_under`** | ✓ | ✗ | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| **`btts`** | ✓ | ✗ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| **`over_under_cards`** | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| **`total_corners`** | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| **`first_scorer`** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✗ |
| **`anytime_scorer`** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | — |

✓ = combinable, ✗ = blocked (`parlay_correlated_legs`)

## Implementation

Enforced server-side in the `place_parlay` Postgres RPC — the client can't
be trusted as the sole gate since a direct RPC call would bypass any
UI-only check. Current guard clause (`supabase/final-third-place-markets.sql`):

```sql
HAVING (
  COUNT(DISTINCT market_type) FILTER (
    WHERE market_type IN ('match_result', 'correct_score', 'double_chance', 'qualify')
  ) > 1
  OR (bool_or(market_type = 'correct_score') AND bool_or(market_type = 'over_under'))
  OR (bool_or(market_type = 'correct_score') AND bool_or(market_type = 'btts'))
  OR (bool_or(market_type = 'first_scorer') AND bool_or(market_type = 'anytime_scorer'))
)
```

This already matches every rule above — `over_under_cards`/`total_corners`
correctly have no clause (rule 4), and `over_under`/`btts` are only blocked
against `correct_score`, not against each other or `match_result` (rule 2).

If a new market type is added in the future, work out its correlation
against each existing type using the same test: *does either selection's
result ever fully determine the other's, for every possible final scoreline
consistent with both?* If yes for any pairing, add a clause here and to the
table above.

// ─────────────────────────────────────────────────────────────────────────────
// Static 2026 FIFA World Cup fixture scaffold — the source of truth for the
// betting page UI. All 104 matches (72 group + 32 knockout) are hardcoded here.
//
// Only TEAMS (group teams known; knockout slots resolve as the tournament
// progresses) and ODDS are data-driven elsewhere. This file never holds odds.
//
// Each fixture: { match_no, stage, group, matchday, kickoff_utc, venue,
//   home, away }  where home/away is either:
//     { code: 'MEX' }                         → a resolved team (3-letter code)
//     { slot: 'W_A', label: 'Winner Group A'} → an unresolved knockout slot
//
// Group teams/pairings/dates/venues cross-checked against FIFA.com, Sky Sports
// per-group guides, ESPN, Yahoo and Al Jazeera (June 2026). Kick-off times are
// in UTC; a handful are approximate and flagged for validation before markets
// go live. stage ∈ group|r32|r16|qf|sf|third|final.
// ─────────────────────────────────────────────────────────────────────────────

// Group-stage rows: [match_no, group, matchday, home, away, kickoff_utc, venue]
const _WC2026_GROUP_ROWS = [
  // ── Group A ──
  [1,  'A', 1, 'MEX', 'RSA', '2026-06-11T19:00:00Z', 'Estadio Azteca, Mexico City'],
  [2,  'A', 1, 'KOR', 'CZE', '2026-06-12T02:00:00Z', 'Estadio Akron, Guadalajara'],
  [3,  'A', 2, 'CZE', 'RSA', '2026-06-18T16:00:00Z', 'Mercedes-Benz Stadium, Atlanta'],
  [4,  'A', 2, 'MEX', 'KOR', '2026-06-19T03:00:00Z', 'Estadio Akron, Guadalajara'],
  [5,  'A', 3, 'CZE', 'MEX', '2026-06-25T03:00:00Z', 'Estadio Azteca, Mexico City'],
  [6,  'A', 3, 'RSA', 'KOR', '2026-06-25T03:00:00Z', 'Estadio BBVA, Monterrey'],
  // ── Group B ──
  [7,  'B', 1, 'CAN', 'BIH', '2026-06-12T22:00:00Z', 'BMO Field, Toronto'],
  [8,  'B', 1, 'QAT', 'SUI', '2026-06-13T19:00:00Z', "Levi's Stadium, San Francisco Bay"],
  [9,  'B', 2, 'SUI', 'BIH', '2026-06-18T19:00:00Z', 'SoFi Stadium, Los Angeles'],
  [10, 'B', 2, 'CAN', 'QAT', '2026-06-18T22:00:00Z', 'BC Place, Vancouver'],
  [11, 'B', 3, 'SUI', 'CAN', '2026-06-24T19:00:00Z', 'BC Place, Vancouver'],
  [12, 'B', 3, 'BIH', 'QAT', '2026-06-24T19:00:00Z', 'Lumen Field, Seattle'],
  // ── Group C ──
  [13, 'C', 1, 'BRA', 'MAR', '2026-06-13T22:00:00Z', 'MetLife Stadium, New York/New Jersey'],
  [14, 'C', 1, 'HAI', 'SCO', '2026-06-14T01:00:00Z', 'Gillette Stadium, Boston'],
  [15, 'C', 2, 'SCO', 'MAR', '2026-06-19T22:00:00Z', 'Gillette Stadium, Boston'],
  [16, 'C', 2, 'BRA', 'HAI', '2026-06-20T01:00:00Z', 'Lincoln Financial Field, Philadelphia'],
  [17, 'C', 3, 'SCO', 'BRA', '2026-06-24T22:00:00Z', 'Hard Rock Stadium, Miami'],
  [18, 'C', 3, 'MAR', 'HAI', '2026-06-24T22:00:00Z', 'Mercedes-Benz Stadium, Atlanta'],
  // ── Group D ──
  [19, 'D', 1, 'USA', 'PAR', '2026-06-12T22:00:00Z', 'SoFi Stadium, Los Angeles'],
  [20, 'D', 1, 'AUS', 'TUR', '2026-06-14T01:00:00Z', 'BC Place, Vancouver'],
  [21, 'D', 2, 'USA', 'AUS', '2026-06-19T19:00:00Z', 'Lumen Field, Seattle'],
  [22, 'D', 2, 'TUR', 'PAR', '2026-06-20T04:00:00Z', "Levi's Stadium, San Francisco Bay"],
  [23, 'D', 3, 'TUR', 'USA', '2026-06-26T02:00:00Z', 'SoFi Stadium, Los Angeles'],
  [24, 'D', 3, 'PAR', 'AUS', '2026-06-26T02:00:00Z', "Levi's Stadium, San Francisco Bay"],
  // ── Group E ──
  [25, 'E', 1, 'GER', 'CUW', '2026-06-14T17:00:00Z', 'NRG Stadium, Houston'],
  [26, 'E', 1, 'CIV', 'ECU', '2026-06-14T23:00:00Z', 'Lincoln Financial Field, Philadelphia'],
  [27, 'E', 2, 'GER', 'CIV', '2026-06-20T20:00:00Z', 'BMO Field, Toronto'],
  [28, 'E', 2, 'ECU', 'CUW', '2026-06-21T00:00:00Z', 'Arrowhead Stadium, Kansas City'],
  [29, 'E', 3, 'CUW', 'CIV', '2026-06-25T20:00:00Z', 'Lincoln Financial Field, Philadelphia'],
  [30, 'E', 3, 'ECU', 'GER', '2026-06-25T20:00:00Z', 'MetLife Stadium, New York/New Jersey'],
  // ── Group F ──
  [31, 'F', 1, 'NED', 'JPN', '2026-06-14T20:00:00Z', 'AT&T Stadium, Dallas'],
  [32, 'F', 1, 'SWE', 'TUN', '2026-06-15T02:00:00Z', 'Estadio BBVA, Monterrey'],
  [33, 'F', 2, 'NED', 'SWE', '2026-06-20T17:00:00Z', 'NRG Stadium, Houston'],
  [34, 'F', 2, 'TUN', 'JPN', '2026-06-20T04:00:00Z', 'Estadio BBVA, Monterrey'],
  [35, 'F', 3, 'JPN', 'SWE', '2026-06-25T23:00:00Z', 'AT&T Stadium, Dallas'],
  [36, 'F', 3, 'TUN', 'NED', '2026-06-25T23:00:00Z', 'Arrowhead Stadium, Kansas City'],
  // ── Group G ──
  [37, 'G', 1, 'BEL', 'EGY', '2026-06-15T19:00:00Z', 'Lumen Field, Seattle'],
  [38, 'G', 1, 'IRN', 'NZL', '2026-06-16T01:00:00Z', 'SoFi Stadium, Los Angeles'],
  [39, 'G', 2, 'BEL', 'IRN', '2026-06-21T19:00:00Z', 'SoFi Stadium, Los Angeles'],
  [40, 'G', 2, 'NZL', 'EGY', '2026-06-22T01:00:00Z', 'BC Place, Vancouver'],
  [41, 'G', 3, 'EGY', 'IRN', '2026-06-27T03:00:00Z', 'Lumen Field, Seattle'],
  [42, 'G', 3, 'NZL', 'BEL', '2026-06-27T03:00:00Z', 'BC Place, Vancouver'],
  // ── Group H ──
  [43, 'H', 1, 'ESP', 'CPV', '2026-06-15T16:00:00Z', 'Mercedes-Benz Stadium, Atlanta'],
  [44, 'H', 1, 'KSA', 'URU', '2026-06-15T22:00:00Z', 'Hard Rock Stadium, Miami'],
  [45, 'H', 2, 'ESP', 'KSA', '2026-06-21T16:00:00Z', 'Mercedes-Benz Stadium, Atlanta'],
  [46, 'H', 2, 'URU', 'CPV', '2026-06-21T22:00:00Z', 'Hard Rock Stadium, Miami'],
  [47, 'H', 3, 'CPV', 'KSA', '2026-06-27T00:00:00Z', 'NRG Stadium, Houston'],
  [48, 'H', 3, 'URU', 'ESP', '2026-06-27T00:00:00Z', 'Estadio Akron, Guadalajara'],
  // ── Group I ──
  [49, 'I', 1, 'FRA', 'SEN', '2026-06-16T19:00:00Z', 'MetLife Stadium, New York/New Jersey'],
  [50, 'I', 1, 'IRQ', 'NOR', '2026-06-16T22:00:00Z', 'Gillette Stadium, Boston'],
  [51, 'I', 2, 'FRA', 'IRQ', '2026-06-22T21:00:00Z', 'Lincoln Financial Field, Philadelphia'],
  [52, 'I', 2, 'NOR', 'SEN', '2026-06-23T00:00:00Z', 'MetLife Stadium, New York/New Jersey'],
  [53, 'I', 3, 'NOR', 'FRA', '2026-06-26T19:00:00Z', 'Gillette Stadium, Boston'],
  [54, 'I', 3, 'SEN', 'IRQ', '2026-06-26T19:00:00Z', 'BMO Field, Toronto'],
  // ── Group J ──
  [55, 'J', 1, 'ARG', 'ALG', '2026-06-17T01:00:00Z', 'Arrowhead Stadium, Kansas City'],
  [56, 'J', 1, 'AUT', 'JOR', '2026-06-17T04:00:00Z', "Levi's Stadium, San Francisco Bay"],
  [57, 'J', 2, 'ARG', 'AUT', '2026-06-22T17:00:00Z', 'AT&T Stadium, Dallas'],
  [58, 'J', 2, 'JOR', 'ALG', '2026-06-23T03:00:00Z', "Levi's Stadium, San Francisco Bay"],
  [59, 'J', 3, 'ALG', 'AUT', '2026-06-28T02:00:00Z', 'Arrowhead Stadium, Kansas City'],
  [60, 'J', 3, 'JOR', 'ARG', '2026-06-28T02:00:00Z', 'AT&T Stadium, Dallas'],
  // ── Group K ──
  [61, 'K', 1, 'POR', 'COD', '2026-06-17T17:00:00Z', 'NRG Stadium, Houston'],
  [62, 'K', 1, 'UZB', 'COL', '2026-06-18T02:00:00Z', 'Estadio Azteca, Mexico City'],
  [63, 'K', 2, 'POR', 'UZB', '2026-06-23T17:00:00Z', 'NRG Stadium, Houston'],
  [64, 'K', 2, 'COL', 'COD', '2026-06-24T02:00:00Z', 'Estadio Akron, Guadalajara'],
  [65, 'K', 3, 'COL', 'POR', '2026-06-27T23:30:00Z', 'Hard Rock Stadium, Miami'],
  [66, 'K', 3, 'COD', 'UZB', '2026-06-27T23:30:00Z', 'Mercedes-Benz Stadium, Atlanta'],
  // ── Group L ──
  [67, 'L', 1, 'ENG', 'CRO', '2026-06-17T20:00:00Z', 'AT&T Stadium, Dallas'],
  [68, 'L', 1, 'GHA', 'PAN', '2026-06-17T23:00:00Z', 'BMO Field, Toronto'],
  [69, 'L', 2, 'ENG', 'GHA', '2026-06-23T20:00:00Z', 'Gillette Stadium, Boston'],
  [70, 'L', 2, 'PAN', 'CRO', '2026-06-23T23:00:00Z', 'BMO Field, Toronto'],
  [71, 'L', 3, 'ENG', 'PAN', '2026-06-27T21:00:00Z', 'MetLife Stadium, New York/New Jersey'],
  [72, 'L', 3, 'CRO', 'GHA', '2026-06-27T21:00:00Z', 'Lincoln Financial Field, Philadelphia'],
];

// Knockout rows: [match_no, stage, homeSlot, awaySlot, kickoff_utc, venue]
// Slot tokens: W_X=winner group X, R_X=runner-up group X, 3_XYZ…=best-third from
// one of those groups, W## / L## = winner/loser of match ##.
const _WC2026_KO_ROWS = [
  // ── Round of 32 (73–88) ──
  [73,  'r32', 'R_A',     'R_B',     '2026-06-28T19:00:00Z', 'SoFi Stadium, Los Angeles'],
  [74,  'r32', 'W_E',     '3_ABCDF', '2026-06-29T20:30:00Z', 'Gillette Stadium, Boston'],
  [75,  'r32', 'W_F',     'R_C',     '2026-06-30T02:00:00Z', 'Estadio BBVA, Monterrey'],
  [76,  'r32', 'W_C',     'R_F',     '2026-06-29T17:00:00Z', 'NRG Stadium, Houston'],
  [77,  'r32', 'W_I',     '3_CDFGH', '2026-06-30T21:00:00Z', 'MetLife Stadium, New York/New Jersey'],
  [78,  'r32', 'R_E',     'R_I',     '2026-06-30T17:00:00Z', 'AT&T Stadium, Dallas'],
  [79,  'r32', 'W_A',     '3_CEFHI', '2026-07-01T03:00:00Z', 'Estadio Azteca, Mexico City'],
  [80,  'r32', 'W_L',     '3_EHIJK', '2026-07-01T16:00:00Z', 'Mercedes-Benz Stadium, Atlanta'],
  [81,  'r32', 'W_D',     '3_BEFIJ', '2026-07-02T03:00:00Z', "Levi's Stadium, San Francisco Bay"],
  [82,  'r32', 'W_G',     '3_AEHIJ', '2026-07-01T23:00:00Z', 'Lumen Field, Seattle'],
  [83,  'r32', 'R_K',     'R_L',     '2026-07-02T23:00:00Z', 'BMO Field, Toronto'],
  [84,  'r32', 'W_H',     'R_J',     '2026-07-02T19:00:00Z', 'SoFi Stadium, Los Angeles'],
  [85,  'r32', 'W_B',     '3_EFGIJ', '2026-07-03T03:00:00Z', 'BC Place, Vancouver'],
  [86,  'r32', 'W_J',     'R_H',     '2026-07-03T22:00:00Z', 'Hard Rock Stadium, Miami'],
  [87,  'r32', 'W_K',     '3_DEIJL', '2026-07-04T01:30:00Z', 'Arrowhead Stadium, Kansas City'],
  [88,  'r32', 'R_D',     'R_G',     '2026-07-03T18:00:00Z', 'AT&T Stadium, Dallas'],
  // ── Round of 16 (89–96) ──
  [89,  'r16', 'W74', 'W77', '2026-07-04T21:00:00Z', 'Lincoln Financial Field, Philadelphia'],
  [90,  'r16', 'W73', 'W75', '2026-07-04T18:00:00Z', 'NRG Stadium, Houston'],
  [91,  'r16', 'W76', 'W78', '2026-07-05T20:00:00Z', 'MetLife Stadium, New York/New Jersey'],
  [92,  'r16', 'W79', 'W80', '2026-07-06T00:00:00Z', 'Estadio Azteca, Mexico City'],
  [93,  'r16', 'W83', 'W84', '2026-07-06T19:00:00Z', 'AT&T Stadium, Dallas'],
  [94,  'r16', 'W81', 'W82', '2026-07-06T21:00:00Z', 'Lumen Field, Seattle'],
  [95,  'r16', 'W86', 'W88', '2026-07-07T16:00:00Z', 'Mercedes-Benz Stadium, Atlanta'],
  [96,  'r16', 'W85', 'W87', '2026-07-07T20:00:00Z', 'BC Place, Vancouver'],
  // ── Quarter-finals (97–100) ──
  [97,  'qf', 'W89', 'W90', '2026-07-09T20:00:00Z', 'Gillette Stadium, Boston'],
  [98,  'qf', 'W93', 'W94', '2026-07-10T19:00:00Z', 'SoFi Stadium, Los Angeles'],
  [99,  'qf', 'W91', 'W92', '2026-07-11T21:00:00Z', 'Hard Rock Stadium, Miami'],
  [100, 'qf', 'W95', 'W96', '2026-07-12T01:00:00Z', 'Arrowhead Stadium, Kansas City'],
  // ── Semi-finals (101–102) ──
  [101, 'sf', 'W97', 'W98',  '2026-07-14T19:00:00Z', 'AT&T Stadium, Dallas'],
  [102, 'sf', 'W99', 'W100', '2026-07-15T19:00:00Z', 'Mercedes-Benz Stadium, Atlanta'],
  // ── Third-place play-off (103) ──
  [103, 'third', 'L101', 'L102', '2026-07-18T21:00:00Z', 'Hard Rock Stadium, Miami'],
  // ── Final (104) ──
  [104, 'final', 'W101', 'W102', '2026-07-19T19:00:00Z', 'MetLife Stadium, New York/New Jersey'],
];

// Human-readable label for a knockout slot token.
function wcSlotLabel(slot) {
  if (/^W_[A-L]$/.test(slot))  return `Winner Group ${slot[2]}`;
  if (/^R_[A-L]$/.test(slot))  return `Runner-up Group ${slot[2]}`;
  if (/^3_[A-L]+$/.test(slot)) return `3rd ${slot.slice(2).split('').join('/')}`;
  if (/^W\d+$/.test(slot))     return `Winner Match ${slot.slice(1)}`;
  if (/^L\d+$/.test(slot))     return `Loser Match ${slot.slice(1)}`;
  return slot;
}

// Build the unified 104-fixture list.
const WC2026_FIXTURES = [
  ..._WC2026_GROUP_ROWS.map(([match_no, group, matchday, home, away, kickoff_utc, venue]) => ({
    match_no, stage: 'group', group, matchday, kickoff_utc, venue,
    home: { code: home }, away: { code: away },
  })),
  ..._WC2026_KO_ROWS.map(([match_no, stage, homeSlot, awaySlot, kickoff_utc, venue]) => ({
    match_no, stage, group: null, matchday: null, kickoff_utc, venue,
    home: { slot: homeSlot, label: wcSlotLabel(homeSlot) },
    away: { slot: awaySlot, label: wcSlotLabel(awaySlot) },
  })),
];

const FIXTURE_BY_NO = WC2026_FIXTURES.reduce((acc, f) => { acc[f.match_no] = f; return acc; }, {});

// Knockout progression: which earlier matches feed each match's two slots.
// Used later to auto-resolve knockout teams as results come in (Phase 5).
const BRACKET_FEED = {
  89: ['W74', 'W77'], 90: ['W73', 'W75'], 91: ['W76', 'W78'], 92: ['W79', 'W80'],
  93: ['W83', 'W84'], 94: ['W81', 'W82'], 95: ['W86', 'W88'], 96: ['W85', 'W87'],
  97: ['W89', 'W90'], 98: ['W93', 'W94'], 99: ['W91', 'W92'], 100: ['W95', 'W96'],
  101: ['W97', 'W98'], 102: ['W99', 'W100'], 103: ['L101', 'L102'], 104: ['W101', 'W102'],
};

// Expose on window so browser scripts can access via window.WC2026_FIXTURES.
// (const/let at top level don't become window properties unlike var.)
if (typeof window !== 'undefined') {
  window.WC2026_FIXTURES = WC2026_FIXTURES;
  window.FIXTURE_BY_NO   = FIXTURE_BY_NO;
}

// CommonJS export so server code (api/) can reuse the same data.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WC2026_FIXTURES, FIXTURE_BY_NO, BRACKET_FEED, wcSlotLabel };
}

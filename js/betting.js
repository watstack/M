// Betting page logic.
// Expects: db, CONFIG, renderAvatar, teamFlagEmoji, getFlagColors, WC_2026_TEAMS
// Markets + odds are created/refreshed server-side by /api/markets; this file
// only reads bet_markets and renders.

// ─── Correct-score fixed odds lookup ─────────────────────────────────────────

const CORRECT_SCORE_ODDS = {
  '0-0':8,  '1-0':6,  '0-1':6,  '1-1':6,
  '2-0':8,  '0-2':8,  '2-1':8,  '1-2':8,
  '2-2':12, '3-0':14, '0-3':14, '3-1':16,
  '1-3':16, '3-2':22, '2-3':22, '4-0':28,
  '0-4':28, '4-1':32, '1-4':32, '4-2':40,
  '2-4':40, '3-3':35, '5-0':50, '0-5':50,
};
const DEFAULT_CS_ODDS = 50;

function csOdds(score) { return CORRECT_SCORE_ODDS[score] ?? DEFAULT_CS_ODDS; }

// ─── Score grid helper ────────────────────────────────────────────────────────

function buildScoreGrid(matchId, matchNo) {
  const homeScores = [
    '1-0','2-0','2-1','3-0','3-1','3-2','4-0','4-1','4-2','5-0'
  ];
  const draws = ['0-0','1-1','2-2','3-3'];
  const awayScores = [
    '0-1','0-2','1-2','0-3','1-3','2-3','0-4','1-4','2-4','0-5'
  ];

  function scoreBtn(score) {
    return `<button class="score-btn" data-market-id="${matchId}" data-selection="${score}" data-odds="${csOdds(score)}" data-match-no="${matchNo || ''}" data-market-type="correct_score" onclick="selectBet(this)">
      ${score} <span class="score-odds">${csOdds(score)}x</span>
    </button>`;
  }

  return `<div class="score-grid">
    <div class="score-section">
      <div class="score-label">Home win</div>
      <div class="score-btns">${homeScores.map(scoreBtn).join('')}</div>
    </div>
    <div class="score-section">
      <div class="score-label">Draw</div>
      <div class="score-btns">${draws.map(scoreBtn).join('')}</div>
    </div>
    <div class="score-section">
      <div class="score-label">Away win</div>
      <div class="score-btns">${awayScores.map(scoreBtn).join('')}</div>
    </div>
  </div>`;
}

// ─── Double-chance row helper ─────────────────────────────────────────────────

function buildDoubleChanceRow(marketId, matchNo, oddsJson, canBet) {
  const o = oddsJson || {};
  const btn = (sel, label) =>
    (canBet && o[sel] != null)
      ? oddsBtn(marketId, sel, label, o[sel], false, false, matchNo, 'double_chance')
      : oddsTbc(label);
  return `<div class="dc-row">
    ${btn('1x', 'Home Draw')}
    ${btn('x2', 'Draw Away')}
    ${btn('12', 'Home Away')}
  </div>`;
}

// ─── Market reads ─────────────────────────────────────────────────────────────

async function loadOpenMarkets(tournamentId) {
  const { data, error } = await db
    .from('bet_markets')
    .select('*')
    .eq('tournament_id', tournamentId)
    .in('status', ['open', 'closed', 'settled'])
    .order('match_no', { ascending: true, nullsLast: true });
  if (error) throw error;
  return data || [];
}

// Index DB market rows by match_no → { match_result, correct_score }.
// The page scaffold is driven by the static WC2026_FIXTURES list; these rows
// (when present) supply the bet_markets UUID, live odds, status and result.
function indexMarketsByMatchNo(markets) {
  const byNo = {};
  for (const m of markets || []) {
    if (m.match_no == null) continue;
    (byNo[m.match_no] ||= {})[m.market_type] = m;
  }
  return byNo;
}

async function loadMyBets(tournamentId, participantId) {
  const [singlesResult, parlaysResult] = await Promise.all([
    db.from('bets')
      .select('*, bet_markets(match_name, market_type, result, status)')
      .eq('tournament_id', tournamentId)
      .eq('participant_id', participantId)
      .order('placed_at', { ascending: false }),
    db.from('parlay_bets')
      .select('*, parlay_bet_legs(*, bet_markets(match_name, market_type, result, status))')
      .eq('tournament_id', tournamentId)
      .eq('participant_id', participantId)
      .order('placed_at', { ascending: false }),
  ]);
  if (singlesResult.error) throw singlesResult.error;
  if (parlaysResult.error) throw parlaysResult.error;
  return {
    singleBets: singlesResult.data || [],
    parlayBets: parlaysResult.data || [],
  };
}

// ─── Bet placement ────────────────────────────────────────────────────────────

async function placeBet(marketId, participantId, selection, stake, odds) {
  const { data, error } = await db.rpc('place_bet', {
    p_market_id: marketId,
    p_participant_id: participantId,
    p_selection: selection,
    p_stake: stake,
    p_odds: odds,
  });
  if (error) {
    const msg = error.message || '';
    if (msg.includes('market_closed')) throw new Error('Betting on this match has closed');
    if (msg.includes('insufficient_balance')) throw new Error('Not enough coins');
    if (msg.includes('market_not_found')) throw new Error('Market not found');
    throw error;
  }
  return data;
}

async function placeParlay(participantId, legs, stake, totalOdds) {
  const { data, error } = await db.rpc('place_parlay', {
    p_participant_id: participantId,
    p_legs:           legs,
    p_stake:          stake,
    p_total_odds:     totalOdds,
  });
  if (error) {
    const msg = error.message || '';
    if (msg.includes('market_closed'))        throw new Error('One or more markets have closed');
    if (msg.includes('market_locked'))        throw new Error('One or more markets are not yet available');
    if (msg.includes('insufficient_balance')) throw new Error('Not enough coins');
    if (msg.includes('market_not_found'))     throw new Error('Market not found');
    if (msg.includes('parlay_too_few_legs'))    throw new Error('A multi needs at least 2 selections');
    if (msg.includes('parlay_correlated_legs')) throw new Error('nice try you cheeky bastard.\n\non ya bike 🚲');
    throw error;
  }
  return data;
}

// ─── Countdown helper ─────────────────────────────────────────────────────────

function formatCountdown(isoDate) {
  if (!isoDate) return '';
  const diff = new Date(isoDate) - Date.now();
  if (diff <= 0) return 'Kicked off';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h >= 48) return `${Math.floor(h / 24)}d`;
  if (h >= 1) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatKickoff(isoDate) {
  if (!isoDate) return '';
  return new Date(isoDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ─── Stage layout metadata ────────────────────────────────────────────────────

const STAGE_KNOCKOUT = ['r32', 'r16', 'qf', 'sf', 'third', 'final'];
const STAGE_LABELS = {
  r32:   'Round of 32',
  r16:   'Round of 16',
  qf:    'Quarter-Finals',
  sf:    'Semi-Finals',
  third: 'Third-Place Play-off',
  final: 'Final',
};

// Resolve one side of a fixture for display.
// A side is { code:'MEX' } (resolved team) or { slot, label } (knockout placeholder).
function sideDisplay(side) {
  side = side || {};
  if (side.code) {
    const fc = (typeof FLAG_COLORS !== 'undefined' && FLAG_COLORS[side.code]) || null;
    const flag = (typeof teamFlagEmoji === 'function') ? teamFlagEmoji(side.code) : '🏳';
    return { name: (fc && fc.name) || side.code, flag, code: side.code, resolved: true };
  }
  return { name: side.label || 'TBC', flag: '🏳', code: null, resolved: false };
}

// Returns false if a fixture's market is closed/settled or kickoff has passed.
function isUpcoming(fixture, marketsByNo) {
  const mr = (marketsByNo[fixture.match_no] || {}).match_result;
  if (mr && (mr.status === 'settled' || mr.status === 'closed')) return false;
  if (fixture.kickoff_utc && new Date(fixture.kickoff_utc) < new Date()) return false;
  return true;
}

// ─── Full fixtures scaffold ──────────────────────────────────────────────────
// Drives the page off the static WC2026_FIXTURES list so every match always
// renders. marketsByNo (from indexMarketsByMatchNo) overlays live odds/status.
// sortMode: 'group' (default) = upcoming only, grouped by stage/group;
//           'upcoming' = all matches chronologically under date headers.
function renderFixturesView(marketsByNo, sortMode) {
  sortMode = sortMode || 'group';
  marketsByNo = marketsByNo || {};
  const now = new Date();
  const allFixtures = (typeof WC2026_FIXTURES !== 'undefined' ? WC2026_FIXTURES : [])
    .slice().sort((a, b) => a.match_no - b.match_no);
  if (!allFixtures.length) return '';

  if (sortMode === 'upcoming') {
    // Future/open matches only, chronological, grouped under date headers.
    const sorted = allFixtures
      .filter(f => isUpcoming(f, marketsByNo))
      .sort((a, b) => {
        const ta = a.kickoff_utc || '';
        const tb = b.kickoff_utc || '';
        return ta < tb ? -1 : ta > tb ? 1 : 0;
      });
    let html = '';
    let lastDate = null;
    for (const f of sorted) {
      const dateStr = f.kickoff_utc
        ? new Date(f.kickoff_utc).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
        : 'TBC';
      if (dateStr !== lastDate) {
        html += `<div class="bet-section-title">${dateStr}</div>`;
        lastDate = dateStr;
      }
      html += renderMatchCard(f, marketsByNo[f.match_no]);
    }
    return html;
  }

  // Group mode: hide past and settled matches.
  const fixtures = allFixtures.filter(f => isUpcoming(f, marketsByNo));

  let html = '';

  // Group stage, sub-grouped by group letter.
  const groupFx = fixtures.filter(f => f.stage === 'group');
  if (groupFx.length) {
    html += `<div class="bet-section-title">Group Stage</div>`;
    const byGroup = {};
    for (const f of groupFx) (byGroup[f.group] ||= []).push(f);
    for (const letter of Object.keys(byGroup).sort()) {
      html += `<div class="bet-group-title">Group ${letter}</div>`;
      const rows = byGroup[letter].sort((a, b) =>
        (a.matchday - b.matchday) || (a.match_no - b.match_no));
      html += rows.map(f => renderMatchCard(f, marketsByNo[f.match_no])).join('');
    }
  }

  // Knockout stages.
  for (const stage of STAGE_KNOCKOUT) {
    const rows = fixtures.filter(f => f.stage === stage);
    if (!rows.length) continue;
    html += `<div class="bet-section-title">${STAGE_LABELS[stage]}</div>`;
    html += rows.map(f => renderMatchCard(f, marketsByNo[f.match_no])).join('');
  }

  return html;
}

// ─── Market card rendering ────────────────────────────────────────────────────

// fixture = static WC2026_FIXTURES row; pair = { match_result, correct_score }
// DB market rows for that match_no (may be undefined before markets are created).
function renderMatchCard(fixture, pair) {
  pair = pair || {};
  const mr = pair.match_result;
  const cs = pair.correct_score;

  // Prefer DB-resolved team codes (knockout slots fill in as the tournament
  // progresses) over the static fixture's placeholder slot.
  const homeSide = (mr && mr.home_code) ? { code: mr.home_code } : fixture.home;
  const awaySide = (mr && mr.away_code) ? { code: mr.away_code } : fixture.away;
  const home = sideDisplay(homeSide);
  const away = sideDisplay(awaySide);
  const locked = mr ? !!mr.locked : (!home.resolved || !away.resolved);

  const status    = mr ? mr.status : 'open';
  const isSettled = status === 'settled';
  const isClosed  = status !== 'open';
  const o = (mr && mr.odds_json) || {};
  const matchName = `${home.name} vs ${away.name}`;
  const kickoff   = formatKickoff(fixture.kickoff_utc);
  const venue     = fixture.venue ? `<span class="match-venue">${escapeHtml(fixture.venue)}</span>` : '';

  const statusChip = locked
    ? `<span class="market-chip locked">Locked</span>`
    : isSettled
    ? `<span class="market-chip settled">Settled</span>`
    : isClosed
    ? `<span class="market-chip closed">Closed</span>`
    : `<span class="market-chip open">${formatCountdown((mr && mr.close_time) || fixture.kickoff_utc)}</span>`;

  // Bettable only when a DB market exists, teams are resolved, and it's still open.
  const canBet  = !!(mr && mr.id) && !locked && !isClosed;
  const marketId = mr && mr.id;

  const resultBtn = (sel, label) => {
    if (canBet && o[sel] != null) {
      return oddsBtn(marketId, sel, label, o[sel], false, isSettled && mr.result === sel, fixture.match_no);
    }
    // Settled with odds but closed: show winner highlight when possible.
    if (isSettled && mr && o[sel] != null) {
      return oddsBtn(marketId, sel, label, o[sel], true, mr.result === sel, fixture.match_no);
    }
    return oddsTbc(label);
  };

  const dc = pair.double_chance;
  const showOtherAccordion = (!locked && !isClosed) && ((cs && cs.id) || (dc && dc.id));
  const otherAccordion = showOtherAccordion
    ? `<div class="cs-toggle" onclick="toggleCorrectScore(this)">
        <span>Other</span><span class="cs-arrow">▾</span>
      </div>
      <div class="cs-content hidden">
        ${dc && dc.id ? buildDoubleChanceRow(dc.id, fixture.match_no, dc.odds_json, canBet) : ''}
        ${cs && cs.id ? `<div class="dc-divider"></div>${buildScoreGrid(cs.id, fixture.match_no)}` : ''}
      </div>`
    : '';

  return `<div class="market-card${locked ? ' locked' : ''}" id="mc-${marketId || 'm' + fixture.match_no}" data-kickoff="${(mr && mr.close_time) || fixture.kickoff_utc || ''}">
    <div class="market-card-header">
      <div class="match-teams">
        <span class="team-side">
          <span class="team-flag">${home.flag}</span>
          <span class="team-name${home.resolved ? '' : ' tbc'}">${escapeHtml(home.name)}</span>
        </span>
        <span class="vs">v</span>
        <span class="team-side">
          <span class="team-flag">${away.flag}</span>
          <span class="team-name${away.resolved ? '' : ' tbc'}">${escapeHtml(away.name)}</span>
        </span>
      </div>
      <div class="match-meta">
        <span class="kickoff-time">${kickoff}</span>
        ${venue}
        ${statusChip}
      </div>
    </div>
    <span class="match-name" hidden>${escapeHtml(matchName)}</span>
    <div class="match-odds-row">
      ${resultBtn('home', 'Home')}
      ${resultBtn('draw', 'Draw')}
      ${resultBtn('away', 'Away')}
    </div>
    ${otherAccordion}
  </div>`;
}

function oddsTbc(label) {
  return `<button class="odds-btn disabled" disabled>
    <span class="odds-label">${label}</span>
    <span class="odds-price">TBC</span>
  </button>`;
}

function oddsBtn(marketId, selection, label, price, disabled, isResult, matchNo, marketType) {
  if (price == null) return '';
  const mt = marketType || 'match_result';
  const cls = ['odds-btn', disabled ? 'disabled' : '', isResult ? 'result-winner' : ''].filter(Boolean).join(' ');
  return `<button class="${cls}" data-market-id="${marketId}" data-selection="${selection}" data-odds="${price}" data-match-no="${matchNo || ''}" data-market-type="${mt}"
    onclick="selectBet(this)" ${disabled ? 'disabled' : ''}>
    <span class="odds-label">${label}</span>
    <span class="odds-price">${price}</span>
  </button>`;
}


// ─── Admin settlement / resolution view ──────────────────────────────────────
// Compact per-match controls, shown only when an admin token is present.
// ─── All settled bets (community view) ───────────────────────────────────────

async function loadAllSettledBets(tournamentId) {
  const { data, error } = await db
    .from('bets')
    .select('*, bet_markets(match_name, market_type, result, status, kickoff_time, match_no), participants(id, nickname, avatar_type)')
    .eq('tournament_id', tournamentId)
    .in('status', ['won', 'lost', 'void']);
  if (error) throw error;
  return (data || []).sort((a, b) => {
    const ta = a.placed_at || '';
    const tb = b.placed_at || '';
    return ta > tb ? -1 : ta < tb ? 1 : 0;
  });
}

function renderAllBetRow(bet) {
  const p = bet.participants || {};
  const mkt = bet.bet_markets || {};
  const statusClass = { won: 'won', lost: 'lost', void: 'void' }[bet.status] || 'pending';
  const payout = bet.status === 'won'
    ? `+${bet.potential_payout} 🪙`
    : bet.status === 'lost'
    ? `-${bet.stake} 🪙`
    : `${bet.potential_payout} 🪙`;
  const fmtDate = ts => ts ? new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—';
  return `<div class="my-bet-row all-bet-row">
    <div class="all-bet-user">
      ${renderAvatar(p.avatar_type, null, 28)}
      <span class="all-bet-nick">${escapeHtml(p.nickname || '?')}</span>
    </div>
    <div class="my-bet-match">${escapeHtml(mkt.match_name || '')}</div>
    <div class="my-bet-detail">
      <span class="my-bet-selection">${escapeHtml(bet.selection)}</span>
      <span class="my-bet-odds">${bet.odds}x</span>
      <span class="my-bet-stake">${bet.stake} 🪙</span>
    </div>
    <div class="my-bet-result">
      <span class="bet-status ${statusClass}">${bet.status}</span>
      <span class="my-bet-payout">${payout}</span>
    </div>
    <div class="all-bet-dates">
      <div class="all-bet-date-item">
        <span class="all-bet-date-label">Placed</span>
        <span class="all-bet-date-value">${fmtDate(bet.placed_at)}</span>
      </div>
      <div class="all-bet-date-item">
        <span class="all-bet-date-label">Settled</span>
        <span class="all-bet-date-value">${fmtDate(mkt.kickoff_time)}</span>
      </div>
    </div>
  </div>`;
}

const _shareBetData = {};

function renderMyBetRow(bet) {
  _shareBetData[`single-${bet.id}`] = bet;
  const statusClass = { won: 'won', lost: 'lost', void: 'void', pending: 'pending' }[bet.status] || 'pending';
  const payout = bet.status === 'won' ? `+${bet.potential_payout} 🪙` : bet.status === 'lost' ? `-${bet.stake} 🪙` : `${bet.potential_payout} 🪙 if wins`;
  const mkt = bet.bet_markets || {};
  return `<div class="my-bet-row">
    <div class="my-bet-match">${escapeHtml(mkt.match_name || '')}</div>
    <div class="my-bet-detail">
      <span class="my-bet-selection">${escapeHtml(bet.selection)}</span>
      <span class="my-bet-odds">${bet.odds}x</span>
      <span class="my-bet-stake">${bet.stake} 🪙</span>
    </div>
    <div class="my-bet-result">
      <span class="bet-status ${statusClass}">${bet.status}</span>
      <span class="my-bet-payout">${payout}</span>
      <button class="my-bet-share-btn" onclick="openShareBet('single-${bet.id}')">↗ Share</button>
    </div>
  </div>`;
}

function renderParlayBetRow(parlay) {
  _shareBetData[`parlay-${parlay.id}`] = parlay;
  const legs = parlay.parlay_bet_legs || [];
  const statusClass = { won: 'won', lost: 'lost', void: 'void', pending: 'pending' }[parlay.status] || 'pending';
  const payout = parlay.status === 'won'
    ? `+${parlay.potential_payout} 🪙`
    : parlay.status === 'lost'
    ? `-${parlay.stake} 🪙`
    : `${parlay.potential_payout} 🪙 if all win`;
  const legIcon = { won: '✓', lost: '✗', void: '—', pending: '⏳' };
  const legsHtml = legs.map(leg => {
    const mkt = leg.bet_markets || {};
    const icon = legIcon[leg.status] || '⏳';
    return `<div class="parlay-leg">
      <span class="parlay-leg-icon ${leg.status || 'pending'}">${icon}</span>
      <span class="parlay-leg-match">${escapeHtml(mkt.match_name || '')}</span>
      <span class="parlay-leg-sel">${escapeHtml(leg.selection)}</span>
      <span class="parlay-leg-odds">${leg.odds}x</span>
    </div>`;
  }).join('');
  return `<div class="my-bet-row parlay-bet-row">
    <div class="parlay-header">
      <span class="parlay-label">Multi (${legs.length} legs)</span>
      <span class="parlay-total-odds">${Number(parlay.total_odds).toFixed(2)}x</span>
    </div>
    <div class="parlay-legs">${legsHtml}</div>
    <div class="my-bet-detail">
      <span class="my-bet-odds">${Number(parlay.total_odds).toFixed(2)}x total</span>
      <span class="my-bet-stake">${parlay.stake} 🪙</span>
    </div>
    <div class="my-bet-result">
      <span class="bet-status ${statusClass}">${parlay.status}</span>
      <span class="my-bet-payout">${payout}</span>
      <button class="my-bet-share-btn" onclick="openShareBet('parlay-${parlay.id}')">↗ Share</button>
    </div>
  </div>`;
}

// ─── Share bet ────────────────────────────────────────────────────────────────

function _buildBetCardHtml(key, bet) {
  const statusColor = { won: '#3cb04a', lost: '#ff3b5c', pending: '#ff9ad0', void: '#b58aa0' }[bet.status] || '#ff9ad0';
  const statusLabel = (bet.status || 'pending').toUpperCase();

  let bodyHtml;
  if (key.startsWith('single-')) {
    const mkt = bet.bet_markets || {};
    bodyHtml = `
      <div style="font-size:15px;font-weight:700;margin-bottom:10px;line-height:1.35;color:#f6ead8">${escapeHtml(mkt.match_name || '')}</div>
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px">
        <span style="background:rgba(255,154,208,0.15);border:1px solid rgba(255,154,208,0.5);border-radius:4px;padding:3px 10px;font-size:13px;color:#ff9ad0">${escapeHtml(bet.selection)}</span>
        <span style="font-size:13px;color:#b58aa0">${bet.odds}x</span>
      </div>
      <div style="font-size:12px;color:#b58aa0">${bet.stake} 🪙 staked &nbsp;·&nbsp; <span style="color:#ff9ad0">${bet.potential_payout} 🪙 to win</span></div>`;
  } else {
    const legs = bet.parlay_bet_legs || [];
    const legRows = legs.map(l => {
      const mkt = l.bet_markets || {};
      return `<div style="padding:4px 0;font-size:12px;border-bottom:1px solid #3a1f3a;display:flex;justify-content:space-between;gap:8px">
        <span style="color:#f6ead8">${escapeHtml(mkt.match_name || '')} — ${escapeHtml(l.selection)}</span>
        <span style="color:#ff9ad0;white-space:nowrap;flex-shrink:0">${l.odds}x</span>
      </div>`;
    }).join('');
    bodyHtml = `
      <div style="font-size:12px;font-weight:700;color:#ff9ad0;letter-spacing:0.06em;margin-bottom:8px">MULTI · ${Number(bet.total_odds).toFixed(2)}x</div>
      <div style="margin-bottom:10px">${legRows}</div>
      <div style="font-size:12px;color:#b58aa0">${bet.stake} 🪙 staked &nbsp;·&nbsp; <span style="color:#ff9ad0">${bet.potential_payout} 🪙 to win</span></div>`;
  }

  return `<div style="
    background:#190d1f;border:2px solid #3a1f3a;border-radius:12px;padding:18px 16px;
    font-family:system-ui,-apple-system,sans-serif;color:#f6ead8;width:100%;box-sizing:border-box">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <span style="font-size:11px;color:#b58aa0;letter-spacing:0.1em">⚽ KICKOFF</span>
      <span style="background:${statusColor}28;border:1px solid ${statusColor};border-radius:4px;padding:2px 9px;font-size:10px;color:${statusColor};letter-spacing:0.08em">${statusLabel}</span>
    </div>
    ${bodyHtml}
  </div>`;
}

function openShareBet(key) {
  const bet = _shareBetData[key];
  if (!bet) return;
  document.getElementById('shareBetPreview').innerHTML = _buildBetCardHtml(key, bet);
  document.getElementById('shareBetMsg').value = '';
  document.getElementById('shareBetOverlay').dataset.key = key;
  document.getElementById('shareBetOverlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('shareBetMsg').focus(), 50);
}

function closeShareBet() {
  document.getElementById('shareBetOverlay').classList.add('hidden');
}

async function doShareBet() {
  const key = document.getElementById('shareBetOverlay').dataset.key;
  if (!_shareBetData[key]) return;

  const userMsg = document.getElementById('shareBetMsg').value.trim();
  const shareUrl = window.location.href;
  const btn = document.getElementById('shareBetBtn');
  btn.disabled = true;
  btn.textContent = '…';

  try {
    const previewEl = document.getElementById('shareBetPreview').firstElementChild;
    const canvas = await html2canvas(previewEl, { backgroundColor: null, scale: 2, useCORS: true, logging: false });
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    const file = new File([blob], 'bet.png', { type: 'image/png' });
    const shareText = userMsg;

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text: shareText, url: shareUrl });
    } else if (navigator.share) {
      await navigator.share({ text: shareText, url: shareUrl });
    } else {
      await navigator.clipboard.writeText(shareText ? `${shareText}\n${shareUrl}` : shareUrl);
      showToast('Link copied!');
    }
    closeShareBet();
  } catch (e) {
    if (e.name !== 'AbortError') showToast('Could not share');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Share';
  }
}

// ─── Custom markets / Bet requests ───────────────────────────────────────────

function loadCustomMarkets(markets) {
  return (markets || []).filter(m => m.market_type === 'custom');
}

function reqOptionRow(label, _odds, removable) {
  return `<div class="req-opt-row">
    <input type="text" class="adm-in req-opt-label" placeholder="Option" maxlength="60" value="${escapeHtml(label)}">
    <button class="btn-ghost req-opt-remove" style="font-size:0.7rem;padding:4px 7px;${removable ? '' : 'visibility:hidden'}" onclick="removeBetRequestOption(this)">✕</button>
  </div>`;
}

function renderRequestBetCard() {
  return `<div class="market-card req-bet-card" id="reqBetCard" data-kickoff="">
    <div class="market-card-header">
      <div class="match-teams" style="flex-direction:column;align-items:flex-start;gap:2px">
        <span style="font-size:0.8rem;font-family:var(--font-pixel);color:var(--green)">Request a Bet</span>
        <span style="font-size:0.7rem;color:var(--muted);font-family:var(--font-body)">Got an idea? Ask the admin to price it up</span>
      </div>
    </div>
    <div id="reqBetCollapsed" class="req-bet-collapsed">
      <button class="odds-btn" style="width:100%;justify-content:center;height:48px" onclick="toggleRequestBet()">
        <span class="odds-price" style="font-size:0.85rem">＋ Add</span>
      </button>
    </div>
    <div id="reqBetExpanded" class="req-bet-expanded" style="display:none">
      <div class="req-bet-input-row">
        <input type="text" id="reqBetInput" class="adm-in req-bet-input"
          placeholder="e.g. England to score first" maxlength="200"
          oninput="document.getElementById('reqBetCount').textContent=this.value.length">
      </div>
      <div id="reqBetOptions">
        ${reqOptionRow('Yes', null, false)}
        ${reqOptionRow('No',  null, false)}
      </div>
      <button class="btn-ghost" style="font-size:0.75rem;margin:4px 0 2px" onclick="addBetRequestOption()">+ Add option</button>
      <div class="req-bet-hint"><span id="reqBetCount">0</span>/200 · Admin reviews before it goes live</div>
      <div class="req-bet-input-row" style="margin-top:6px">
        <button class="adm-btn" onclick="submitBetRequest()">Submit</button>
        <button class="btn-ghost" onclick="toggleRequestBet()">Cancel</button>
      </div>
    </div>
  </div>`;
}

function toggleRequestBet() {
  const collapsed = document.getElementById('reqBetCollapsed');
  const expanded  = document.getElementById('reqBetExpanded');
  if (!collapsed || !expanded) return;
  const isOpen = expanded.style.display !== 'none';
  collapsed.style.display = isOpen ? '' : 'none';
  expanded.style.display  = isOpen ? 'none' : '';
  if (!isOpen) {
    const inp = document.getElementById('reqBetInput');
    if (inp) { inp.value = ''; document.getElementById('reqBetCount').textContent = '0'; inp.focus(); }
    const optEl = document.getElementById('reqBetOptions');
    if (optEl) optEl.innerHTML = reqOptionRow('Yes', null, false) + reqOptionRow('No', null, false);
  }
}

function addBetRequestOption() {
  const optEl = document.getElementById('reqBetOptions');
  if (!optEl) return;
  optEl.insertAdjacentHTML('beforeend', reqOptionRow('', null, true));
  // Show remove buttons on all rows when > 2
  optEl.querySelectorAll('.req-opt-remove').forEach(b => b.style.visibility = '');
}

function removeBetRequestOption(btn) {
  const row = btn.closest('.req-opt-row');
  if (row) row.remove();
  const optEl = document.getElementById('reqBetOptions');
  if (!optEl) return;
  const rows = optEl.querySelectorAll('.req-opt-row');
  // Hide remove buttons when back to 2 rows
  if (rows.length <= 2) rows.forEach(r => r.querySelector('.req-opt-remove').style.visibility = 'hidden');
}

async function submitBetRequest() {
  const inp  = document.getElementById('reqBetInput');
  const text = (inp && inp.value.trim()) || '';
  if (!text) { showToast('Enter an outcome first'); return; }
  if (!_participant || !_tournament) { showToast('Not logged in'); return; }

  // Collect options (labels only — admin sets odds when approving)
  const optRows = document.querySelectorAll('#reqBetOptions .req-opt-row');
  const options = [];
  for (const row of optRows) {
    const label = (row.querySelector('.req-opt-label').value || '').trim();
    if (!label) { showToast('All options need a label'); return; }
    options.push({ label });
  }
  if (options.length < 2) { showToast('Add at least 2 options'); return; }

  const btn = document.querySelector('#reqBetExpanded .adm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

  try {
    const rpcArgs = {
      p_participant_id: _participant.id,
      p_tournament_id:  _tournament.id,
      p_outcome_text:   text,
      p_options_json:   options,
    };
    const { error } = await db.rpc('submit_bet_request', rpcArgs);
    if (error) {
      if (error.message.includes('outcome_text_empty'))    throw new Error('Please enter an outcome');
      if (error.message.includes('outcome_text_too_long')) throw new Error('Max 200 characters');
      if (error.message.includes('participant_not_found')) throw new Error('You are not in this tournament');
      throw error;
    }
    showToast('Request sent! Admin will review it.');
    toggleRequestBet();
  } catch (e) {
    showToast(e.message || 'Failed to submit request');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Submit'; }
  }
}

function renderCustomMarketsSection(customMarkets) {
  const visible = (customMarkets || []).filter(m => m.status === 'open' || m.status === 'closed');
  if (!visible.length) return '';
  return `<div class="bet-section-title">Custom Bets</div>` +
    visible.map(renderCustomMarketCard).join('');
}

function renderAllCustomMarketsSection(customMarkets) {
  const all = (customMarkets || [])
    .filter(m => m.status !== 'settled')
    .sort((a, b) => (b.created_at || '') > (a.created_at || '') ? 1 : -1);
  if (!all.length) return '<div style="padding:1.5rem;text-align:center;color:var(--muted);font-size:0.85rem">No custom bets yet</div>';
  return `<div class="bet-section-title">Custom Bets</div>` +
    all.map(renderCustomMarketCard).join('');
}

function renderCustomMarketCard(market) {
  const o = market.odds_json || {};
  const status    = market.status;
  const isSettled = status === 'settled';
  const isClosed  = status !== 'open';
  const canBet    = !isClosed;
  const s         = market._betStats;

  const statusChip = isSettled
    ? `<span class="market-chip settled">Settled</span>`
    : isClosed
    ? `<span class="market-chip closed">Closed</span>`
    : `<span class="market-chip open">Open</span>`;

  const optionBtns = Object.entries(o).map(([key, price]) =>
    (canBet && price != null)
      ? oddsBtn(market.id, key, key, price, false, isSettled && market.result === key, null, 'custom')
      : oddsTbc(key)
  ).join('');

  const statsLine = s
    ? `<span style="font-size:0.7rem;color:var(--muted)">${s.count} bet${s.count === 1 ? '' : 's'} · 🪙 ${s.totalStake.toLocaleString()} staked</span>`
    : '';

  return `<div class="market-card" id="mc-${market.id}" data-kickoff="">
    <div class="market-card-header">
      <div class="match-teams" style="flex-direction:column;align-items:flex-start;gap:2px">
        <span class="match-name" style="display:block;font-size:0.75rem">${escapeHtml(market.match_name)}</span>
        ${statsLine}
      </div>
      <div class="match-meta">${statusChip}</div>
    </div>
    <div class="match-odds-row">${optionBtns}</div>
  </div>`;
}

async function loadCustomMarketBetStats(tournamentId, marketIds) {
  if (!marketIds.length) return {};
  const { data, error } = await db
    .from('bets')
    .select('market_id, stake')
    .eq('tournament_id', tournamentId)
    .in('market_id', marketIds)
    .neq('status', 'void');
  if (error) throw error;
  const stats = {};
  for (const row of (data || [])) {
    if (!stats[row.market_id]) stats[row.market_id] = { count: 0, totalStake: 0 };
    stats[row.market_id].count++;
    stats[row.market_id].totalStake += row.stake || 0;
  }
  return stats;
}

async function loadBetRequests(tournamentId) {
  const { data, error } = await db
    .from('bet_requests')
    .select('*, participants(nickname)')
    .eq('tournament_id', tournamentId)
    .eq('status', 'pending')
    .order('submitted_at', { ascending: true });
  if (error) throw error;
  return data || [];
}


// ─── Auto-close past kickoff ──────────────────────────────────────────────────

function autoClosePastKickoff() {
  document.querySelectorAll('.market-card[data-kickoff]').forEach(card => {
    const kickoff = card.dataset.kickoff;
    if (!kickoff || new Date(kickoff) > new Date()) return;
    const chip = card.querySelector('.market-chip');
    if (!chip || !chip.classList.contains('open')) return;  // only flip still-open markets
    card.querySelectorAll('.odds-btn, .score-btn').forEach(b => {
      b.disabled = true;
      b.classList.add('disabled');
    });
    chip.className = 'market-chip closed';
    chip.textContent = 'Closed';
  });
}

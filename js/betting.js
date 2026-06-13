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

function buildScoreGrid(matchId) {
  const homeScores = [
    '1-0','2-0','2-1','3-0','3-1','3-2','4-0','4-1','4-2','5-0'
  ];
  const draws = ['0-0','1-1','2-2','3-3'];
  const awayScores = [
    '0-1','0-2','1-2','0-3','1-3','2-3','0-4','1-4','2-4','0-5'
  ];

  function scoreBtn(score) {
    return `<button class="score-btn" data-market-id="${matchId}" data-selection="${score}" data-odds="${csOdds(score)}" onclick="selectBet(this)">
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

// ─── Market reads ─────────────────────────────────────────────────────────────

async function loadOpenMarkets(tournamentId) {
  const { data, error } = await db
    .from('bet_markets')
    .select('*')
    .eq('tournament_id', tournamentId)
    .in('status', ['open', 'closed', 'settled'])
    .order('kickoff_time', { ascending: true, nullsLast: true });
  if (error) throw error;
  return data || [];
}

async function loadMyBets(tournamentId, participantId) {
  const { data, error } = await db
    .from('bets')
    .select('*, bet_markets(match_name, market_type, result, status)')
    .eq('tournament_id', tournamentId)
    .eq('participant_id', participantId)
    .order('placed_at', { ascending: false });
  if (error) throw error;
  return data || [];
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

// ─── Market card rendering ────────────────────────────────────────────────────

// group = { match_result: <market>, correct_score: <market> } for one match.
function renderMatchCard(group) {
  const mr = group.match_result;
  if (!mr) return '';
  const cs = group.correct_score;
  const isClosed  = mr.status !== 'open';
  const isSettled = mr.status === 'settled';
  const o = mr.odds_json || {};
  const kickoff   = formatKickoff(mr.kickoff_time);
  const countdown = formatCountdown(mr.close_time);

  const statusChip = isSettled
    ? `<span class="market-chip settled">Settled</span>`
    : isClosed
    ? `<span class="market-chip closed">Closed</span>`
    : `<span class="market-chip open">${countdown}</span>`;

  return `<div class="market-card" id="mc-${mr.id}" data-kickoff="${mr.close_time || ''}">
    <div class="market-card-header">
      <span class="match-name">${escapeHtml(mr.match_name)}</span>
      <div class="match-meta">
        <span class="kickoff-time">${kickoff}</span>
        ${statusChip}
      </div>
    </div>
    <div class="match-odds-row">
      ${o.home != null ? oddsBtn(mr.id, 'home', 'Home', o.home, isClosed, isSettled && mr.result === 'home') : oddsTbc('Home')}
      ${o.draw != null ? oddsBtn(mr.id, 'draw', 'Draw', o.draw, isClosed, isSettled && mr.result === 'draw') : (isClosed ? '' : oddsTbc('Draw'))}
      ${o.away != null ? oddsBtn(mr.id, 'away', 'Away', o.away, isClosed, isSettled && mr.result === 'away') : oddsTbc('Away')}
    </div>
    ${cs && !isClosed ? `<div class="cs-toggle" onclick="toggleCorrectScore(this)">
      <span>Correct Score</span><span class="cs-arrow">▾</span>
    </div>
    <div class="cs-content hidden" data-cs-market="${cs.id}">
      ${buildScoreGrid(cs.id)}
    </div>` : ''}
  </div>`;
}

function oddsTbc(label) {
  return `<button class="odds-btn disabled" disabled>
    <span class="odds-label">${label}</span>
    <span class="odds-price">TBC</span>
  </button>`;
}

function oddsBtn(marketId, selection, label, price, disabled, isResult) {
  if (price == null) return '';
  const cls = ['odds-btn', disabled ? 'disabled' : '', isResult ? 'result-winner' : ''].filter(Boolean).join(' ');
  return `<button class="${cls}" data-market-id="${marketId}" data-selection="${selection}" data-odds="${price}"
    onclick="selectBet(this)" ${disabled ? 'disabled' : ''}>
    <span class="odds-label">${label}</span>
    <span class="odds-price">${price}</span>
  </button>`;
}

function renderWinnerCard(market) {
  const o = market.odds_json || {};
  const isClosed = market.status !== 'open';
  const isSettled = market.status === 'settled';
  const teams = Object.entries(o).sort((a, b) => a[1] - b[1]);

  return `<div class="market-card winner-card" id="mc-${market.id}">
    <div class="market-card-header">
      <span class="match-name">FIFA World Cup 2026 Winner</span>
      ${isSettled ? '<span class="market-chip settled">Settled</span>' : '<span class="market-chip open">Open</span>'}
    </div>
    <div class="winner-grid">
      ${teams.map(([teamName, price]) => {
        const tla = findTeamTla(teamName);
        const flag = tla ? teamFlagEmoji(tla) : '';
        const isResult = isSettled && market.result === teamName;
        return `<button class="winner-btn${isClosed ? ' disabled' : ''}${isResult ? ' result-winner' : ''}"
          data-market-id="${market.id}" data-selection="${escapeHtml(teamName)}" data-odds="${price}"
          onclick="selectBet(this)" ${isClosed ? 'disabled' : ''}>
          <span class="winner-flag">${flag}</span>
          <span class="winner-name">${escapeHtml(teamName)}</span>
          <span class="winner-price">${price}x</span>
        </button>`;
      }).join('')}
    </div>
  </div>`;
}

function findTeamTla(teamName) {
  const norm = teamName.toLowerCase();
  for (const tla of WC_2026_TEAMS) {
    const fc = getFlagColors(tla);
    if (fc && fc.name && fc.name.toLowerCase().includes(norm.split(' ')[0])) return tla;
  }
  return null;
}

function renderMyBetRow(bet) {
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
    </div>
  </div>`;
}

// ─── Auto-close past kickoff ──────────────────────────────────────────────────

function autoClosePastKickoff() {
  document.querySelectorAll('.market-card[data-kickoff]').forEach(card => {
    const kickoff = card.dataset.kickoff;
    if (!kickoff || new Date(kickoff) > new Date()) return;
    const chip = card.querySelector('.market-chip');
    if (!chip || !chip.classList.contains('open')) return;  // only flip still-open markets
    card.querySelectorAll('.odds-btn, .score-btn, .winner-btn').forEach(b => {
      b.disabled = true;
      b.classList.add('disabled');
    });
    chip.className = 'market-chip closed';
    chip.textContent = 'Closed';
  });
}

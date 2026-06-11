// Leaderboard module — loads participants by coin_balance and subscribes to changes.
// Expects: db (Supabase client), renderAvatar (from avatars.js)

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

let _lbChannel = null;

async function loadLeaderboard(tournamentId) {
  const { data, error } = await db
    .from('participants')
    .select('id, nickname, avatar_type, coin_balance, team_slots')
    .eq('tournament_id', tournamentId)
    .order('coin_balance', { ascending: false });
  if (error) throw error;
  return data;
}

function subscribeLeaderboard(tournamentId, onUpdate) {
  if (_lbChannel) _lbChannel.unsubscribe();
  _lbChannel = db
    .channel(`lb:${tournamentId}`)
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'participants', filter: `tournament_id=eq.${tournamentId}` },
      () => onUpdate())
    .subscribe();
  return _lbChannel;
}

function unsubscribeLeaderboard() {
  if (_lbChannel) { _lbChannel.unsubscribe(); _lbChannel = null; }
}

function renderLeaderboard(rows, myId, container) {
  if (!container) return;
  if (!rows.length) {
    container.innerHTML = '<p class="lb-empty">No participants yet</p>';
    return;
  }

  container.innerHTML = rows.map((p, i) => {
    const medal = RANK_MEDALS[i] || `${i + 1}`;
    const isMe = p.id === myId;
    const avatar = renderAvatar(p.avatar_type, null, 28);
    const balFmt = p.coin_balance.toLocaleString();
    return `<div class="lb-row${isMe ? ' lb-me' : ''}" data-pid="${p.id}">
      <span class="lb-rank">${medal}</span>
      <span class="lb-avatar">${avatar}</span>
      <span class="lb-name">${escapeHtml(p.nickname)}</span>
      <span class="lb-coins" data-val="${p.coin_balance}">🪙 ${balFmt}</span>
    </div>`;
  }).join('');
}

async function refreshLeaderboard(tournamentId, myId, container) {
  const rows = await loadLeaderboard(tournamentId);
  const prevVals = {};
  container.querySelectorAll('[data-pid]').forEach(el => {
    const coinsEl = el.querySelector('.lb-coins');
    if (coinsEl) prevVals[el.dataset.pid] = parseInt(coinsEl.dataset.val, 10);
  });

  renderLeaderboard(rows, myId, container);

  // Briefly flash rows whose balance changed
  rows.forEach(p => {
    if (prevVals[p.id] !== undefined && prevVals[p.id] !== p.coin_balance) {
      const row = container.querySelector(`[data-pid="${p.id}"]`);
      if (!row) return;
      const up = p.coin_balance > prevVals[p.id];
      row.classList.add(up ? 'lb-flash-up' : 'lb-flash-down');
      setTimeout(() => row.classList.remove('lb-flash-up', 'lb-flash-down'), 1200);
    }
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

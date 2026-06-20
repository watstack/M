// Admin control panel for overview.html.
// Requires: config.js, vendor/supabase.js, flag-colors.js, wc2026-fixtures.js
// Exposed as: window.AdminPanel

window.AdminPanel = (function () {
  let _db = null;
  let _code = '';
  let _tournamentId = null;
  let _adminToken = null;
  let _participantId = null;
  let _tournament = null;

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3500);
  }

  const STAGE_LABELS = {
    r32:   'Round of 32',
    r16:   'Round of 16',
    qf:    'Quarter-Finals',
    sf:    'Semi-Finals',
    third: 'Third-Place Play-off',
    final: 'Final',
  };

  function sideDisplay(side) {
    side = side || {};
    if (side.code) {
      const fc = (typeof FLAG_COLORS !== 'undefined' && FLAG_COLORS[side.code]) || null;
      const flag = (typeof teamFlagEmoji === 'function') ? teamFlagEmoji(side.code) : '🏳';
      return { name: (fc && fc.name) || side.code, flag, code: side.code, resolved: true };
    }
    return { name: side.label || 'TBC', flag: '🏳', code: null, resolved: false };
  }

  // ── Data loaders ──────────────────────────────────────────────────────────────

  async function loadMarketsForAdmin() {
    const { data } = await _db
      .from('bet_markets')
      .select('*')
      .eq('tournament_id', _tournamentId)
      .in('status', ['open', 'closed', 'settled'])
      .order('match_no', { ascending: true, nullsLast: true });
    const byNo = {};
    const custom = [];
    for (const m of (data || [])) {
      if (m.match_no != null) {
        (byNo[m.match_no] ||= {})[m.market_type] = m;
      } else {
        custom.push(m);
      }
    }
    return { marketsByNo: byNo, customMarkets: custom };
  }

  async function loadBetRequestsForAdmin() {
    const { data } = await _db
      .from('bet_requests')
      .select('*, participants(nickname)')
      .eq('tournament_id', _tournamentId)
      .eq('status', 'pending')
      .order('submitted_at', { ascending: true });
    return data || [];
  }

  // ── Admin render: match settlement ────────────────────────────────────────────

  function renderAdminView(marketsByNo) {
    marketsByNo = marketsByNo || {};
    const fixtures = (typeof WC2026_FIXTURES !== 'undefined' ? WC2026_FIXTURES : [])
      .slice().sort((a, b) => a.match_no - b.match_no);

    return fixtures.map(fx => {
      const mr = (marketsByNo[fx.match_no] || {}).match_result;
      const homeSide = (mr && mr.home_code) ? { code: mr.home_code } : fx.home;
      const awaySide = (mr && mr.away_code) ? { code: mr.away_code } : fx.away;
      const home = sideDisplay(homeSide), away = sideDisplay(awaySide);
      const resolved = home.resolved && away.resolved;
      const settled  = mr && mr.status === 'settled';
      const isKo     = fx.stage !== 'group';
      const stageLabel = fx.stage === 'group' ? `Grp ${fx.group}` : (STAGE_LABELS[fx.stage] || fx.stage);
      const n = fx.match_no;

      let controls;
      if (settled) {
        controls = `<span class="adm-settled">✓ ${escapeHtml(mr.result || 'settled')}</span>`;
      } else if (resolved) {
        controls = `
          <input class="adm-in adm-score" id="adm-hs-${n}" type="number" min="0" placeholder="H">
          <span class="adm-dash">–</span>
          <input class="adm-in adm-score" id="adm-as-${n}" type="number" min="0" placeholder="A">
          ${isKo ? `<select class="adm-in adm-win" id="adm-win-${n}" title="Who advances">
            <option value="auto">adv: score</option><option value="home">home adv</option><option value="away">away adv</option>
          </select>` : ''}
          <button class="adm-btn" onclick="AdminPanel.settle(${n})">Settle</button>`;
      } else {
        controls = `
          <input class="adm-in adm-code" id="adm-hc-${n}" placeholder="home" maxlength="3">
          <input class="adm-in adm-code" id="adm-ac-${n}" placeholder="away" maxlength="3">
          <button class="adm-btn" onclick="AdminPanel.resolve(${n})">Resolve</button>`;
      }

      return `<div class="admin-row">
        <div class="admin-meta"><span class="adm-no">#${n}</span><span class="adm-stage">${stageLabel}</span></div>
        <div class="admin-name">${home.flag} ${escapeHtml(home.name)} <span class="adm-v">v</span> ${escapeHtml(away.name)} ${away.flag}</div>
        <div class="admin-ctrls">${controls}</div>
      </div>`;
    }).join('');
  }

  function renderAdminCustomMarketsView(customMarkets) {
    const markets = (customMarkets || []).filter(m => m.status !== 'settled');
    if (!markets.length) return '';
    const rows = markets.map(m => {
      const text = escapeHtml(m.match_name || '');
      const mid  = m.id;
      return `<div class="admin-row">
        <div class="admin-meta">
          <span class="adm-no" style="font-size:0.5rem">Custom</span>
          <span class="adm-stage">custom</span>
        </div>
        <div class="admin-name" style="font-size:0.75rem">"${text}"</div>
        <div class="admin-ctrls">
          <select class="adm-in adm-win" id="adm-custom-result-${mid}">
            ${Object.keys(m.odds_json || {}).map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)} wins</option>`).join('')}
          </select>
          <button class="adm-btn" onclick="AdminPanel.settleCustomMarket('${mid}')">Settle</button>
        </div>
      </div>`;
    }).join('');
    return `<div class="bet-section-title" style="margin-top:20px">Custom Market Settlement</div>${rows}`;
  }

  // ── Admin render: bet requests ────────────────────────────────────────────────

  function renderAdminBetRequestRow(req) {
    const nick = escapeHtml((req.participants && req.participants.nickname) || '?');
    const text = escapeHtml(req.outcome_text || '');
    const id   = req.id;
    const proposed = req.proposed_options;

    let optionInputs;
    if (proposed && proposed.length >= 2) {
      optionInputs = proposed.map(opt => {
        const label = escapeHtml(opt.label || '');
        const odds  = opt.odds != null ? opt.odds : 2;
        return `<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px">
          <span style="font-size:0.7rem;min-width:50px;color:var(--muted)">${label}</span>
          <input class="adm-in adm-score req-opt-adm" style="width:52px" type="number" min="1.01" step="0.01"
            data-label="${label}" data-req-id="${id}" value="${odds}" placeholder="Odds">
        </div>`;
      }).join('');
    } else {
      optionInputs = `<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px">
          <span style="font-size:0.7rem;min-width:50px;color:var(--muted)">Yes</span>
          <input class="adm-in adm-score req-opt-adm" style="width:52px" type="number" min="1.01" step="0.01"
            data-label="Yes" data-req-id="${id}" value="2" placeholder="Odds">
        </div>
        <div style="display:flex;align-items:center;gap:4px;margin-bottom:3px">
          <span style="font-size:0.7rem;min-width:50px;color:var(--muted)">No</span>
          <input class="adm-in adm-score req-opt-adm" style="width:52px" type="number" min="1.01" step="0.01"
            data-label="No" data-req-id="${id}" value="2" placeholder="Odds">
        </div>`;
    }

    return `<div class="admin-row req-row" id="adm-req-row-${id}">
      <div class="admin-meta">
        <span class="adm-no" style="font-size:0.55rem;word-break:break-all">${nick}</span>
        <span class="adm-stage">request</span>
      </div>
      <div class="admin-name" style="font-size:0.75rem">"${text}"</div>
      <div class="admin-ctrls" style="flex-direction:column;align-items:flex-start">
        <div id="adm-req-opts-${id}" style="margin-bottom:4px">${optionInputs}</div>
        <div style="display:flex;gap:4px">
          <button class="adm-btn" onclick="AdminPanel.approveBetRequest('${id}')">Approve</button>
          <button class="btn-ghost" style="font-size:0.55rem;padding:5px 8px" onclick="AdminPanel.rejectBetRequest('${id}')">Reject</button>
        </div>
      </div>
    </div>`;
  }

  // ── Admin render: participants ────────────────────────────────────────────────

  async function loadAdminParticipants() {
    const el = document.getElementById('admPanelParticipants');
    if (!el) return;
    el.innerHTML = '<p class="admin-hint">Loading…</p>';
    try {
      const { data, error } = await _db
        .from('participants')
        .select('id, nickname, coin_balance, cans_owed, is_admin, avatar_type')
        .eq('tournament_id', _tournamentId)
        .order('nickname');
      if (error) throw error;
      if (!data || !data.length) { el.innerHTML = '<p class="admin-hint">No participants found.</p>'; return; }
      el.innerHTML = data.map(p => `
        <div class="adm-p-row">
          <span class="adm-p-name">${escapeHtml(p.nickname)}${p.is_admin ? ' <span style="font-size:0.7rem;color:var(--green)">⚙</span>' : ''}</span>
          <div>
            <span class="adm-p-label">🪙 coins</span>
            <input class="adm-in adm-score" style="width:80px" type="number" min="0" id="adm-coins-${p.id}" value="${p.coin_balance}">
          </div>
          <div>
            <span class="adm-p-label">🍺 cans</span>
            <input class="adm-in adm-score" style="width:56px" type="number" min="0" id="adm-cans-${p.id}" value="${p.cans_owed || 0}">
          </div>
          <button class="adm-btn" onclick="AdminPanel.saveParticipant('${p.id}')">Save</button>
        </div>`).join('');
    } catch (e) {
      el.innerHTML = `<p class="admin-hint">Error: ${escapeHtml(e.message)}</p>`;
    }
  }

  // ── Accordion toggle ──────────────────────────────────────────────────────────

  function toggleAdminAccordion(toggleEl) {
    const content = toggleEl.nextElementSibling;
    const open = content.classList.toggle('hidden') === false;
    toggleEl.classList.toggle('open', open);
  }

  // ── Push notifications ────────────────────────────────────────────────────────

  let _pushSub = null;
  let _vapidKey = null;

  async function initPushNotifications() {
    const el = document.getElementById('admPanelNotif');
    if (!el) return;
    if (!('PushManager' in window) || !('serviceWorker' in navigator)) {
      el.innerHTML = '<p class="admin-hint">Push notifications not supported in this browser.</p>';
      return;
    }
    try {
      const _cfgBase = (window.CONFIG && window.CONFIG.API_BASE) || '';
      const r = await fetch(`${_cfgBase}/api/push-config`);
      if (r.ok) _vapidKey = (await r.json()).publicKey;
    } catch (_) {}
    const reg = await navigator.serviceWorker.ready;
    _pushSub = await reg.pushManager.getSubscription();
    renderPushToggle(!!_pushSub);
  }

  function renderPushToggle(isEnabled) {
    const el = document.getElementById('admPanelNotif');
    if (!el) return;
    const denied = Notification.permission === 'denied';
    const hint = isEnabled
      ? 'Active on this device'
      : denied
        ? 'Blocked — open browser Settings → Notifications to allow'
        : 'Get notified when a player submits a bet request';
    el.innerHTML = `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <button class="adm-btn" id="admNotifBtn" onclick="AdminPanel.togglePush()">
        ${isEnabled ? 'Disable notifications' : 'Enable notifications'}
      </button>
      <span style="font-size:0.75rem;color:var(--muted)">${hint}</span>
    </div>`;
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw     = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }

  async function togglePushNotification() {
    const btn = document.getElementById('admNotifBtn');
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    const _apiBase = (window.CONFIG && window.CONFIG.API_BASE) || '';
    try {
      const reg = await navigator.serviceWorker.ready;
      if (_pushSub) {
        await _pushSub.unsubscribe();
        await fetch(`${_apiBase}/api/subscribe-push`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({ code: _code, action: 'unsubscribe', subscription: { endpoint: _pushSub.endpoint } },
            _adminToken ? { adminToken: _adminToken } : { participantId: _participantId })),
        });
        _pushSub = null;
        renderPushToggle(false);
        showToast('Notifications disabled');
      } else {
        if (Notification.permission !== 'granted') {
          const perm = await Notification.requestPermission();
          if (perm !== 'granted') { showToast('Notifications blocked — check browser settings'); renderPushToggle(false); return; }
        }
        if (!_vapidKey) { showToast('Push not configured on server'); renderPushToggle(false); return; }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(_vapidKey),
        });
        const r = await fetch(`${_apiBase}/api/subscribe-push`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({ code: _code, action: 'subscribe', subscription: sub.toJSON() },
            _adminToken ? { adminToken: _adminToken } : { participantId: _participantId })),
        });
        if (!r.ok) { await sub.unsubscribe(); throw new Error('Server rejected subscription'); }
        _pushSub = sub;
        renderPushToggle(true);
        showToast('Notifications enabled!');
      }
    } catch (e) {
      showToast(e.message || 'Failed to update notifications');
      if (btn) { btn.disabled = false; }
    }
  }

  // ── Assign admin modal ────────────────────────────────────────────────────────

  async function openAssignAdminModal() {
    const modal = document.getElementById('ovAssignAdminModal');
    const list  = document.getElementById('ovAssignAdminList');
    if (!modal || !list) return;
    list.innerHTML = '<p class="admin-hint">Loading…</p>';
    modal.style.display = 'flex';
    try {
      const { data } = await _db
        .from('participants')
        .select('id, nickname, avatar_type, is_admin')
        .eq('tournament_id', _tournamentId)
        .order('nickname');
      list.innerHTML = (data || []).map(p => {
        const isMe       = p.id === _participantId;
        const statusColor = p.is_admin ? 'var(--green)' : 'rgba(255,255,255,.35)';
        const statusLabel = p.is_admin ? '⚙ Admin' : 'User';
        const toggleLabel = p.is_admin ? 'Remove' : 'Make admin';
        const meTag = isMe ? `<span style="color:var(--gold);font-size:0.72rem;margin-left:4px">(you)</span>` : '';
        return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.07)">
          <span style="flex:1;font-size:0.9rem">${escapeHtml(p.nickname)}${meTag}</span>
          <span style="font-size:0.72rem;color:${statusColor};font-weight:700;min-width:52px;text-align:right">${statusLabel}</span>
          ${!isMe ? `<button class="btn-ghost" style="font-size:0.75rem;padding:4px 10px" onclick="AdminPanel.setAdmin('${p.id}',${!p.is_admin})">${toggleLabel}</button>` : ''}
        </div>`;
      }).join('');
    } catch (e) {
      list.innerHTML = `<p class="admin-hint">Error: ${escapeHtml(e.message)}</p>`;
    }
  }

  // ── Main refresh ──────────────────────────────────────────────────────────────

  async function refresh() {
    try {
      const [{ marketsByNo, customMarkets }, betRequests] = await Promise.all([
        loadMarketsForAdmin(),
        loadBetRequestsForAdmin(),
      ]);

      // Match settlement
      const settlementEl = document.getElementById('admPanelMatchSettlement');
      if (settlementEl) {
        settlementEl.innerHTML = renderAdminView(marketsByNo) + renderAdminCustomMarketsView(customMarkets);
      }

      // Bet requests
      const reqListEl = document.getElementById('admPanelBetRequests');
      const reqAccEl  = document.getElementById('admAccRequests');
      if (reqListEl) {
        if (betRequests.length) {
          if (reqAccEl) reqAccEl.style.display = '';
          reqListEl.innerHTML = betRequests.map(renderAdminBetRequestRow).join('');
        } else {
          if (reqAccEl) reqAccEl.style.display = 'none';
          reqListEl.innerHTML = '';
        }
      }

      // Participants
      await loadAdminParticipants();

      // Push notifications
      await initPushNotifications();
    } catch (e) {
      console.error('[admin] refresh error', e);
    }
  }

  // ── Public actions ────────────────────────────────────────────────────────────

  async function startDraw() {
    const btn = document.getElementById('admStartDrawBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Starting…'; }
    try {
      const { error } = await _db.rpc('start_draw', { p_code: _code, p_admin_token: _adminToken });
      if (error) throw error;
      showToast('Draw started! Go to the bracket to watch →');
      if (btn) btn.textContent = 'Draw running…';
    } catch (e) {
      showToast('Error: ' + (e.message || String(e)));
      if (btn) { btn.disabled = false; btn.textContent = '🎲 Start draw'; }
    }
  }

  async function reopenTournament() {
    if (!confirm('This will reset the draw. Continue?')) return;
    try {
      const { error } = await _db.rpc('reopen_tournament', { p_code: _code, p_admin_token: _adminToken });
      if (error) throw error;
      showToast('Draw reset.');
      const startBtn  = document.getElementById('admStartDrawBtn');
      const reopenBtn = document.getElementById('admReopenBtn');
      if (startBtn)  { startBtn.style.display = ''; startBtn.disabled = false; startBtn.textContent = '🎲 Start draw'; }
      if (reopenBtn) reopenBtn.style.display = 'none';
    } catch (e) {
      showToast('Error: ' + (e.message || String(e)));
    }
  }

  async function adminSettle(matchNo) {
    const hs = parseInt((document.getElementById(`adm-hs-${matchNo}`) || {}).value, 10);
    const as_ = parseInt((document.getElementById(`adm-as-${matchNo}`) || {}).value, 10);
    if (Number.isNaN(hs) || Number.isNaN(as_)) { showToast('Enter both scores'); return; }
    const winSel = document.getElementById(`adm-win-${matchNo}`);
    const body = _adminToken
      ? { code: _code, adminToken: _adminToken, matchNo, homeScore: hs, awayScore: as_ }
      : { code: _code, participantId: _participantId, matchNo, homeScore: hs, awayScore: as_ };
    if (winSel && winSel.value !== 'auto') body.winner = winSel.value;
    try {
      const r = await fetch('/api/settle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Settle failed');
      showToast(`Settled #${matchNo}: ${j.settled} market(s)${j.propagated && j.propagated.length ? `, advanced ${j.propagated.join(',')}` : ''}`);
      await refresh();
    } catch (e) { showToast(e.message); }
  }

  async function adminResolve(matchNo) {
    const hc = ((document.getElementById(`adm-hc-${matchNo}`) || {}).value || '').trim().toUpperCase();
    const ac = ((document.getElementById(`adm-ac-${matchNo}`) || {}).value || '').trim().toUpperCase();
    if (!hc && !ac) { showToast('Enter at least one team code'); return; }
    const body = _adminToken
      ? { code: _code, adminToken: _adminToken, matchNo }
      : { code: _code, participantId: _participantId, matchNo };
    if (hc) body.homeCode = hc;
    if (ac) body.awayCode = ac;
    try {
      const r = await fetch('/api/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Resolve failed');
      showToast(`Resolved #${matchNo}`);
      await refresh();
    } catch (e) { showToast(e.message); }
  }

  async function adminSettleCustomMarket(marketId) {
    const sel = document.getElementById(`adm-custom-result-${marketId}`);
    if (!sel) return;
    const result = sel.value;
    try {
      const { error } = await _db.rpc('settle_market', { p_market_id: marketId, p_result: result });
      if (error) throw error;
      showToast(`Custom market settled: ${escapeHtml(result)} wins!`);
      await refresh();
    } catch (e) { showToast(e.message || 'Settle failed'); }
  }

  async function approveBetRequest(requestId) {
    const optInputs = document.querySelectorAll(`#adm-req-opts-${requestId} .req-opt-adm`);
    const oddsJson  = {};
    for (const el of optInputs) {
      const label = el.dataset.label;
      const odds  = parseFloat(el.value);
      if (!label || isNaN(odds) || odds < 1.01) {
        showToast('Enter valid odds (min 1.01) for all options');
        return;
      }
      oddsJson[label] = odds;
    }
    if (Object.keys(oddsJson).length < 2) {
      showToast('Need at least 2 options with odds');
      return;
    }
    try {
      const rpcArgs = { p_code: _code, p_request_id: requestId, p_odds_json: oddsJson };
      if (_adminToken) rpcArgs.p_admin_token    = _adminToken;
      else             rpcArgs.p_participant_id = _participantId;
      const { error } = await _db.rpc('approve_bet_request', rpcArgs);
      if (error) {
        if (error.message.includes('request_not_found')) throw new Error('Request not found or already handled');
        if (error.message.includes('odds_too_low'))      throw new Error('Odds must be at least 1.01');
        throw error;
      }
      showToast('Approved! Custom market is now live.');
      await refresh();
    } catch (e) { showToast(e.message || 'Failed to approve'); }
  }

  async function rejectBetRequest(requestId) {
    try {
      const rpcArgs = { p_code: _code, p_request_id: requestId };
      if (_adminToken) rpcArgs.p_admin_token    = _adminToken;
      else             rpcArgs.p_participant_id = _participantId;
      const { error } = await _db.rpc('reject_bet_request', rpcArgs);
      if (error) throw error;
      showToast('Request rejected.');
      const row = document.getElementById(`adm-req-row-${requestId}`);
      if (row) row.remove();
      const reqListEl = document.getElementById('admPanelBetRequests');
      const reqAccEl  = document.getElementById('admAccRequests');
      if (reqListEl && reqAccEl && !reqListEl.querySelector('.req-row')) {
        reqAccEl.style.display = 'none';
      }
    } catch (e) { showToast(e.message || 'Failed to reject'); }
  }

  async function saveParticipant(participantId) {
    const coins = parseInt((document.getElementById(`adm-coins-${participantId}`) || {}).value, 10);
    const cans  = parseInt((document.getElementById(`adm-cans-${participantId}`) || {}).value, 10);
    if (Number.isNaN(coins) || Number.isNaN(cans)) { showToast('Enter valid numbers'); return; }
    try {
      let data, error;
      if (_adminToken) {
        ({ data, error } = await _db.rpc('admin_update_participant', {
          p_code: _code, p_admin_token: _adminToken,
          p_participant_id: participantId, p_coin_balance: coins, p_cans_owed: cans,
        }));
      } else {
        ({ data, error } = await _db.rpc('participant_update_participant', {
          p_code: _code, p_actor_participant_id: _participantId,
          p_target_participant_id: participantId, p_coin_balance: coins, p_cans_owed: cans,
        }));
      }
      if (error) throw error;
      if (!data) throw new Error('Unauthorized or participant not found');
      showToast('Saved');
    } catch (e) { showToast(e.message); }
  }

  async function removeParticipant(participantId) {
    if (!confirm('Remove this participant? This cannot be undone.')) return;
    try {
      const { error } = await _db.rpc('remove_participant', {
        p_tournament_code: _code, p_admin_token: _adminToken, p_participant_id: participantId,
      });
      if (error) throw error;
      showToast('Participant removed.');
      await loadAdminParticipants();
    } catch (e) { showToast('Error: ' + (e.message || String(e))); }
  }

  async function setAdmin(targetId, newVal) {
    try {
      const rpc  = _adminToken ? 'set_participant_admin' : 'participant_set_admin';
      const args = _adminToken
        ? { p_code: _code, p_admin_token: _adminToken, p_participant_id: targetId, p_is_admin: newVal }
        : { p_code: _code, p_actor_participant_id: _participantId, p_target_participant_id: targetId, p_is_admin: newVal };
      const { data, error } = await _db.rpc(rpc, args);
      if (error || !data) throw error || new Error('Permission denied');
      showToast(newVal ? 'Admin granted.' : 'Admin removed.');
      openAssignAdminModal();
    } catch (e) { showToast('Error: ' + (e.message || String(e))); }
  }

  // ── Init ──────────────────────────────────────────────────────────────────────

  function init({ db, code, tournamentId, tournament, adminToken, participantId }) {
    _db            = db;
    _code          = code;
    _tournamentId  = tournamentId;
    _tournament    = tournament || null;
    _adminToken    = adminToken;
    _participantId = participantId;
    refresh();
  }

  return {
    init,
    refresh,
    settle:              n   => adminSettle(n),
    resolve:             n   => adminResolve(n),
    settleCustomMarket:  id  => adminSettleCustomMarket(id),
    approveBetRequest:   id  => approveBetRequest(id),
    rejectBetRequest:    id  => rejectBetRequest(id),
    saveParticipant:     id  => saveParticipant(id),
    removeParticipant:   id  => removeParticipant(id),
    setAdmin:            (id, v) => setAdmin(id, v),
    openAssignAdminModal: () => openAssignAdminModal(),
    toggleAccordion:     el  => toggleAdminAccordion(el),
    togglePush:          ()  => togglePushNotification(),
    startDraw:           ()  => startDraw(),
    reopenTournament:    ()  => reopenTournament(),
  };
})();

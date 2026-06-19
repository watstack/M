// overview.html page controller.
// Requires: config.js, vendor/supabase.js, flag-colors.js, avatars.js, wc2026-fixtures.js

(function () {
  let db = null;
  let _tournament = null;

  function initDb() {
    if (typeof CONFIG !== 'undefined' && CONFIG.SUPABASE_URL && window.supabase) {
      db = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    }
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3500);
  }

  function activate(id) {
    document.querySelectorAll('.ov-state').forEach(s => s.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
  }

  function sanitizeNickname(raw) {
    const clean = raw.replace(/[<>&"]/g, '').trim().slice(0, 20);
    if (clean.length < 2) return null;
    if (!/^[\w\s\-'.]+$/u.test(clean)) return null;
    return clean;
  }

  function formatKickoff(utcStr) {
    const d = new Date(utcStr);
    const now = new Date();
    const diffMs = d - now;
    if (diffMs <= 0) return null;

    const diffH = diffMs / 3600000;
    if (diffH < 1) return `In ${Math.round(diffMs / 60000)}m`;

    const timeStr = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
                     .replace(':00', '');
    const nowMid = new Date(now); nowMid.setHours(0, 0, 0, 0);
    const tomMid = new Date(nowMid); tomMid.setDate(nowMid.getDate() + 1);
    const dayAfter = new Date(tomMid); dayAfter.setDate(tomMid.getDate() + 1);

    if (d >= nowMid && d < tomMid)  return `Today ${timeStr}`;
    if (d >= tomMid && d < dayAfter) return `Tomorrow ${timeStr}`;
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function overviewUrl(code) {
    const base = window.location.pathname.replace(/\/[^/]*$/, '');
    return `${window.location.origin}${base}/overview.html?code=${code}`;
  }

  // ── State: error ─────────────────────────────────────────────────────────────
  function showError(msg) {
    document.getElementById('errorMsg').textContent = msg || 'Something went wrong.';
    activate('stateError');
  }

  // ── State: join form ─────────────────────────────────────────────────────────
  function renderJoinState(tournament, allParticipants) {
    const code = tournament.code;
    document.getElementById('joinTourneyName').textContent = tournament.name;

    const claimed  = allParticipants.reduce((sum, p) => sum + (p.team_slots || 0), 0);
    const remaining = 48 - claimed;
    document.getElementById('joinSlotsInfo').textContent =
      `${remaining} team${remaining !== 1 ? 's' : ''} remaining · max ${tournament.teams_per_person} per player`;

    const grid = document.getElementById('avatarGrid');
    let selectedAvatar = 1;
    grid.innerHTML = (typeof AVATARS !== 'undefined' ? AVATARS : []).map(a =>
      `<div class="avatar-option${a.id === 1 ? ' selected' : ''}" data-av="${a.id}" onclick="ovSelectAvatar(${a.id})">
        ${typeof renderAvatar === 'function' ? renderAvatar(a.id, null, 52) : ''}
        <span class="avatar-option-label">${esc(a.label)}</span>
      </div>`
    ).join('');

    window.ovSelectAvatar = function (id) {
      selectedAvatar = id;
      document.querySelectorAll('.avatar-option').forEach(el =>
        el.classList.toggle('selected', parseInt(el.dataset.av) === id));
    };

    const sel = document.getElementById('slotsSelect');
    const max = Math.min(tournament.teams_per_person, remaining);
    sel.innerHTML = '';
    for (let i = 1; i <= Math.max(1, max); i++) {
      sel.innerHTML += `<option value="${i}">${i} team${i > 1 ? 's' : ''}</option>`;
    }
    sel.value = Math.min(tournament.teams_per_person, max);
    document.getElementById('slotsHint').textContent =
      `Max ${tournament.teams_per_person} teams per player · ${remaining} of 48 still unclaimed`;

    const joinBtn = document.getElementById('joinBtn');
    // Clone to strip old listeners
    const freshBtn = joinBtn.cloneNode(true);
    joinBtn.parentNode.replaceChild(freshBtn, joinBtn);

    freshBtn.addEventListener('click', async () => {
      const nickname = document.getElementById('nicknameInput').value;
      const slots    = parseInt(sel.value, 10);
      const errEl    = document.getElementById('nicknameError');
      errEl.classList.remove('show');

      const sanitized = sanitizeNickname(nickname);
      if (!sanitized) {
        errEl.textContent = 'Please enter a nickname (2–20 chars, letters/numbers/spaces).';
        errEl.classList.add('show');
        return;
      }

      const spinner = document.getElementById('joinSpinner');
      freshBtn.disabled = true;
      spinner.classList.add('show');

      try {
        const { data: participant, error } = await db.from('participants')
          .insert({ tournament_id: tournament.id, nickname: sanitized, avatar_type: selectedAvatar, team_slots: slots })
          .select().single();

        if (error) {
          if (error.code === '23505') throw new Error('That nickname is already taken in this sweepstake!');
          throw error;
        }

        localStorage.setItem(`wc26_${code}`, participant.id);
        const _joined = JSON.parse(localStorage.getItem('wc26_my_joined') || '[]');
        if (!_joined.find(t => t.code === code)) {
          _joined.unshift({ code, name: tournament.name, joinedAt: Date.now() });
          localStorage.setItem('wc26_my_joined', JSON.stringify(_joined));
        }

        showToast('Welcome, ' + sanitized + '! 🎉');
        renderWaitingState(tournament, participant.id);
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.add('show');
        freshBtn.disabled = false;
        spinner.classList.remove('show');
      }
    });

    activate('stateJoin');
  }

  // ── State: waiting room (joined, draw not yet started) ────────────────────────
  function renderWaitingState(tournament, myParticipantId) {
    const url = overviewUrl(tournament.code);
    document.getElementById('waitTourneyName').textContent = tournament.name;
    document.getElementById('waitShareUrl').textContent    = url;
    document.getElementById('waitBracketLink').href = `sweepstake.html?code=${tournament.code}`;

    const copyBtn = document.getElementById('waitCopyBtn');
    const freshCopy = copyBtn.cloneNode(true);
    copyBtn.parentNode.replaceChild(freshCopy, copyBtn);
    freshCopy.addEventListener('click', () => {
      navigator.clipboard.writeText(url).then(() => {
        freshCopy.textContent = 'Copied!';
        freshCopy.classList.add('copied');
        setTimeout(() => { freshCopy.textContent = 'Copy'; freshCopy.classList.remove('copied'); }, 2000);
      });
    });

    activate('stateWaiting');
  }

  // ── Match / fixture helpers ───────────────────────────────────────────────────
  const STAGE_LABELS = {
    group: 'Group stage', r32: 'Round of 32', r16: 'Round of 16',
    qf: 'Quarter-final', sf: 'Semi-final', third: 'Third place', final: 'Final',
  };

  function stageLabel(f) {
    if (f.stage === 'group') return f.group ? `Group ${f.group}` : 'Group stage';
    return STAGE_LABELS[f.stage] || 'Knockout';
  }

  function sideName(side) {
    if (!side) return 'TBC';
    if (side.code) {
      const fc = (typeof getFlagColors === 'function') ? getFlagColors(side.code) : null;
      return (fc && fc.name) || side.code;
    }
    return side.label || 'TBC';
  }
  function sideFlag(side) {
    return (side && side.code && typeof teamFlagEmoji === 'function') ? teamFlagEmoji(side.code) : '🏳';
  }

  // Map a bet selection to a human label using the fixture's teams.
  function selectionLabel(sel, f) {
    if (sel === 'home') return sideName(f.home);
    if (sel === 'away') return sideName(f.away);
    if (sel === 'draw') return 'Draw';
    return sel; // correct-score etc.
  }

  // Short, friendly countdown for list rows: "2d", "5h 12m", "44m", "3m", "Live".
  function cdShort(ms) {
    if (ms <= 0) return 'Live';
    const m = Math.floor(ms / 60000);
    if (m >= 1440) return `${Math.floor(m / 1440)}d`;
    if (m >= 60)   return `${Math.floor(m / 60)}h ${m % 60}m`;
    return `${m}m`;
  }

  function fixtureById(no) {
    return (window.WC2026_FIXTURES || []).find(f => f.match_no === no) || null;
  }

  // ── State: live overview dashboard ────────────────────────────────────────────
  let _ticker = null;
  let _heroCtx = null; // { teamSet, pendingByMatchNo } — used by carousel

  // Populate the header switcher when this device is in 2+ tournaments.
  function renderTournamentSwitcher(currentCode) {
    const sel = document.getElementById('ovTourneySwitch');
    if (!sel || typeof getMyTournaments !== 'function') return;

    const list = getMyTournaments();
    const cur = String(currentCode || '').toUpperCase();
    // Ensure the current tournament is in the list even if not yet persisted.
    if (cur && !list.some(t => t.code === cur)) {
      list.unshift({ code: cur, name: _tournament?.name || cur, ts: Date.now() });
    }
    if (list.length < 2) { sel.hidden = true; return; }

    sel.innerHTML = list.map(t =>
      `<option value="${esc(t.code)}"${t.code === cur ? ' selected' : ''}>${esc(t.name)} (${esc(t.code)})</option>`
    ).join('');
    sel.hidden = false;

    sel.onchange = () => {
      const code = sel.value;
      if (code && code !== cur) {
        window.location.href = 'overview.html?code=' + encodeURIComponent(code);
      }
    };
  }

  async function renderOverviewState(tournament, myParticipantId) {
    const code = tournament.code;
    const bracketHref = `sweepstake.html?code=${code}`;
    const betHref     = `betting.html?code=${code}`;
    document.getElementById('ovTourneyName').textContent = tournament.name;
    document.getElementById('ovCode').textContent = code;
    document.getElementById('ovBracketTopBtn').href = bracketHref;
    document.getElementById('ovBetTopBtn').href     = betHref;
    renderTournamentSwitcher(code);

    activate('stateOverview');

    try {
      const tid = tournament.id;

      const [myPRes, allocRes, pendingRes, settledRes, settledParlaysRes, matchesRes] = await Promise.all([
        db.from('participants').select('coin_balance, nickname').eq('id', myParticipantId).single(),
        db.from('allocations').select('team_code, team_name').eq('tournament_id', tid).eq('participant_id', myParticipantId),
        db.from('bets').select('selection, stake, potential_payout, odds, bet_markets(match_no)').eq('participant_id', myParticipantId).eq('tournament_id', tid).eq('status', 'pending'),
        db.from('bets').select('status, stake, potential_payout').eq('participant_id', myParticipantId).eq('tournament_id', tid).in('status', ['won', 'lost']).order('placed_at', { ascending: false }),
        db.from('parlay_bets').select('status, stake, potential_payout').eq('participant_id', myParticipantId).eq('tournament_id', tid).in('status', ['won', 'lost']).order('placed_at', { ascending: false }),
        db.from('wc_matches').select('home_tla, away_tla, home_score, away_score, status'),
      ]);

      const myP         = myPRes.data;
      const allocations = allocRes.data  || [];
      const pendingBets = pendingRes.data || [];
      const settledBets = [...(settledRes.data || []), ...(settledParlaysRes.data || [])];

      const balance     = myP?.coin_balance ?? null;
      const myTeamCodes = allocations.map(a => a.team_code);
      const teamSet     = new Set(myTeamCodes);

      const pendingByMatchNo = {};
      for (const bet of pendingBets) {
        const mn = bet.bet_markets?.match_no;
        if (mn) pendingByMatchNo[mn] = bet;
      }

      // ── Sweepstake card ──
      const teamsEl = document.getElementById('ovTeams');
      if (myTeamCodes.length && typeof teamFlagEmoji === 'function' && typeof getFlagColors === 'function') {
        teamsEl.innerHTML = allocations.map(a => {
          const c = getFlagColors(a.team_code);
          return `<span class="team-pill" style="background:${c.primary};color:${c.secondary || '#fff'}">${teamFlagEmoji(a.team_code)} ${esc(a.team_name)}</span>`;
        }).join('');
      } else {
        teamsEl.innerHTML = '';
      }
      // ── Betting card ──
      document.getElementById('ovBalance').textContent = (balance !== null) ? `🪙 ${balance}` : '—';
      renderBetStats(pendingBets, settledBets);

      // ── Fixture carousel ──
      const matchesByKey = {};
      for (const m of (matchesRes.data || [])) {
        matchesByKey[`${m.home_tla}_${m.away_tla}`] = m;
      }
      _heroCtx = { teamSet, pendingByMatchNo, matchesByKey };
      renderFixtureCarousel(teamSet, pendingByMatchNo, matchesByKey);
      startTicker();
    } catch (err) {
      console.error('[overview] hydrate error', err);
    }
  }

  // Bet stats grid: pending / won / lost with counts and coin totals.
  function renderBetStats(pendingBets, settledBets) {
    const el = document.getElementById('ovBetStats');
    const wonBets  = settledBets.filter(b => b.status === 'won');
    const lostBets = settledBets.filter(b => b.status === 'lost');

    const pendingStake = pendingBets.reduce((s, b) => s + (b.stake || 0), 0);
    const wonPayout    = wonBets.reduce((s, b) => s + (b.potential_payout || 0), 0);
    const lostStake    = lostBets.reduce((s, b) => s + (b.stake || 0), 0);

    const row = (label, cls, count, coinText) =>
      `<div class="hub-bet-stat-row">
        <span class="hub-bet-stat-label">${label}</span>
        <span class="hub-bet-stat-val">${count} bet${count !== 1 ? 's' : ''}</span>
        <span class="hub-bet-stat-pill ${cls}">${coinText}</span>
      </div>`;

    el.innerHTML =
      row('Pending', 'pending', pendingBets.length, `🪙 ${pendingStake}`) +
      row('Won',     'won',     wonBets.length,      `+🪙 ${wonPayout}`) +
      row('Lost',    'lost',    lostBets.length,     `-🪙 ${lostStake}`);
  }

  const LIVE_WINDOW_MS = 130 * 60000;

  // Horizontal fixture carousel — all 104 fixtures, auto-scrolled to current position.
  function renderFixtureCarousel(teamSet, pendingByMatchNo, matchesByKey) {
    const el = document.getElementById('ovFixCarousel');
    if (!el) return;
    const now = Date.now();
    const all = (window.WC2026_FIXTURES || [])
      .slice()
      .sort((a, b) => new Date(a.kickoff_utc) - new Date(b.kickoff_utc));

    if (!all.length) { el.innerHTML = ''; return; }

    el.innerHTML = all.map(f => {
      const ko       = new Date(f.kickoff_utc).getTime();
      const matchKey = f.home.code && f.away.code ? `${f.home.code}_${f.away.code}` : null;
      const matchData = matchKey ? (matchesByKey || {})[matchKey] : null;
      const dbStatus = matchData?.status;
      const isPast = dbStatus === 'FINISHED' || (!dbStatus && ko <= now && (now - ko) >= LIVE_WINDOW_MS);
      const isLive = (dbStatus === 'IN_PLAY' || dbStatus === 'PAUSED') ||
                     (!dbStatus && ko <= now && (now - ko) < LIVE_WINDOW_MS);
      const isMy   = (f.home.code && teamSet.has(f.home.code)) || (f.away.code && teamSet.has(f.away.code));
      const hasBet = !!pendingByMatchNo[f.match_no];
      const classes = ['fix-card',
        isPast ? 'past-card' : '',
        isLive ? 'live-card' : '',
        isMy   ? 'my-card'   : '',
      ].filter(Boolean).join(' ');

      // Date label — always shown
      const d = new Date(f.kickoff_utc);
      const todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
      const tomMid = new Date(todayMid); tomMid.setDate(todayMid.getDate() + 1);
      const dayAfterMid = new Date(tomMid); dayAfterMid.setDate(tomMid.getDate() + 1);
      const timeStr = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(':00', '');
      let dateLabel;
      if (d >= todayMid && d < tomMid) dateLabel = `Today ${timeStr}`;
      else if (d >= tomMid && d < dayAfterMid) dateLabel = `Tomorrow ${timeStr}`;
      else dateLabel = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const dateHtml = `<div class="fix-card-time">${dateLabel}</div>`;

      // Score / status area
      let scoreHtml = '';
      if (isLive) {
        const mins = Math.floor((now - ko) / 60000);
        const hs = matchData?.home_score ?? null;
        const as = matchData?.away_score ?? null;
        const scorePart = (hs !== null && as !== null) ? `${hs}-${as} ` : '';
        scoreHtml = `<div class="fix-card-score live">${scorePart}${mins}'</div>`;
      } else if (isPast && matchData) {
        const hs = matchData.home_score ?? null;
        const as = matchData.away_score ?? null;
        if (hs !== null && as !== null) {
          scoreHtml = `<div class="fix-card-score">${hs}-${as}</div>`;
        }
      }

      return `<div class="${classes}">
        <div class="fix-card-teams">
          <span>${sideFlag(f.home)}</span>
          <span>${sideFlag(f.away)}</span>
        </div>
        ${scoreHtml}
        ${dateHtml}
        ${hasBet ? `<div class="fix-card-bet">🪙</div>` : ''}
      </div>`;
    }).join('');

    // Auto-scroll to first live or upcoming card
    const firstCurrent = el.querySelector('.fix-card:not(.past-card)');
    if (firstCurrent) {
      requestAnimationFrame(() => {
        firstCurrent.scrollIntoView({ inline: 'start', behavior: 'instant', block: 'nearest' });
      });
    }
  }

  function venueShort(venue) {
    if (!venue) return 'TBC';
    const parts = venue.split(',');
    return (parts[parts.length - 1] || venue).trim();
  }

  // Shared upcoming-match row markup. Time updates live via [data-kickoff].
  function matchRow({ flags, teams, sub, kickoff }) {
    return `<div class="hub-row">
      <span class="hub-row-flags">${flags}</span>
      <div class="hub-row-main">
        <div class="hub-row-teams">${teams}</div>
        ${sub ? `<div class="hub-row-sub">${sub}</div>` : ''}
      </div>
      <div class="hub-row-time">
        <span class="cd" data-kickoff="${kickoff}"></span>
      </div>
    </div>`;
  }

  // ── Ticker ────────────────────────────────────────────────────────────────────
  function tick() {
    const now = Date.now();
    document.querySelectorAll('#stateOverview .hub-row-time .cd[data-kickoff]').forEach(el => {
      const ms = new Date(el.dataset.kickoff).getTime() - now;
      el.textContent = cdShort(ms);
      el.classList.toggle('soon', ms > 0 && ms <= 3600000);
    });
  }

  function startTicker() {
    if (_ticker) clearInterval(_ticker);
    tick();
    _ticker = setInterval(tick, 1000);
  }

  // ── State: spectator (live but not joined) ────────────────────────────────────
  function renderSpectatorState(tournament) {
    document.getElementById('specTourneyName').textContent  = tournament.name;
    document.getElementById('specBracketLink').href = `sweepstake.html?code=${tournament.code}`;
    activate('stateSpectator');
  }

  // ── Init ──────────────────────────────────────────────────────────────────────
  async function init() {
    initDb();

    const params = new URLSearchParams(window.location.search);
    const code   = (params.get('code') || '').toUpperCase();

    // Support #me= deep-link for participant ID
    const meMatch = window.location.hash.match(/me=([0-9a-fA-F-]+)/);
    if (meMatch && code) {
      localStorage.setItem(`wc26_${code}`, meMatch[1]);
      history.replaceState(null, '', location.pathname + location.search);
    }

    if (!code) {
      showError('No tournament code in the link. Ask your admin for the correct invite link.');
      return;
    }
    if (!db) {
      showError('Failed to connect to the database. Please refresh the page.');
      return;
    }

    // Fetch tournament
    let tournament;
    try {
      const { data, error } = await db.from('tournaments').select('*').eq('code', code).single();
      if (error || !data) {
        showError('Sweepstake not found — double-check the invite link.');
        return;
      }
      tournament = data;
    } catch (err) {
      showError('Error loading sweepstake: ' + (err?.message || String(err)));
      return;
    }

    document.title = `${tournament.name} — Kickoff`;
    const myParticipantId = localStorage.getItem(`wc26_${code}`);

    if (tournament.status === 'live' || tournament.status === 'drawing') {
      if (myParticipantId) {
        await renderOverviewState(tournament, myParticipantId);
      } else {
        renderSpectatorState(tournament);
      }
      return;
    }

    // status === 'open'
    if (myParticipantId) {
      const { data: existing } = await db.from('participants')
        .select('id').eq('id', myParticipantId).eq('tournament_id', tournament.id).single();
      if (existing) {
        renderWaitingState(tournament, myParticipantId);
        return;
      }
      // Stale session — clear and fall through to join
      localStorage.removeItem(`wc26_${code}`);
    }

    const { data: allParticipants } = await db.from('participants')
      .select('team_slots').eq('tournament_id', tournament.id);
    renderJoinState(tournament, allParticipants || []);
  }

  document.addEventListener('DOMContentLoaded', init);
})();

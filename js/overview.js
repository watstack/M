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

  // ── State: live overview dashboard ────────────────────────────────────────────
  async function renderOverviewState(tournament, myParticipantId) {
    const code = tournament.code;
    document.getElementById('ovTourneyName').textContent = tournament.name;
    document.getElementById('ovCode').textContent = code;
    document.getElementById('ovBracketLink').href = `sweepstake.html?code=${code}`;
    document.getElementById('ovBetLink').href     = `betting.html?code=${code}`;
    document.getElementById('ovMeta').textContent = 'Loading…';
    document.getElementById('ovTeams').innerHTML  = '';
    document.getElementById('ovMatches').innerHTML = '<div class="ov-loading">Loading…</div>';
    document.getElementById('ovResults').style.display = 'none';

    activate('stateOverview');

    try {
      const tid = tournament.id;

      // Core data — required for match spine and rank
      const [allPRes, myPRes, allocRes] = await Promise.all([
        db.from('participants').select('id, coin_balance').eq('tournament_id', tid).order('coin_balance', { ascending: false }),
        db.from('participants').select('coin_balance, nickname').eq('id', myParticipantId).single(),
        db.from('allocations').select('team_code, team_name').eq('tournament_id', tid).eq('participant_id', myParticipantId),
      ]);

      const allParticipants = allPRes.data  || [];
      const myP             = myPRes.data;
      const allocations     = allocRes.data  || [];

      // Bets — optional; degrade gracefully if betting schema isn't available
      let pendingBets = [], settledBets = [];
      try {
        const [pendingRes, settledRes] = await Promise.all([
          db.from('bets').select('selection, stake, potential_payout, bet_markets(match_no)').eq('participant_id', myParticipantId).eq('tournament_id', tid).eq('status', 'pending'),
          db.from('bets').select('selection, stake, potential_payout, status, bet_markets(match_no, match_name)').eq('participant_id', myParticipantId).eq('tournament_id', tid).in('status', ['won', 'lost']).order('created_at', { ascending: false }).limit(4),
        ]);
        pendingBets = pendingRes.data || [];
        settledBets = settledRes.data || [];
      } catch (_) { /* bets unavailable — matches still render without overlay */ }

      const balance     = myP?.coin_balance ?? null;
      const myTeamCodes = allocations.map(a => a.team_code);

      let rank = null;
      if (balance !== null && allParticipants.length) {
        rank = allParticipants.filter(p => p.coin_balance > balance).length + 1;
      }

      const pendingByMatchNo = {};
      for (const bet of pendingBets) {
        const mn = bet.bet_markets?.match_no;
        if (mn) pendingByMatchNo[mn] = bet;
      }

      // Meta row (rank + balance)
      const medals = ['🥇', '🥈', '🥉'];
      const parts  = [];
      if (rank !== null) parts.push(`${medals[rank - 1] || `#${rank}`} of ${allParticipants.length}`);
      if (balance !== null) parts.push(`🪙 ${balance}`);
      document.getElementById('ovMeta').textContent = parts.join('  ·  ') || '';

      // Teams row
      const teamsEl = document.getElementById('ovTeams');
      if (myTeamCodes.length && typeof teamFlagEmoji === 'function' && typeof getFlagColors === 'function') {
        teamsEl.innerHTML = allocations.map(a => {
          const c = getFlagColors(a.team_code);
          return `<span class="team-pill" style="background:${c.primary};color:${c.secondary || '#fff'}">${teamFlagEmoji(a.team_code)} ${esc(a.team_name)}</span>`;
        }).join('');
      }

      // Upcoming matches
      renderUpcomingMatches(myTeamCodes, pendingByMatchNo);

      // Settled bets
      if (settledBets.length) {
        const listEl = document.getElementById('ovResultsList');
        listEl.innerHTML = settledBets.map(bet => {
          const won = bet.status === 'won';
          const net = won ? bet.potential_payout - bet.stake : bet.stake;
          return `<div class="ov-result-row">
            <span class="ov-result-icon ${won ? 'ov-won' : 'ov-lost'}">${won ? '✓' : '✗'}</span>
            <span class="ov-result-sel">${esc(bet.selection)}</span>
            <span class="ov-result-coins ${won ? 'ov-won' : 'ov-lost'}">${won ? '+' : '-'}🪙${net}</span>
          </div>`;
        }).join('');
        document.getElementById('ovResults').style.display = 'block';
      }
    } catch (err) {
      document.getElementById('ovMeta').textContent = '';
      document.getElementById('ovMatches').innerHTML = '<div class="ov-empty">Could not load data — try refreshing.</div>';
      console.error('[overview] hydrate error', err);
    }
  }

  function renderUpcomingMatches(myTeamCodes, pendingByMatchNo) {
    const el = document.getElementById('ovMatches');
    if (!window.WC2026_FIXTURES) {
      el.innerHTML = '<div class="ov-empty">Match data unavailable.</div>';
      return;
    }

    const now     = Date.now();
    const teamSet = new Set(myTeamCodes);

    const relevant = WC2026_FIXTURES
      .filter(f => {
        if (new Date(f.kickoff_utc) <= now) return false;
        const hc = f.home.code, ac = f.away.code;
        return (hc && teamSet.has(hc)) || (ac && teamSet.has(ac)) || !!pendingByMatchNo[f.match_no];
      })
      .sort((a, b) => new Date(a.kickoff_utc) - new Date(b.kickoff_utc))
      .slice(0, 4);

    if (!relevant.length) {
      el.innerHTML = '<div class="ov-empty">No upcoming matches for your teams.</div>';
      return;
    }

    el.innerHTML = relevant.map(f => {
      const kickoff = formatKickoff(f.kickoff_utc);
      const hc = f.home.code, ac = f.away.code;
      const hName  = hc || f.home.label  || 'TBC';
      const aName  = ac || f.away.label  || 'TBC';
      const hFlag  = (hc && typeof teamFlagEmoji === 'function') ? teamFlagEmoji(hc) : '⬜';
      const aFlag  = (ac && typeof teamFlagEmoji === 'function') ? teamFlagEmoji(ac) : '⬜';
      const isMyTeam = (hc && teamSet.has(hc)) || (ac && teamSet.has(ac));
      const bet    = pendingByMatchNo[f.match_no];

      let badges = '';
      if (isMyTeam) badges += `<span class="ov-badge-team">▷ Your team</span>`;
      if (bet)      badges += `<span class="ov-badge-bet">${esc(bet.selection)} · 🪙${bet.stake} → 🪙${bet.potential_payout}</span>`;

      return `<div class="ov-match">
        <div class="ov-match-top">
          <span class="ov-match-flag">${hFlag}</span>
          <span class="ov-match-name">${esc(hName)} vs ${esc(aName)}</span>
          <span class="ov-match-flag">${aFlag}</span>
          ${kickoff ? `<span class="ov-match-time">${kickoff}</span>` : ''}
        </div>
        ${badges ? `<div class="ov-match-badges">${badges}</div>` : ''}
      </div>`;
    }).join('');
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

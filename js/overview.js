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

  // Precise ticking countdown for the hero: "HH:MM:SS" or "Xd HH:MM".
  function cdLong(ms) {
    if (ms <= 0) return null;
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = n => String(n).padStart(2, '0');
    if (d > 0) return `${d}d ${pad(h)}:${pad(m)}`;
    return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  }

  // Absolute date + time, e.g. "Wed 24 Jun, 8pm" — shown alongside the
  // countdown for matches that aren't kicking off soon.
  function formatDateTime(utcStr) {
    const d = new Date(utcStr);
    if (isNaN(d)) return '';
    const day  = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    const time = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(':00', '');
    return `${day}, ${time}`;
  }

  function fixtureById(no) {
    return (window.WC2026_FIXTURES || []).find(f => f.match_no === no) || null;
  }

  // ── State: live overview dashboard ────────────────────────────────────────────
  let _ticker = null;
  let _heroCtx = null;

  async function renderOverviewState(tournament, myParticipantId) {
    const code = tournament.code;
    const bracketHref = `sweepstake.html?code=${code}`;
    const betHref     = `betting.html?code=${code}`;
    document.getElementById('ovTourneyName').textContent = tournament.name;
    document.getElementById('ovCode').textContent = code;
    document.getElementById('ovBracketLink').href = bracketHref;
    document.getElementById('ovBracketBtn').href  = bracketHref;
    document.getElementById('ovBetLink').href     = betHref;
    document.getElementById('ovBetBtn').href       = betHref;
    document.getElementById('ovSweepMatches').innerHTML = '<div class="ov-loading">Loading…</div>';
    document.getElementById('ovBetMatches').innerHTML   = '<div class="ov-loading">Loading…</div>';

    activate('stateOverview');

    try {
      const tid = tournament.id;

      const [allPRes, myPRes, allocRes, pendingRes, settledRes] = await Promise.all([
        db.from('participants').select('id, coin_balance').eq('tournament_id', tid).order('coin_balance', { ascending: false }),
        db.from('participants').select('coin_balance, nickname').eq('id', myParticipantId).single(),
        db.from('allocations').select('team_code, team_name').eq('tournament_id', tid).eq('participant_id', myParticipantId),
        db.from('bets').select('selection, stake, potential_payout, odds, bet_markets(match_no)').eq('participant_id', myParticipantId).eq('tournament_id', tid).eq('status', 'pending'),
        db.from('bets').select('status').eq('participant_id', myParticipantId).eq('tournament_id', tid).in('status', ['won', 'lost']).order('created_at', { ascending: false }),
      ]);

      const allParticipants = allPRes.data  || [];
      const myP             = myPRes.data;
      const allocations     = allocRes.data  || [];
      const pendingBets     = pendingRes.data || [];
      const settledBets     = settledRes.data || [];

      const balance     = myP?.coin_balance ?? null;
      const myTeamCodes = allocations.map(a => a.team_code);
      const teamSet     = new Set(myTeamCodes);

      let rank = null;
      if (balance !== null && allParticipants.length) {
        rank = allParticipants.filter(p => p.coin_balance > balance).length + 1;
      }

      const pendingByMatchNo = {};
      for (const bet of pendingBets) {
        const mn = bet.bet_markets?.match_no;
        if (mn) pendingByMatchNo[mn] = bet;
      }

      // ── Sweepstake card ──
      const medals = ['🥇', '🥈', '🥉'];
      document.getElementById('ovRank').textContent =
        (rank !== null) ? `${medals[rank - 1] || `#${rank}`} of ${allParticipants.length}` : '—';

      const teamsEl = document.getElementById('ovTeams');
      if (myTeamCodes.length && typeof teamFlagEmoji === 'function' && typeof getFlagColors === 'function') {
        teamsEl.innerHTML = allocations.map(a => {
          const c = getFlagColors(a.team_code);
          return `<span class="team-pill" style="background:${c.primary};color:${c.secondary || '#fff'}">${teamFlagEmoji(a.team_code)} ${esc(a.team_name)}</span>`;
        }).join('');
      } else {
        teamsEl.innerHTML = '';
      }
      renderSweepMatches(teamSet);

      // ── Betting card ──
      document.getElementById('ovBalance').textContent = (balance !== null) ? `🪙 ${balance}` : '—';
      renderBetBar(pendingBets.length, settledBets);
      renderBetMatches(pendingBets, pendingByMatchNo);

      // ── Hero (next kickoff) — ticks live ──
      _heroCtx = { teamSet, pendingByMatchNo };
      startTicker();
    } catch (err) {
      document.getElementById('ovSweepMatches').innerHTML = '<div class="hub-empty">Could not load — try refreshing.</div>';
      document.getElementById('ovBetMatches').innerHTML   = '<div class="hub-empty">Could not load — try refreshing.</div>';
      console.error('[overview] hydrate error', err);
    }
  }

  // Sweepstake card: upcoming matches involving the player's teams.
  function renderSweepMatches(teamSet) {
    const el = document.getElementById('ovSweepMatches');
    const now = Date.now();
    const rows = (window.WC2026_FIXTURES || [])
      .filter(f => {
        if (new Date(f.kickoff_utc).getTime() <= now) return false;
        return (f.home.code && teamSet.has(f.home.code)) || (f.away.code && teamSet.has(f.away.code));
      })
      .sort((a, b) => new Date(a.kickoff_utc) - new Date(b.kickoff_utc))
      .slice(0, 3);

    if (!rows.length) {
      el.innerHTML = `<div class="hub-empty">No upcoming matches for your teams right now.</div>`;
      return;
    }

    el.innerHTML = rows.map(f => {
      const hMine = f.home.code && teamSet.has(f.home.code);
      const aMine = f.away.code && teamSet.has(f.away.code);
      const hName = `<span class="${hMine ? 'me' : ''}">${esc(sideName(f.home))}</span>`;
      const aName = `<span class="${aMine ? 'me' : ''}">${esc(sideName(f.away))}</span>`;
      return matchRow({
        flags: sideFlag(f.home) + sideFlag(f.away),
        teams: `${hName} v ${aName}`,
        sub: `${stageLabel(f)} · ${esc(venueShort(f.venue))}`,
        kickoff: f.kickoff_utc,
      });
    }).join('');
  }

  // Betting card: open bets (or upcoming matches to bet on if none yet).
  function renderBetMatches(pendingBets, pendingByMatchNo) {
    const el = document.getElementById('ovBetMatches');
    const labelEl = document.getElementById('ovBetListLabel');
    const now = Date.now();

    if (pendingBets.length) {
      labelEl.textContent = 'Your open bets';
      const rows = pendingBets
        .map(bet => ({ bet, f: fixtureById(bet.bet_markets?.match_no) }))
        .filter(x => x.f)
        .sort((a, b) => new Date(a.f.kickoff_utc) - new Date(b.f.kickoff_utc))
        .slice(0, 4);

      if (rows.length) {
        el.innerHTML = rows.map(({ bet, f }) => {
          const pick = selectionLabel(bet.selection, f);
          const odds = bet.odds ? `${bet.odds}x · ` : '';
          return matchRow({
            flags: sideFlag(f.home) + sideFlag(f.away),
            teams: `${esc(sideName(f.home))} v ${esc(sideName(f.away))}`,
            sub: `<span class="win">${esc(pick)}</span> · ${odds}🪙${bet.stake} → 🪙${bet.potential_payout}`,
            kickoff: f.kickoff_utc,
          });
        }).join('');
        return;
      }
    }

    // No open bets — nudge with the next couple of matches to bet on.
    labelEl.textContent = 'Coming up';
    const upcoming = (window.WC2026_FIXTURES || [])
      .filter(f => new Date(f.kickoff_utc).getTime() > now)
      .sort((a, b) => new Date(a.kickoff_utc) - new Date(b.kickoff_utc))
      .slice(0, 2);
    const list = upcoming.map(f => matchRow({
      flags: sideFlag(f.home) + sideFlag(f.away),
      teams: `${esc(sideName(f.home))} v ${esc(sideName(f.away))}`,
      sub: `${stageLabel(f)} · ${esc(venueShort(f.venue))}`,
      kickoff: f.kickoff_utc,
    })).join('');
    el.innerHTML = `<div class="hub-empty">No open bets yet — back a team before kickoff.</div>${list}`;
  }

  // Compact betting summary bar: open count, W–L record, recent form.
  function renderBetBar(openCount, settledBets) {
    const el = document.getElementById('ovBetBar');
    const wins   = settledBets.filter(b => b.status === 'won').length;
    const losses = settledBets.filter(b => b.status === 'lost').length;
    const parts = [`<span><b>${openCount}</b> open</span>`];
    if (settledBets.length) {
      parts.push(`<span><b>${wins}</b>W <b>${losses}</b>L</span>`);
      const form = settledBets.slice(0, 5).map(b =>
        b.status === 'won'
          ? `<span class="hub-form-dot w">W</span>`
          : `<span class="hub-form-dot l">L</span>`
      ).join('');
      parts.push(`<span class="hub-form">${form}</span>`);
    }
    el.innerHTML = parts.join('');
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
        <span class="date" hidden>${formatDateTime(kickoff)}</span>
      </div>
    </div>`;
  }

  // ── Hero next-match picker + live ticker ──────────────────────────────────────
  // Prefer a match in progress (kicked off within the live window); otherwise the
  // next match to kick off, tournament-wide — regardless of bets or teams.
  const LIVE_WINDOW_MS = 130 * 60000;
  function pickHeroFixture(now) {
    let live = null, liveKo = 0, next = null, nextKo = Infinity;
    for (const f of (window.WC2026_FIXTURES || [])) {
      const ko = new Date(f.kickoff_utc).getTime();
      if (isNaN(ko)) continue;
      const diff = ko - now;
      if (diff <= 0) {
        if (diff > -LIVE_WINDOW_MS && ko > liveKo) { live = f; liveKo = ko; }
      } else if (ko < nextKo) { next = f; nextKo = ko; }
    }
    return live ? { fixture: live, ko: liveKo, live: true }
                : (next ? { fixture: next, ko: nextKo, live: false } : null);
  }

  function renderHero(now) {
    const card = document.getElementById('ovNextMatch');
    const pick = pickHeroFixture(now);
    if (!pick) { card.hidden = true; return; }
    card.hidden = false;

    const f = pick.fixture;
    const ctx = _heroCtx || { teamSet: new Set(), pendingByMatchNo: {} };

    document.getElementById('nmHomeFlag').textContent = sideFlag(f.home);
    document.getElementById('nmAwayFlag').textContent = sideFlag(f.away);
    document.getElementById('nmHomeName').textContent = sideName(f.home);
    document.getElementById('nmAwayName').textContent = sideName(f.away);
    document.getElementById('nmStage').textContent    = stageLabel(f);

    const eyebrow = document.getElementById('nmEyebrow');
    const cdEl    = document.getElementById('nmCountdown');
    const whenEl  = document.getElementById('nmWhen');

    if (pick.live) {
      const mins = Math.floor((now - pick.ko) / 60000);
      eyebrow.textContent = 'Live now';
      eyebrow.classList.add('live');
      cdEl.classList.add('live');
      cdEl.textContent = mins >= 0 && mins < 130 ? `${mins}'` : 'LIVE';
      whenEl.textContent = `Kicked off · ${venueShort(f.venue)}`;
    } else {
      eyebrow.textContent = '⚡ Next kickoff';
      eyebrow.classList.remove('live');
      cdEl.classList.remove('live');
      cdEl.textContent = cdLong(pick.ko - now) || '00:00:00';
      whenEl.textContent = `${formatKickoff(f.kickoff_utc) || 'Soon'} · ${venueShort(f.venue)}`;
    }

    let tags = '';
    const isMyTeam = (f.home.code && ctx.teamSet.has(f.home.code)) ||
                     (f.away.code && ctx.teamSet.has(f.away.code));
    if (isMyTeam) tags += `<span class="nm-tag team">▷ Your team</span>`;
    if (ctx.pendingByMatchNo[f.match_no]) tags += `<span class="nm-tag bet">⚡ You've bet</span>`;
    document.getElementById('nmTags').innerHTML = tags;
  }

  function tick() {
    const now = Date.now();
    renderHero(now);
    document.querySelectorAll('#stateOverview .hub-row-time').forEach(cell => {
      const el = cell.querySelector('.cd');
      if (!el) return;
      const ms = new Date(el.dataset.kickoff).getTime() - now;
      el.textContent = cdShort(ms);
      el.classList.toggle('soon', ms > 0 && ms <= 3600000);
      // Far-off matches: show the calendar date too, so "2d" isn't the only cue.
      const dt = cell.querySelector('.date');
      if (dt) dt.hidden = !(ms > 86400000);
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
